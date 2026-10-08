import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import type { PunishmentStatus } from '@so-chu-nhiem/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PositionGuard } from '../common/guards/position.guard';
import { RequirePosition } from '../common/decorators/require-position.decorator';
import { PunishmentsService } from './punishments.service';

@Controller('classes/:classId/punishments')
@UseGuards(JwtAuthGuard, RolesGuard, PositionGuard)
export class ClassPunishmentsController {
  constructor(private readonly punishmentsService: PunishmentsService) {}

  @Get()
  @RequirePosition('ANY')
  async list(@Param('classId') classId: string, @Query('status') status?: PunishmentStatus) {
    return this.punishmentsService.listByClass(classId, { status });
  }
}
