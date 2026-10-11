import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { LessonLogsModule } from '../lesson-logs/lesson-logs.module';
import { SchoolConfigModule } from '../school-config/school-config.module';
import { HolidaysController } from './holidays.controller';
import { HolidaysService } from './holidays.service';

@Module({
  imports: [DatabaseModule, SchoolConfigModule, LessonLogsModule],
  controllers: [HolidaysController],
  providers: [HolidaysService],
  exports: [HolidaysService],
})
export class HolidaysModule {}
