import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { createConductLogSchema } from '@so-chu-nhiem/shared';
import type { CreateConductLogInput } from '@so-chu-nhiem/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResolvedPosition } from '../common/decorators/resolved-position.decorator';
import { RequirePositionOwner } from '../common/decorators/require-position-owner.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { Position } from '../database/schemas/position.schema';
import { ConductLogService } from './conduct-log.service';

@Controller('positions/:positionId/conduct-logs')
@UseGuards(JwtAuthGuard, RolesGuard, PositionOwnerGuard)
export class ConductLogController {
  constructor(private readonly conductLogService: ConductLogService) {}

  @Post()
  @RequirePositionOwner('SELF')
  async create(
    @ResolvedPosition() position: Position,
    @Body(new ZodValidationPipe(createConductLogSchema)) body: CreateConductLogInput,
    @CurrentUser() user: { id: string },
  ) {
    return this.conductLogService.create(position, body, user.id);
  }
}
