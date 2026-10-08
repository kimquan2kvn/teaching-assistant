import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Position } from '../../database/schemas/position.schema';
import { REQUIRE_POSITION_KEY } from '../decorators/require-position.decorator';

@Injectable()
export class PositionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(Position.name) private readonly positionModel: Model<Position>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<'HOMEROOM' | 'ANY' | undefined>(REQUIRE_POSITION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requirement) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as { id: string; role: string } | undefined;
    if (!user) return false;
    if (user.role === 'ADMIN') return true;

    const classId = request.params?.classId;
    if (!classId || !Types.ObjectId.isValid(classId)) return false;

    if (!Types.ObjectId.isValid(user.id)) return false;
    const filter: Record<string, unknown> = {
      classId: new Types.ObjectId(classId),
      holderId: new Types.ObjectId(user.id),
    };
    if (requirement === 'HOMEROOM') {
      filter.type = 'HOMEROOM';
    }
    const position = await this.positionModel.findOne(filter).exec();
    return !!position;
  }
}
