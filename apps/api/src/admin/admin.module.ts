import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [AdminController],
})
export class AdminModule {}
