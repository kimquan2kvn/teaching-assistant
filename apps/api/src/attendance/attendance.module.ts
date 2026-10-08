import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { StudentsModule } from '../students/students.module';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { ClassAttendanceController } from './class-attendance.controller';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { PositionGuard } from '../common/guards/position.guard';

@Module({
  imports: [DatabaseModule, StudentsModule],
  controllers: [AttendanceController, ClassAttendanceController],
  providers: [AttendanceService, PositionOwnerGuard, PositionGuard],
})
export class AttendanceModule {}
