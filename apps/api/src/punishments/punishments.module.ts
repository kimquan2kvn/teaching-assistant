import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PunishmentsService } from './punishments.service';
import { PunishmentsController } from './punishments.controller';
import { ClassPunishmentsController } from './class-punishments.controller';
import { PositionGuard } from '../common/guards/position.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [PunishmentsController, ClassPunishmentsController],
  providers: [PunishmentsService, PositionGuard],
  exports: [PunishmentsService],
})
export class PunishmentsModule {}
