import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { SchoolYearsModule } from './school-years/school-years.module';
import { ClassesModule } from './classes/classes.module';
import { PositionsModule } from './positions/positions.module';
import { StudentsModule } from './students/students.module';
import { AttendanceModule } from './attendance/attendance.module';
import { ConductCatalogModule } from './conduct-catalog/conduct-catalog.module';
import { ConductLogModule } from './conduct-log/conduct-log.module';
import { SchoolConfigModule } from './school-config/school-config.module';
import { PunishmentsModule } from './punishments/punishments.module';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    AuthModule,
    AdminModule,
    SchoolYearsModule,
    ClassesModule,
    PositionsModule,
    StudentsModule,
    AttendanceModule,
    ConductCatalogModule,
    ConductLogModule,
    SchoolConfigModule,
    PunishmentsModule,
  ],
})
export class AppModule {}
