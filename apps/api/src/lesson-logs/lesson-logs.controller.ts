import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { recalculateLessonLogsSchema, updateLessonLogSchema } from '@so-chu-nhiem/shared';
import type { RecalculateLessonLogsInput, UpdateLessonLogInput } from '@so-chu-nhiem/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePositionOwner } from '../common/decorators/require-position-owner.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { parseDateOnly } from '../common/utils/date';
import { LessonLogsService } from './lesson-logs.service';

@Controller('positions/:positionId/lesson-logs')
@UseGuards(JwtAuthGuard, RolesGuard, PositionOwnerGuard)
@Roles('TEACHER', 'ADMIN')
export class LessonLogsController {
  constructor(private readonly lessonLogsService: LessonLogsService) {}

  @Get()
  @RequirePositionOwner('SELF_OR_HOMEROOM')
  async list(
    @Param('positionId') positionId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.lessonLogsService.listByPosition(positionId, {
      from: from === undefined ? undefined : parseDateOnly(from),
      to: to === undefined ? undefined : parseDateOnly(to),
    });
  }

  // Service nhận positionId (không phải Position) và tự lọc log theo positionId, nên route không cần @ResolvedPosition.
  @Patch(':id')
  @RequirePositionOwner('SELF')
  async update(
    @Param('positionId') positionId: string,
    @Param('id') logId: string,
    @Body(new ZodValidationPipe(updateLessonLogSchema)) body: UpdateLessonLogInput,
  ) {
    return this.lessonLogsService.update(positionId, logId, body);
  }

  // @Roles ở cấp method ghi đè @Roles của class: chỉ ADMIN, GVBM chủ position cũng bị 403 tại RolesGuard.
  // @RequirePositionOwner chỉ để guard xác nhận position tồn tại (ADMIN bỏ qua kiểm tra chủ sở hữu).
  @Post('recalculate')
  @Roles('ADMIN')
  @RequirePositionOwner('SELF')
  @HttpCode(200)
  async recalculate(
    @Param('positionId') positionId: string,
    @Body(new ZodValidationPipe(recalculateLessonLogsSchema)) body: RecalculateLessonLogsInput,
  ) {
    return this.lessonLogsService.recalculate(positionId, body.fromDate);
  }
}
