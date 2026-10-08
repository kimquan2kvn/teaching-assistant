import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Position } from '../../database/schemas/position.schema';
import { REQUIRE_POSITION_OWNER_KEY, PositionOwnerRequirement } from '../decorators/require-position-owner.decorator';

@Injectable()
export class PositionOwnerGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(Position.name) private readonly positionModel: Model<Position>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<PositionOwnerRequirement | undefined>(
      REQUIRE_POSITION_OWNER_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as { id: string; role: string } | undefined;
    if (!user) return false;

    const positionId = request.params?.positionId;
    if (!positionId || !Types.ObjectId.isValid(positionId)) return false;
    const position = await this.positionModel.findById(positionId).exec();
    if (!position) return false;

    // ADMIN bỏ qua kiểm tra chủ sở hữu, nhưng vẫn phải gắn request.position — route dùng @ResolvedPosition()
    // (vd AttendanceController) cần giá trị này bất kể ai gọi, không chỉ khi người gọi là chủ thật sự.
    if (user.role === 'ADMIN') {
      request.position = position;
      return true;
    }

    if (String(position.holderId) === user.id) {
      request.position = position;
      return true;
    }
    if (requirement === 'SELF_OR_HOMEROOM') {
      const homeroom = await this.positionModel.findOne({ classId: position.classId, type: 'HOMEROOM' }).exec();
      if (homeroom?.holderId && String(homeroom.holderId) === user.id) {
        request.position = position;
        return true;
      }
    }
    return false;
  }
}
