import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Punishment } from '../database/schemas/punishment.schema';
import { Position } from '../database/schemas/position.schema';
import type { PunishmentStatus } from '@so-chu-nhiem/shared';

@Injectable()
export class PunishmentsService {
  constructor(
    @InjectModel(Punishment.name) private readonly punishmentModel: Model<Punishment>,
    @InjectModel(Position.name) private readonly positionModel: Model<Position>,
  ) {}

  async listByClass(classId: string, filter?: { status?: PunishmentStatus }): Promise<Punishment[]> {
    const query: Record<string, unknown> = { classId };
    if (filter?.status) query.status = filter.status;
    return this.punishmentModel.find(query).sort({ dueDate: 1 }).exec();
  }

  async updateStatus(id: string, status: PunishmentStatus, user: { id: string; role: string }): Promise<Punishment> {
    const punishment = await this.findOrThrowWithAccess(id, user);
    punishment.status = status;
    await punishment.save();
    return punishment;
  }

  async updateLines(id: string, lines: number, user: { id: string; role: string }): Promise<Punishment> {
    const punishment = await this.findOrThrowWithAccess(id, user);
    punishment.lines = lines;
    await punishment.save();
    return punishment;
  }

  // Không có classId trên URL (chỉ có :id của chính Punishment) — phải tự tra classId từ bản ghi rồi kiểm tra
  // người gọi có phải GVCN đúng lớp đó không, không được tin bất kỳ tham số nào từ request.
  private async findOrThrowWithAccess(id: string, user: { id: string; role: string }): Promise<Punishment> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy chép phạt này');
    }
    const punishment = await this.punishmentModel.findById(id).exec();
    if (!punishment) {
      throw new NotFoundException('Không tìm thấy chép phạt này');
    }
    if (user.role === 'ADMIN') return punishment;

    const homeroom = await this.positionModel.findOne({ classId: punishment.classId, type: 'HOMEROOM' }).exec();
    if (!homeroom?.holderId || String(homeroom.holderId) !== user.id) {
      throw new ForbiddenException('Chỉ GVCN của lớp này mới cập nhật được chép phạt');
    }
    return punishment;
  }
}
