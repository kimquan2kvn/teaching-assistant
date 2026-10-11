import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { LessonLogsModule } from '../lesson-logs/lesson-logs.module';
import { PpctController } from './ppct.controller';
import { PpctService } from './ppct.service';

@Module({
  imports: [DatabaseModule, LessonLogsModule],
  controllers: [PpctController],
  providers: [PpctService, PositionOwnerGuard],
  exports: [PpctService],
})
export class PpctModule {}
