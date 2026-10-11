import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Clock } from '../common/utils/clock';
import { resolveWeekStart } from '../common/utils/date';
import { LessonLogsService } from './lesson-logs.service';

// Controller riêng (không phải LessonLogsController) vì route này không theo `:positionId`: kết quả tự lọc theo
// các vị trí SUBJECT mà người gọi đang giữ nên không cần PositionOwnerGuard. Chỉ TEACHER (ADMIN/STUDENT 403).
@Controller('lesson-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TEACHER')
export class TeacherLessonLogsController {
  constructor(
    private readonly lessonLogsService: LessonLogsService,
    private readonly clock: Clock,
  ) {}

  @Get('week')
  async week(@CurrentUser() user: { id: string }, @Query('weekStart') weekStart?: string) {
    return this.lessonLogsService.listForTeacherWeek(user.id, resolveWeekStart(weekStart, this.clock.now()));
  }
}
