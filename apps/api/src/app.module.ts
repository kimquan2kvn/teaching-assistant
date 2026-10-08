import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { SchoolYearsModule } from './school-years/school-years.module';
import { ClassesModule } from './classes/classes.module';

@Module({
  imports: [DatabaseModule, HealthModule, AuthModule, AdminModule, SchoolYearsModule, ClassesModule],
})
export class AppModule {}
