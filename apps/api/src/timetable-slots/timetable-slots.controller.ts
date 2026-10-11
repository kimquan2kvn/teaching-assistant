import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createTimetableSlotSchema, updateTimetableSlotSchema } from '@so-chu-nhiem/shared';
import type { CreateTimetableSlotInput, UpdateTimetableSlotInput } from '@so-chu-nhiem/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ResolvedPosition } from '../common/decorators/resolved-position.decorator';
import { RequirePositionOwner } from '../common/decorators/require-position-owner.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
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
