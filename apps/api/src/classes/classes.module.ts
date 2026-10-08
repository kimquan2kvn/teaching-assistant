import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SchoolYearsModule } from '../school-years/school-years.module';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  imports: [DatabaseModule, SchoolYearsModule],
  controllers: [ClassesController],
  providers: [ClassesService],
  exports: [ClassesService],
})
export class ClassesModule {}
