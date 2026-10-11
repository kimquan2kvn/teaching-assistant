import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { LessonLogsModule } from '../lesson-logs/lesson-logs.module';
import { TimetableMeController, TimetableSlotsController } from './timetable-slots.controller';
import { TimetableSlotsService } from './timetable-slots.service';

@Module({
  imports: [DatabaseModule, LessonLogsModule],
  controllers: [TimetableSlotsController, TimetableMeController],
  providers: [TimetableSlotsService, PositionOwnerGuard],
  exports: [TimetableSlotsService],
})
export class TimetableSlotsModule {}
