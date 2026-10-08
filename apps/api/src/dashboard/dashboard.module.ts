import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { ConductLogModule } from '../conduct-log/conduct-log.module';
import { PunishmentsModule } from '../punishments/punishments.module';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { PositionGuard } from '../common/guards/position.guard';

@Module({
  imports: [DatabaseModule, AttendanceModule, ConductLogModule, PunishmentsModule],
  controllers: [DashboardController],
  providers: [DashboardService, PositionGuard],
})
export class DashboardModule {}
