import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ClassesModule } from '../classes/classes.module';
import { PositionsController } from './positions.controller';
import { PositionsService } from './positions.service';

@Module({
  imports: [DatabaseModule, ClassesModule],
  controllers: [PositionsController],
  providers: [PositionsService],
})
export class PositionsModule {}
