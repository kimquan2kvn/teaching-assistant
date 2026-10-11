import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, FilterQuery, Model, Types } from 'mongoose';
import type { CreateTimetableSlotInput, UpdateTimetableSlotInput } from '@so-chu-nhiem/shared';
import { Position } from '../database/schemas/position.schema';
import { TimetableSlot } from '../database/schemas/timetable-slot.schema';
import { addDays, formatDateOnly, minDate } from '../common/utils/date';
import { runInTransaction } from '../common/utils/transaction';
import { LessonLogEngineService } from '../lesson-logs/lesson-log-engine.service';
import { LessonLogsService, TeacherWeekLogView, TeacherWeekPosition } from '../lesson-logs/lesson-logs.service';

const SUBJECT_ONLY_MESSAGE = 'Chỉ vị trí giáo viên bộ môn mới có thời khóa biểu và PPCT';
const SLOT_NOT_FOUND_MESSAGE = 'Không tìm thấy tiết trong thời khóa biểu';
const TO_BEFORE_FROM_MESSAGE = 'Ngày kết thúc hiệu lực không được trước ngày bắt đầu hiệu lực';
const SAME_POSITION_CONFLICT_MESSAGE = 'Tiết này đã có trong thời khóa biểu của môn trong khoảng thời gian trùng';
const TEACHER_CONFLICT_MESSAGE = 'Bạn đã có tiết khác vào thời điểm này';

interface SlotWindow {
  dayOfWeek: number;
  period: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export interface TeacherWeekSlotView {
  _id: string;
  positionId: string;
  dayOfWeek: number;
  period: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  position: TeacherWeekPosition;
}

export interface TeacherWeekView {
  weekStart: string;
  weekEnd: string;
  slots: TeacherWeekSlotView[];
  lessonLogs: TeacherWeekLogView[];
}

@Injectable()
export class TimetableSlotsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(TimetableSlot.name) private readonly timetableSlotModel: Model<TimetableSlot>,
    @InjectModel(Position.name) private readonly positionModel: Model<Position>,
    private readonly engine: LessonLogEngineService,
    private readonly lessonLogsService: LessonLogsService,
  ) {}

  // Position HOMEROOM không bao giờ có slot (mọi thao tác ghi bị từ chối) nên đọc luôn ra rỗng.
  async list(positionId: string): Promise<TimetableSlot[]> {
    return this.timetableSlotModel
      .find({ positionId })
      .sort({ dayOfWeek: 1, period: 1, effectiveFrom: 1, _id: 1 })
      .exec();
  }

  // Lưới tuần của giáo viên: slot + lesson log của mọi vị trí SUBJECT đang giữ (vị trí được lấy 1 lần cho cả hai).
  // Slot hiệu lực giao với tuần [weekStart, weekEnd]: effectiveFrom <= weekEnd và (effectiveTo null hoặc >= weekStart).
  async getMyWeek(userId: string, weekStart: Date): Promise<TeacherWeekView> {
    const weekEnd = addDays(weekStart, 6);
    const positions = await this.lessonLogsService.listTeacherSubjectPositions(userId);
    const [slots, lessonLogs] = await Promise.all([
      this.listSlotsInWeek(positions, weekStart, weekEnd),
      this.lessonLogsService.listForPositionsInWeek(positions, weekStart),
    ]);
    return { weekStart: formatDateOnly(weekStart), weekEnd: formatDateOnly(weekEnd), slots, lessonLogs };
  }

  // Mọi thao tác ghi: kiểm tra trùng + ghi slot + tính lại sổ báo giảng cùng 1 transaction, tính lại lỗi thì slot
  // cũng không được lưu. Callback có thể bị withTransaction chạy lại nên mọi trạng thái đều đọc lại bên trong.
  async create(position: Position, input: CreateTimetableSlotInput): Promise<TimetableSlot> {
    this.assertSubjectPosition(position);
    const window: SlotWindow = {
      dayOfWeek: input.dayOfWeek,
      period: input.period,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
    };

    return runInTransaction(this.connection, async (session) => {
      await this.assertNoConflict(position, window, null, session);
      const [slot] = await this.timetableSlotModel.create([{ positionId: position._id, ...window }], { session });
      await this.engine.recalculate(String(position._id), window.effectiveFrom, session);
      return slot;
    });
  }

  async update(position: Position, slotId: string, input: UpdateTimetableSlotInput): Promise<TimetableSlot> {
    this.assertSubjectPosition(position);

    return runInTransaction(this.connection, async (session) => {
      const slot = await this.requireSlot(position, slotId, session);

      // Schema dùng chung chỉ so sánh khi gửi đủ 2 ngày; gửi 1 ngày thì phải so với giá trị đã lưu.
      const window: SlotWindow = {
        dayOfWeek: input.dayOfWeek ?? slot.dayOfWeek,
        period: input.period ?? slot.period,
        effectiveFrom: input.effectiveFrom ?? slot.effectiveFrom,
        effectiveTo: input.effectiveTo === undefined ? slot.effectiveTo : input.effectiveTo,
      };
      if (window.effectiveTo && window.effectiveTo.getTime() < window.effectiveFrom.getTime()) {
        throw new BadRequestException(TO_BEFORE_FROM_MESSAGE);
      }

      await this.assertNoConflict(position, window, slot._id, session);

      // Khoảng bị ảnh hưởng bắt đầu từ ngày hiệu lực sớm hơn giữa giá trị cũ và mới.
      const fromDate = minDate(slot.effectiveFrom, window.effectiveFrom);
      slot.set(window);
      await slot.save({ session });
      await this.engine.recalculate(String(position._id), fromDate, session);
      return slot;
    });
  }

  async remove(position: Position, slotId: string): Promise<{ deleted: true }> {
    this.assertSubjectPosition(position);

    return runInTransaction(this.connection, async (session) => {
      const slot = await this.requireSlot(position, slotId, session);
      await this.timetableSlotModel.deleteOne({ _id: slot._id }, { session });
      await this.engine.recalculate(String(position._id), slot.effectiveFrom, session);
      return { deleted: true as const };
    });
  }

  private async listSlotsInWeek(
    positions: TeacherWeekPosition[],
    weekStart: Date,
    weekEnd: Date,
  ): Promise<TeacherWeekSlotView[]> {
    if (positions.length === 0) return [];

    const slots = await this.timetableSlotModel
      .find({
        positionId: { $in: positions.map((position) => position._id) },
        effectiveFrom: { $lte: weekEnd },
        $or: [{ effectiveTo: null }, { effectiveTo: { $gte: weekStart } }],
      })
      .sort({ dayOfWeek: 1, period: 1, effectiveFrom: 1, _id: 1 })
      .exec();
    const positionById = new Map(positions.map((position) => [position._id, position]));
    return slots.map((slot) => ({
      _id: String(slot._id),
      positionId: String(slot.positionId),
      dayOfWeek: slot.dayOfWeek,
      period: slot.period,
      effectiveFrom: slot.effectiveFrom,
      effectiveTo: slot.effectiveTo,
      position: positionById.get(String(slot.positionId)) as TeacherWeekPosition,
    }));
  }

  private assertSubjectPosition(position: Position): void {
    if (position.type !== 'SUBJECT') {
      throw new BadRequestException(SUBJECT_ONLY_MESSAGE);
    }
  }

  // PositionOwnerGuard chỉ xác nhận positionId, không xác nhận slotId thuộc position đó (IDOR qua id con) nên
  // luôn lọc theo cả positionId; id không phải ObjectId hợp lệ cũng ra 404 thay vì CastError.
  private async requireSlot(position: Position, slotId: string, session: ClientSession): Promise<TimetableSlot> {
    const slot = Types.ObjectId.isValid(slotId)
      ? await this.timetableSlotModel.findOne({ _id: slotId, positionId: position._id }).session(session)
      : null;
    if (!slot) throw new NotFoundException(SLOT_NOT_FOUND_MESSAGE);
    return slot;
  }

  // Hai khoảng hiệu lực [from, to] (to = null là không giới hạn) chồng nhau khi a.from <= b.to và b.from <= a.to.
  // Giáo viên không thể dạy 2 nơi cùng lúc nên còn kiểm tra các position KHÁC của cùng người đang giữ; position
  // đang trống (holderId = null, vd ADMIN ghi hộ) thì không có "giáo viên" để đối chiếu.
  private async assertNoConflict(
    position: Position,
    window: SlotWindow,
    excludeSlotId: Types.ObjectId | null,
    session: ClientSession,
  ): Promise<void> {
    const overlap: FilterQuery<TimetableSlot> = {
      dayOfWeek: window.dayOfWeek,
      period: window.period,
      ...(window.effectiveTo ? { effectiveFrom: { $lte: window.effectiveTo } } : {}),
      $or: [{ effectiveTo: null }, { effectiveTo: { $gte: window.effectiveFrom } }],
    };

    const samePositionConflict = await this.timetableSlotModel
      .exists({
        ...overlap,
        positionId: position._id,
        ...(excludeSlotId ? { _id: { $ne: excludeSlotId } } : {}),
      })
      .session(session);
    if (samePositionConflict) throw new ConflictException(SAME_POSITION_CONFLICT_MESSAGE);

    if (!position.holderId) return;
    const otherPositions = await this.positionModel
      .find({ holderId: position.holderId, _id: { $ne: position._id } })
      .select('_id')
      .session(session);
    if (otherPositions.length === 0) return;

    const teacherConflict = await this.timetableSlotModel
      .exists({ ...overlap, positionId: { $in: otherPositions.map((other) => other._id) } })
      .session(session);
    if (teacherConflict) throw new ConflictException(TEACHER_CONFLICT_MESSAGE);
  }
}
