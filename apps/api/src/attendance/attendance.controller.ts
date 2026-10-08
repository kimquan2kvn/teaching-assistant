import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { markAttendanceSchema } from '@so-chu-nhiem/shared';
import type { MarkAttendanceInput } from '@so-chu-nhiem/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResolvedPosition } from '../common/decorators/resolved-position.decorator';
import { RequirePositionOwner } from '../common/decorators/require-position-owner.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { Position } from '../database/schemas/position.schema';
import { AttendanceService } from './attendance.service';

@Controller('positions/:positionId/attendance')
@UseGuards(JwtAuthGuard, RolesGuard, PositionOwnerGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Put()
  @RequirePositionOwner('SELF')
  async markAttendance(
    @ResolvedPosition() position: Position,
    @Query('date') date: string,
    @Body(new ZodValidationPipe(markAttendanceSchema)) body: MarkAttendanceInput,
    @CurrentUser() user: { id: string },
  ) {
    return this.attendanceService.markAttendance(position, date, body.entries, user.id);
  }

  @Get()
  @RequirePositionOwner('SELF_OR_HOMEROOM')
  async getAttendance(@Param('positionId') positionId: string, @Query('date') date: string) {
    return this.attendanceService.getByPosition(positionId, date);
  }
}
