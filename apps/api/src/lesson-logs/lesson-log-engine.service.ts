import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Class } from '../database/schemas/class.schema';
import { Holiday } from '../database/schemas/holiday.schema';
import { LessonLog } from '../database/schemas/lesson-log.schema';
import { Position } from '../database/schemas/position.schema';
import { PpctItem } from '../database/schemas/ppct-item.schema';
import { SchoolYear } from '../database/schemas/school-year.schema';
import { TimetableSlot } from '../database/schemas/timetable-slot.schema';
import { Clock } from '../common/utils/clock';
import { maxDate, todayDateOnlyVN } from '../common/utils/date';
import { runInTransaction } from '../common/utils/transaction';
import { buildCells, computeLessonSchedule, reserveKeptLogs, SchedulePpctItem } from './engine/lesson-schedule';

// Mốc rất sớm: recalculate() kẹp lại về SchoolYear.startDate, dùng cho lần xếp đầu tiên của 1 position.
const FROM_START_OF_YEAR = new Date(0);

const LOCKED_LOG_FILTER = { $or: [{ isManuallyAdjusted: true }, { done: true }] };

interface PositionYearContext {
  position: Position;
  year: SchoolYear;
}

export interface RecalculateOptions {
  // Giữ nguyên MỌI log hiện có (kể cả log chưa khóa từ `fromDate` trở đi): không xếp lại, không xóa, không dời; chỉ xếp
  // các mục chưa có log vào ô tự do từ `fromDate`.
  keepAllLogs?: boolean;
}

export interface DefaultFromOptions {
  // true khi thao tác vừa THÊM mục PPCT mới (POST/import); sửa/xóa mục và ADMIN tính lại không body để false.
  appendedItems?: boolean;
}

@Injectable()
export class LessonLogEngineService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Position.name) private readonly positionModel: Model<Position>,
    @InjectModel(Class.name) private readonly classModel: Model<Class>,
    @InjectModel(SchoolYear.name) private readonly schoolYearModel: Model<SchoolYear>,
    @InjectModel(TimetableSlot.name) private readonly timetableSlotModel: Model<TimetableSlot>,
    @InjectModel(Holiday.name) private readonly holidayModel: Model<Holiday>,
    @InjectModel(PpctItem.name) private readonly ppctItemModel: Model<PpctItem>,
    @InjectModel(LessonLog.name) private readonly lessonLogModel: Model<LessonLog>,
    private readonly clock: Clock,
  ) {}

  // Không truyền session thì tự mở transaction riêng; có session thì chạy chung transaction của nơi gọi (thao tác
  // ghi TKB/PPCT/ngày nghỉ + tính lại phải cùng 1 transaction). withTransaction có thể chạy lại callback khi gặp
  // TransientTransactionError nên mọi trạng thái đều đọc lại bên trong, mọi query dùng session và chạy tuần tự.
  async recalculate(
    positionId: string,
    fromDate: Date,
    session?: ClientSession,
    options: RecalculateOptions = {},
  ): Promise<{ scheduled: number }> {
    if (!session) {
      return runInTransaction(this.connection, (txSession) =>
        this.recalculate(positionId, fromDate, txSession, options),
      );
    }

    const { position, year } = await this.loadPositionYear(positionId, session);
    const from = maxDate(fromDate, year.startDate);

    const slots = await this.timetableSlotModel.find({ positionId: position._id }).session(session);
    // Ngày nghỉ cả năm học (không cắt theo `from`): engine dựng ô từ log được giữ sớm nhất để giữ chỗ cho bài nhiều
    // tiết bắt đầu trước `from`, nên ngày nghỉ trước `from` cũng quyết định các ô đó.
    const holidays = await this.holidayModel.find({ schoolYearId: year._id }).session(session);
    const ppctItems = await this.ppctItemModel.find({ positionId: position._id }).session(session);
    const keptLogs = await this.lessonLogModel
      .find(
        options.keepAllLogs
          ? { positionId: position._id }
          : { positionId: position._id, $or: [{ date: { $lt: from } }, { isManuallyAdjusted: true }, { done: true }] },
      )
      .session(session);

    const scheduled = computeLessonSchedule({
      fromDate: from,
      yearEnd: year.endDate,
      slots,
      holidays,
      ppctItems: toScheduleItems(ppctItems),
      keptLogs: keptLogs.map((log) => ({
        ppctItemId: String(log.ppctItemId),
        date: log.date,
        locked: Boolean(log.isManuallyAdjusted || log.done),
      })),
    });

    // Log chưa khóa từ `from` trở đi mà mục không còn chỗ (hoặc không còn được xếp) thì xóa; còn lại upsert để
    // giữ nguyên _id log mà UI đang cầm. `keepAllLogs`: mọi log đã được giữ nên không có gì để xóa.
    if (!options.keepAllLogs) {
      await this.lessonLogModel
        .deleteMany({
          positionId: position._id,
          isManuallyAdjusted: { $ne: true },
          done: { $ne: true },
          date: { $gte: from },
          ppctItemId: { $nin: scheduled.map((lesson) => new Types.ObjectId(lesson.ppctItemId)) },
        })
        .session(session);
    }

    if (scheduled.length > 0) {
      await this.lessonLogModel.bulkWrite(
        scheduled.map((lesson) => ({
          updateOne: {
            filter: { positionId: position._id, ppctItemId: new Types.ObjectId(lesson.ppctItemId) },
            update: { $set: { date: lesson.date }, $setOnInsert: { isManuallyAdjusted: false, done: false } },
            upsert: true,
          },
        })),
        { session },
      );
    }
    return { scheduled: scheduled.length };
  }

  // `fromDate` mặc định khi ghi PPCT:
  // - Position chưa có log nào (xếp lần đầu) → từ đầu năm học để thứ tự nhập PPCT/TKB không làm khác kết quả.
  // - Đã có log → từ hôm nay (giờ Việt Nam) để không đụng tới các buổi đã qua.
  // - NGOẠI LỆ khi THÊM mục (`appendedItems`) mà mọi log đều đã ở quá khứ: nếu cũng từ hôm nay thì nhập tay từng mục
  //   giữa năm học sẽ để ô trống vĩnh viễn ở giữa (mục 1 vào đầu năm vì chưa có log, từ mục 2 bị đẩy sang hôm nay), trong
  //   khi nhập một lượt hoặc khai báo TKB sau PPCT thì không. Nên giữ nguyên MỌI log hiện có (không xếp lại, không xóa,
  //   không dời) và chỉ xếp mục mới vào ô tự do từ ngày của log muộn nhất; lấy chính ngày đó (không phải ngày sau nó)
  //   để lấp nốt tiết còn trống cùng ngày khi TKB có tiết đôi. Lịch đã kéo tới hôm nay hoặc sau đó thì vẫn từ hôm nay.
  async recalculateWithDefaultFrom(
    positionId: string,
    session?: ClientSession,
    options: DefaultFromOptions = {},
  ): Promise<{ scheduled: number }> {
    if (!session) {
      return runInTransaction(this.connection, (txSession) =>
        this.recalculateWithDefaultFrom(positionId, txSession, options),
      );
    }
    const latestLog = await this.lessonLogModel
      .findOne({ positionId: new Types.ObjectId(positionId) })
      .sort({ date: -1 })
      .select('date')
      .session(session);
    if (!latestLog) return this.recalculate(positionId, FROM_START_OF_YEAR, session);

    const today = todayDateOnlyVN(this.clock.now());
    const isAllInThePast = latestLog.date.getTime() < today.getTime();
    if (options.appendedItems && isAllInThePast) {
      return this.recalculate(positionId, latestLog.date, session, { keepAllLogs: true });
    }
    return this.recalculate(positionId, today, session);
  }

  async recalculateSchoolYear(
    schoolYearId: string,
    fromDate: Date,
    session: ClientSession,
  ): Promise<{ positions: number; scheduled: number }> {
    const classes = await this.classModel.find({ schoolYearId }).select('_id').session(session);
    const positions = await this.positionModel
      .find({ classId: { $in: classes.map((klass) => klass._id) } })
      .select('_id')
      .session(session);
    const positionIdsWithPpct: Types.ObjectId[] = await this.ppctItemModel
      .distinct('positionId', { positionId: { $in: positions.map((position) => position._id) } })
      .session(session);

    const sortedIds = positionIdsWithPpct.map(String).sort();
    let scheduled = 0;
    for (const positionId of sortedIds) {
      const result = await this.recalculate(positionId, fromDate, session);
      scheduled += result.scheduled;
    }
    return { positions: sortedIds.length, scheduled };
  }

  // 400 khi ngày đích không có ô nào (ngày nghỉ, ngoài năm học, không có slot); 409 khi mọi ô của ngày đó đã bị
  // log KHÁC bị khóa chiếm. Log chưa khóa không chặn vì sẽ được xếp lại quanh log bị khóa.
  async assertCanMoveLog(
    positionId: string,
    ppctItemId: string,
    newDate: Date,
    session: ClientSession,
  ): Promise<void> {
    const { position, year } = await this.loadPositionYear(positionId, session);

    const slots = await this.timetableSlotModel.find({ positionId: position._id }).session(session);
    const holidays = await this.holidayModel.find({ schoolYearId: year._id }).session(session);
    const ppctItems = await this.ppctItemModel.find({ positionId: position._id }).session(session);
    const otherLockedLogs = await this.lessonLogModel
      .find({ positionId: position._id, ppctItemId: { $ne: new Types.ObjectId(ppctItemId) }, ...LOCKED_LOG_FILTER })
      .session(session);

    const cells = buildCells({ slots, holidays, from: year.startDate, to: year.endDate });
    const isSameDay = (date: Date) => date.getTime() === newDate.getTime();
    if (!cells.some((cell) => isSameDay(cell.date))) {
      throw new BadRequestException('Ngày này không có tiết của môn');
    }

    const { freeCells } = reserveKeptLogs(
      cells,
      otherLockedLogs.map((log) => ({ ppctItemId: String(log.ppctItemId), date: log.date })),
      toScheduleItems(ppctItems),
    );
    if (!freeCells.some((cell) => isSameDay(cell.date))) {
      throw new ConflictException('Ngày này đã có buổi học khác, không thể chuyển vào');
    }
  }

  // Năm học của engine là năm học của LỚP (không phải "năm học hiện hành"), xem quyết định triển khai 5 của plan.
  private async loadPositionYear(positionId: string, session: ClientSession): Promise<PositionYearContext> {
    const position = await this.positionModel.findById(positionId).session(session);
    if (!position) throw new NotFoundException('Không tìm thấy vị trí');
    const klass = await this.classModel.findById(position.classId).session(session);
    if (!klass) throw new NotFoundException('Không tìm thấy lớp');
    const year = await this.schoolYearModel.findById(klass.schoolYearId).session(session);
    if (!year) throw new NotFoundException('Không tìm thấy năm học');
    return { position, year };
  }
}

function toScheduleItems(items: PpctItem[]): SchedulePpctItem[] {
  return items.map((item) => ({ id: String(item._id), order: item.order, periodCount: item.periodCount }));
}
