import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { Clock } from '../common/utils/clock';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { LessonLogEngineService } from './lesson-log-engine.service';
import { LessonLogsController } from './lesson-logs.controller';
import { LessonLogsService } from './lesson-logs.service';

@Module({
  imports: [DatabaseModule],
  controllers: [LessonLogsController],
  providers: [Clock, LessonLogEngineService, LessonLogsService, PositionOwnerGuard],
  exports: [Clock, LessonLogEngineService, LessonLogsService],
})
export class LessonLogsModule {}
