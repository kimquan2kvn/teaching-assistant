import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SchoolYearsModule } from '../school-years/school-years.module';
import { PositionGuard } from '../common/guards/position.guard';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  imports: [DatabaseModule, SchoolYearsModule],
  controllers: [ClassesController],
  providers: [ClassesService, PositionGuard],
  exports: [ClassesService],
})
export class ClassesModule {}
