import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { Clock } from '../common/utils/clock';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { LessonLogEngineService } from './lesson-log-engine.service';

@Module({
  imports: [DatabaseModule],
  providers: [Clock, LessonLogEngineService, PositionOwnerGuard],
  exports: [Clock, LessonLogEngineService],
})
export class LessonLogsModule {}
