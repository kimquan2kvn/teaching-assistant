import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PositionGuard } from '../common/guards/position.guard';
import { RequirePosition } from '../common/decorators/require-position.decorator';
import { ConductLogService } from './conduct-log.service';

@Controller('classes/:classId')
@UseGuards(JwtAuthGuard, RolesGuard, PositionGuard)
export class ClassConductController {
  constructor(private readonly conductLogService: ConductLogService) {}

  @Get('conduct-logs')
  @RequirePosition('ANY')
  async list(@Param('classId') classId: string, @Query('studentId') studentId?: string) {
    return this.conductLogService.listByClass(classId, { studentId });
  }

  @Get('conduct-rating')
  @RequirePosition('ANY')
  async rating(@Param('classId') classId: string, @Query('date') date: string) {
    return this.conductLogService.getWeeklyRating(classId, date);
  }
}
