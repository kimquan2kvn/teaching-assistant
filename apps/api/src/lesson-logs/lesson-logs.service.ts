import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import type { UpdateLessonLogInput } from '@so-chu-nhiem/shared';
import { LessonLog } from '../database/schemas/lesson-log.schema';
import { PpctItem } from '../database/schemas/ppct-item.schema';
import { minDate } from '../common/utils/date';
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

@Injectable()
export class LessonLogsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(LessonLog.name) private readonly lessonLogModel: Model<LessonLog>,
    @InjectModel(PpctItem.name) private readonly ppctItemModel: Model<PpctItem>,
    private readonly engine: LessonLogEngineService,
  ) {}

  // 2 query (logs + mục PPCT theo id) rồi ghép trong bộ nhớ để không N+1. Cùng ngày sắp theo `order` của mục.
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
    if (logs.length === 0) return [];

    const items = await this.ppctItemModel.find({ _id: { $in: logs.map((log) => log.ppctItemId) } }).exec();
    const itemById = new Map(items.map((item) => [String(item._id), item]));

    const orderOf = (view: LessonLogView) => view.ppctItem?.order ?? Number.MAX_SAFE_INTEGER;
    return logs
      .map((log) => toLessonLogView(log, itemById.get(String(log.ppctItemId))))
      .sort((a, b) => a.date.getTime() - b.date.getTime() || orderOf(a) - orderOf(b));
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
