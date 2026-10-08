import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ConductCatalogModule } from '../conduct-catalog/conduct-catalog.module';
import { ConductLogService } from './conduct-log.service';
import { ConductLogController } from './conduct-log.controller';
import { ClassConductController } from './class-conduct.controller';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { PositionGuard } from '../common/guards/position.guard';

@Module({
  imports: [DatabaseModule, ConductCatalogModule],
  controllers: [ConductLogController, ClassConductController],
  providers: [ConductLogService, PositionOwnerGuard, PositionGuard],
  exports: [ConductLogService],
})
export class ConductLogModule {}
