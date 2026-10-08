import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SchoolYearsController } from './school-years.controller';
import { SchoolYearsService } from './school-years.service';

@Module({
  imports: [DatabaseModule],
  controllers: [SchoolYearsController],
  providers: [SchoolYearsService],
  exports: [SchoolYearsService],
})
export class SchoolYearsModule {}
