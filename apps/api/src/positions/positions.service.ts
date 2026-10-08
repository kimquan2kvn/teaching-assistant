import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { JoinClassInput } from '@so-chu-nhiem/shared';
import { Position } from '../database/schemas/position.schema';
import { User } from '../database/schemas/user.schema';
import { ClassesService } from '../classes/classes.service';

@Injectable()
export class PositionsService {
  constructor(
    @InjectModel(Position.name) private readonly positionModel: Model<Position>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly classesService: ClassesService,
  ) {}

  async join(teacherId: string, input: JoinClassInput): Promise<Position> {
    const { class: klass } = await this.classesService.findByCode(input.code);

    const filter: Record<string, unknown> = {
      classId: klass._id,
      type: input.type,
      holderId: null,
    };
    if (input.type === 'SUBJECT') {
      filter.subject = input.subject;
    }

    const position = await this.positionModel.findOneAndUpdate(filter, { holderId: teacherId }, { new: true }).exec();
    if (!position) {
      throw new ConflictException('Vị trí này đã có người giữ hoặc không tồn tại');
    }
    return position;
  }

  async release(userId: string, positionId: string): Promise<Position> {
    const position = await this.positionModel.findById(positionId).exec();
    if (!position) {
      throw new NotFoundException('Không tìm thấy vị trí này');
    }
    if (!position.holderId || String(position.holderId) !== userId) {
      throw new ForbiddenException('Bạn không giữ vị trí này');
    }
    position.holderId = null;
    await position.save();
    return position;
  }

  async reassign(teacherId: string, positionId: string): Promise<Position> {
    const teacher = await this.userModel.findById(teacherId).exec();
    if (!teacher || teacher.role !== 'TEACHER') {
      throw new BadRequestException('Người được gán phải là giáo viên');
    }
    const position = await this.positionModel.findById(positionId).exec();
    if (!position) {
      throw new NotFoundException('Không tìm thấy vị trí này');
    }
    position.holderId = teacher._id;
    await position.save();
    return position;
  }
}
