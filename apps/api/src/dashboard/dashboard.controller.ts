import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PositionGuard } from '../common/guards/position.guard';
import { RequirePosition } from '../common/decorators/require-position.decorator';
import { DashboardService } from './dashboard.service';

@Controller('classes/:classId/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard, PositionGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @RequirePosition('ANY')
  async get(@Param('classId') classId: string, @Query('date') date: string) {
    return this.dashboardService.getClassDashboard(classId, date);
  }
}
