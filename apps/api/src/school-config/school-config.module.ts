import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SchoolConfigService } from './school-config.service';
import { SchoolConfigController } from './school-config.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [SchoolConfigController],
  providers: [SchoolConfigService],
  exports: [SchoolConfigService],
})
export class SchoolConfigModule {}
