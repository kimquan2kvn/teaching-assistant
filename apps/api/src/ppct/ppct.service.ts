import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import type { CreatePpctItemInput, UpdatePpctItemInput } from '@so-chu-nhiem/shared';
import { LessonLog } from '../database/schemas/lesson-log.schema';
import { Position } from '../database/schemas/position.schema';
import { PpctItem } from '../database/schemas/ppct-item.schema';
import { runInTransaction } from '../common/utils/transaction';
import { LessonLogEngineService } from '../lesson-logs/lesson-log-engine.service';

const SUBJECT_ONLY_MESSAGE = 'Chỉ vị trí giáo viên bộ môn mới có thời khóa biểu và PPCT';
const ITEM_NOT_FOUND_MESSAGE = 'Không tìm thấy mục PPCT';

@Injectable()
export class PpctService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(PpctItem.name) private readonly ppctItemModel: Model<PpctItem>,
    @InjectModel(LessonLog.name) private readonly lessonLogModel: Model<LessonLog>,
    private readonly engine: LessonLogEngineService,
  ) {}

  // Position HOMEROOM không bao giờ có PPCT (mọi thao tác ghi bị từ chối) nên đọc luôn ra rỗng.
  async list(positionId: string): Promise<PpctItem[]> {
    return this.ppctItemModel.find({ positionId }).sort({ order: 1 }).exec();
  }

  // Mọi thao tác ghi: ghi PPCT + tính lại sổ báo giảng cùng 1 transaction, tính lại lỗi thì PPCT cũng không được
  // lưu. Callback có thể bị withTransaction chạy lại nên mọi trạng thái đều đọc lại bên trong.
  //
  // `order` = max + 1 đọc trong transaction. Hai POST đồng thời cùng đọc một max sẽ cùng chèn một `order`: unique
  // (positionId, order) làm transaction đến sau bị WriteConflict (TransientTransactionError) nên withTransaction
  // chạy lại callback và đọc được max mới; trường hợp lỗi E11000 lọt ra thì MongoExceptionFilter map thành 409.
  async create(position: Position, input: CreatePpctItemInput): Promise<PpctItem> {
    this.assertSubjectPosition(position);

    return runInTransaction(this.connection, async (session) => {
      const last = await this.ppctItemModel
        .findOne({ positionId: position._id })
        .sort({ order: -1 })
        .select('order')
        .session(session);
      const [item] = await this.ppctItemModel.create(
        [{ positionId: position._id, order: (last?.order ?? 0) + 1, ...input }],
        { session },
      );
      await this.engine.recalculateWithDefaultFrom(String(position._id), session, { appendedItems: true });
      return item;
    });
  }

  // Import all-or-nothing: cả lô + tính lại chung 1 transaction, `order` nối tiếp sau max hiện có. Hai import đồng
  // thời xử lý như create(): unique (positionId, order) làm lượt đến sau WriteConflict rồi chạy lại.
  async importCommit(position: Position, rows: CreatePpctItemInput[]): Promise<PpctItem[]> {
    this.assertSubjectPosition(position);

    return runInTransaction(this.connection, async (session) => {
      const last = await this.ppctItemModel
        .findOne({ positionId: position._id })
        .sort({ order: -1 })
        .select('order')
        .session(session);
      const baseOrder = last?.order ?? 0;
      const items = await this.ppctItemModel.insertMany(
        rows.map((row, index) => ({ positionId: position._id, order: baseOrder + index + 1, ...row })),
        { session },
      );
      await this.engine.recalculateWithDefaultFrom(String(position._id), session, { appendedItems: true });
      return items;
    });
  }

  // `order` không nằm trong updatePpctItemSchema nên PATCH không bao giờ đổi thứ tự.
  async update(position: Position, itemId: string, input: UpdatePpctItemInput): Promise<PpctItem> {
    this.assertSubjectPosition(position);

    return runInTransaction(this.connection, async (session) => {
      const item = await this.requireItem(position, itemId, session);
      item.set(input);
      await item.save({ session });
      await this.engine.recalculateWithDefaultFrom(String(position._id), session);
      return item;
    });
  }

  // Xóa luôn LessonLog của mục (kể cả đã `done`) và KHÔNG đánh số lại `order` của các mục còn lại.
  async remove(position: Position, itemId: string): Promise<{ deleted: true }> {
    this.assertSubjectPosition(position);

    return runInTransaction(this.connection, async (session) => {
      const item = await this.requireItem(position, itemId, session);
      await this.lessonLogModel.deleteMany({ positionId: position._id, ppctItemId: item._id }, { session });
      await this.ppctItemModel.deleteOne({ _id: item._id }, { session });
      await this.engine.recalculateWithDefaultFrom(String(position._id), session);
      return { deleted: true as const };
    });
  }

  private assertSubjectPosition(position: Position): void {
    if (position.type !== 'SUBJECT') {
      throw new BadRequestException(SUBJECT_ONLY_MESSAGE);
    }
  }

  // PositionOwnerGuard chỉ xác nhận positionId, không xác nhận itemId thuộc position đó (IDOR qua id con) nên
  // luôn lọc theo cả positionId; id không phải ObjectId hợp lệ cũng ra 404 thay vì CastError.
  private async requireItem(position: Position, itemId: string, session: ClientSession): Promise<PpctItem> {
    const item = Types.ObjectId.isValid(itemId)
      ? await this.ppctItemModel.findOne({ _id: itemId, positionId: position._id }).session(session)
      : null;
    if (!item) throw new NotFoundException(ITEM_NOT_FOUND_MESSAGE);
    return item;
  }
}
