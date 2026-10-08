import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ConductCatalogService } from './conduct-catalog.service';
import { ConductCatalogController } from './conduct-catalog.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [ConductCatalogController],
  providers: [ConductCatalogService],
  exports: [ConductCatalogService],
})
export class ConductCatalogModule {}
