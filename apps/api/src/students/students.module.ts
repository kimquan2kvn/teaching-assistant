import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { PositionGuard } from '../common/guards/position.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [StudentsController],
  providers: [StudentsService, PositionGuard],
  exports: [StudentsService],
})
export class StudentsModule {}
