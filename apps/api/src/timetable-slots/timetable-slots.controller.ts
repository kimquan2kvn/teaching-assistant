import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { createTimetableSlotSchema, updateTimetableSlotSchema } from '@so-chu-nhiem/shared';
import type { CreateTimetableSlotInput, UpdateTimetableSlotInput } from '@so-chu-nhiem/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResolvedPosition } from '../common/decorators/resolved-position.decorator';
import { RequirePositionOwner } from '../common/decorators/require-position-owner.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Clock } from '../common/utils/clock';
import { resolveWeekStart } from '../common/utils/date';
import { Position } from '../database/schemas/position.schema';
import { TimetableSlotsService } from './timetable-slots.service';

@Controller('positions/:positionId/timetable-slots')
@UseGuards(JwtAuthGuard, RolesGuard, PositionOwnerGuard)
@Roles('TEACHER', 'ADMIN')
export class TimetableSlotsController {
  constructor(private readonly timetableSlotsService: TimetableSlotsService) {}

  @Get()
  @RequirePositionOwner('SELF_OR_HOMEROOM')
  async list(@Param('positionId') positionId: string) {
    return this.timetableSlotsService.list(positionId);
  }

  @Post()
  @RequirePositionOwner('SELF')
  async create(
    @ResolvedPosition() position: Position,
    @Body(new ZodValidationPipe(createTimetableSlotSchema)) body: CreateTimetableSlotInput,
  ) {
    return this.timetableSlotsService.create(position, body);
  }

  @Patch(':slotId')
  @RequirePositionOwner('SELF')
  async update(
    @ResolvedPosition() position: Position,
    @Param('slotId') slotId: string,
    @Body(new ZodValidationPipe(updateTimetableSlotSchema)) body: UpdateTimetableSlotInput,
  ) {
    return this.timetableSlotsService.update(position, slotId, body);
  }

  @Delete(':slotId')
  @RequirePositionOwner('SELF')
  async remove(@ResolvedPosition() position: Position, @Param('slotId') slotId: string) {
    return this.timetableSlotsService.remove(position, slotId);
  }
}

// Route không theo `:positionId`: kết quả tự lọc theo các vị trí SUBJECT mà người gọi đang giữ nên không cần
// PositionOwnerGuard. Chỉ TEACHER (ADMIN/STUDENT 403).
@Controller('timetable')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TEACHER')
export class TimetableMeController {
  constructor(
    private readonly timetableSlotsService: TimetableSlotsService,
    private readonly clock: Clock,
  ) {}

  @Get('me')
  async getMyWeek(@CurrentUser() user: { id: string }, @Query('weekStart') weekStart?: string) {
    return this.timetableSlotsService.getMyWeek(user.id, resolveWeekStart(weekStart, this.clock.now()));
  }
}
