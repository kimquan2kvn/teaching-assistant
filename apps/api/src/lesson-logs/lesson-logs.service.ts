import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import type { UpdateLessonLogInput } from '@so-chu-nhiem/shared';
import { LessonLog } from '../database/schemas/lesson-log.schema';
import { PpctItem } from '../database/schemas/ppct-item.schema';
import { Class } from '../database/schemas/class.schema';
import { Position } from '../database/schemas/position.schema';
import { addDays, minDate } from '../common/utils/date';
import { runInTransaction } from '../common/utils/transaction';
import { LessonLogEngineService } from './lesson-log-engine.service';

const LOG_NOT_FOUND_MESSAGE = 'Không tìm thấy buổi học';
const INVALID_RANGE_MESSAGE = 'Ngày bắt đầu không được sau ngày kết thúc';

export interface LessonLogView {
  _id: string;
  positionId: string;
  ppctItemId: string;
  date: Date;
  done: boolean;
  isManuallyAdjusted: boolean;
  ppctItem: {
    order: number;
    week: number;
    periodLabel: string;
    title: string;
    periodCount: number;
    requirement: string;
    note?: string;
  } | null;
}

export interface TeacherWeekPosition {
  _id: string;
  classId: string;
  className: string;
  subject: string;
}

export type TeacherWeekLogView = LessonLogView & { position: TeacherWeekPosition };

@Injectable()
export class LessonLogsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(LessonLog.name) private readonly lessonLogModel: Model<LessonLog>,
    @InjectModel(PpctItem.name) private readonly ppctItemModel: Model<PpctItem>,
    @InjectModel(Position.name) private readonly positionModel: Model<Position>,
    @InjectModel(Class.name) private readonly classModel: Model<Class>,
    private readonly engine: LessonLogEngineService,
  ) {}

  async listByPosition(positionId: string, range: { from?: Date; to?: Date }): Promise<LessonLogView[]> {
    const { from, to } = range;
    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException(INVALID_RANGE_MESSAGE);
    }

    const dateFilter: { $gte?: Date; $lte?: Date } = {};
    if (from) dateFilter.$gte = from;
    if (to) dateFilter.$lte = to;
    const logs = await this.lessonLogModel
      .find(from || to ? { positionId, date: dateFilter } : { positionId })
      .exec();
    return this.toSortedViews(logs);
  }

  // Chỉ position SUBJECT mà giáo viên ĐANG giữ: GVCN (HOMEROOM) không có tiết dạy nên không có gì để xem ở lưới tuần,
  // và log của GVBM trong lớp mình chủ nhiệm cũng không lọt vào. 2 query (position + lớp lấy tên) cho mọi vị trí.
  async listTeacherSubjectPositions(userId: string): Promise<TeacherWeekPosition[]> {
    const positions = await this.positionModel.find({ holderId: userId, type: 'SUBJECT' }).exec();
    if (positions.length === 0) return [];

    const classes = await this.classModel.find({ _id: { $in: positions.map((position) => position.classId) } }).exec();
    const classNameById = new Map(classes.map((klass) => [String(klass._id), klass.name]));
    return positions.map((position) => ({
      _id: String(position._id),
      classId: String(position.classId),
      className: classNameById.get(String(position.classId)) ?? '',
      subject: position.subject ?? '',
    }));
  }

  async listForTeacherWeek(userId: string, weekStart: Date): Promise<TeacherWeekLogView[]> {
    return this.listForPositionsInWeek(await this.listTeacherSubjectPositions(userId), weekStart);
  }

  // `weekStart` là Thứ Hai (00:00 UTC) đã chuẩn hóa; tuần = [weekStart, weekStart + 6 ngày]. Gom theo `positionId in [...]`
  // nên số query không phụ thuộc số position.
  async listForPositionsInWeek(positions: TeacherWeekPosition[], weekStart: Date): Promise<TeacherWeekLogView[]> {
    if (positions.length === 0) return [];

    const logs = await this.lessonLogModel
      .find({
        positionId: { $in: positions.map((position) => position._id) },
        date: { $gte: weekStart, $lte: addDays(weekStart, 6) },
      })
      .exec();
    const positionById = new Map(positions.map((position) => [position._id, position]));
    return (await this.toSortedViews(logs)).map((view) => ({
      ...view,
      position: positionById.get(view.positionId) as TeacherWeekPosition,
    }));
  }

  // Ghi + tính lại cùng 1 transaction: tính lại lỗi thì ngày/cờ kéo tay cũng không được lưu. Chỉ đổi `done` thì
  // không đụng tới lịch nên không tính lại. Callback có thể bị withTransaction chạy lại nên đọc lại log bên trong.
  async update(positionId: string, logId: string, input: UpdateLessonLogInput): Promise<LessonLogView> {
    return runInTransaction(this.connection, async (session) => {
      // PositionOwnerGuard chỉ xác nhận positionId, không xác nhận logId thuộc position đó (IDOR qua id con) nên luôn
      // lọc theo cả positionId; id không phải ObjectId hợp lệ cũng ra 404 thay vì CastError.
      const log = Types.ObjectId.isValid(logId)
        ? await this.lessonLogModel.findOne({ _id: logId, positionId }).session(session)
        : null;
      if (!log) throw new NotFoundException(LOG_NOT_FOUND_MESSAGE);

      const oldDate = log.date;
      const newDate = input.date;
      const isMove = newDate !== undefined && newDate.getTime() !== oldDate.getTime();
      if (isMove) {
        await this.engine.assertCanMoveLog(positionId, String(log.ppctItemId), newDate, session);
        log.date = newDate;
        log.isManuallyAdjusted = true;
      }
      if (input.done !== undefined) {
        log.done = input.done;
      }
      await log.save({ session });

      if (isMove) {
        await this.engine.recalculate(positionId, minDate(oldDate, newDate), session);
      }

      const item = await this.ppctItemModel.findById(log.ppctItemId).session(session);
      return toLessonLogView(log, item ?? undefined);
    });
  }

  async recalculate(positionId: string, fromDate?: Date): Promise<{ scheduled: number }> {
    return fromDate
      ? this.engine.recalculate(positionId, fromDate)
      : this.engine.recalculateWithDefaultFrom(positionId);
  }

  // 1 query lấy mục PPCT theo id rồi ghép trong bộ nhớ để không N+1. Cùng ngày sắp theo `order` của mục.
  private async toSortedViews(logs: LessonLog[]): Promise<LessonLogView[]> {
    if (logs.length === 0) return [];

    const items = await this.ppctItemModel.find({ _id: { $in: logs.map((log) => log.ppctItemId) } }).exec();
    const itemById = new Map(items.map((item) => [String(item._id), item]));

    const orderOf = (view: LessonLogView) => view.ppctItem?.order ?? Number.MAX_SAFE_INTEGER;
    return logs
      .map((log) => toLessonLogView(log, itemById.get(String(log.ppctItemId))))
      .sort((a, b) => a.date.getTime() - b.date.getTime() || orderOf(a) - orderOf(b));
  }
}

function toLessonLogView(log: LessonLog, item: PpctItem | undefined): LessonLogView {
  return {
    _id: String(log._id),
    positionId: String(log.positionId),
    ppctItemId: String(log.ppctItemId),
    date: log.date,
    done: log.done,
    isManuallyAdjusted: log.isManuallyAdjusted,
    ppctItem: item
      ? {
          order: item.order,
          week: item.week,
          periodLabel: item.periodLabel,
          title: item.title,
          periodCount: item.periodCount,
          requirement: item.requirement,
          note: item.note,
        }
      : null,
  };
}
