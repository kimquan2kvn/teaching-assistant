import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PositionGuard } from '../common/guards/position.guard';
import { RequirePosition } from '../common/decorators/require-position.decorator';
import { AttendanceService } from './attendance.service';

@Controller('classes/:classId/attendance')
@UseGuards(JwtAuthGuard, RolesGuard, PositionGuard)
export class ClassAttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('summary')
  @RequirePosition('ANY')
  async summary(@Param('classId') classId: string, @Query('date') date: string) {
    return this.attendanceService.getClassSummary(classId, date);
  }
}
