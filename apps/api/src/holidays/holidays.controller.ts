import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { createHolidaySchema, updateHolidaySchema } from '@so-chu-nhiem/shared';
import type { CreateHolidayInput, UpdateHolidayInput } from '@so-chu-nhiem/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { parseDateOnly } from '../common/utils/date';
import { HolidaysService } from './holidays.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TEACHER', 'ADMIN')
export class HolidaysController {
  constructor(private readonly holidaysService: HolidaysService) {}

  @Get('school-years/:id/holidays')
  async list(@Param('id') schoolYearId: string) {
    return this.holidaysService.listBySchoolYear(schoolYearId);
  }

  @Get('school-years/:id/calendar-stats')
  async calendarStats(@Param('id') schoolYearId: string, @Query('asOf') asOf?: string) {
    return this.holidaysService.getCalendarStats(schoolYearId, asOf === undefined ? undefined : parseDateOnly(asOf));
  }

  @Post('holidays')
  @Roles('ADMIN')
  async create(@Body(new ZodValidationPipe(createHolidaySchema)) body: CreateHolidayInput) {
    return this.holidaysService.create(body);
  }

  @Patch('holidays/:id')
  @Roles('ADMIN')
  async update(@Param('id') id: string, @Body(new ZodValidationPipe(updateHolidaySchema)) body: UpdateHolidayInput) {
    return this.holidaysService.update(id, body);
  }

  @Delete('holidays/:id')
  @Roles('ADMIN')
  async remove(@Param('id') id: string) {
    return this.holidaysService.remove(id);
  }
}
