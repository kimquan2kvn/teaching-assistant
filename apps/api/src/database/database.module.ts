import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { SchoolYear, SchoolYearSchema } from './schemas/school-year.schema';
import { Semester, SemesterSchema } from './schemas/semester.schema';
import { Class, ClassSchema } from './schemas/class.schema';
import { Position, PositionSchema } from './schemas/position.schema';
import { Student, StudentSchema } from './schemas/student.schema';
import { AttendanceRecord, AttendanceRecordSchema } from './schemas/attendance-record.schema';
import { ConductCatalogItem, ConductCatalogItemSchema } from './schemas/conduct-catalog-item.schema';
import { ConductLog, ConductLogSchema } from './schemas/conduct-log.schema';
import { SchoolConfig, SchoolConfigSchema } from './schemas/school-config.schema';
import { Punishment, PunishmentSchema } from './schemas/punishment.schema';
import { Holiday, HolidaySchema } from './schemas/holiday.schema';
import { TimetableSlot, TimetableSlotSchema } from './schemas/timetable-slot.schema';
import { PpctItem, PpctItemSchema } from './schemas/ppct-item.schema';
import { LessonLog, LessonLogSchema } from './schemas/lesson-log.schema';

@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGODB_URI ?? 'mongodb://localhost:27017/so_chu_nhiem?replicaSet=rs0',
      { lazyConnection: true },
    ),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: SchoolYear.name, schema: SchoolYearSchema },
      { name: Semester.name, schema: SemesterSchema },
      { name: Class.name, schema: ClassSchema },
      { name: Position.name, schema: PositionSchema },
      { name: Student.name, schema: StudentSchema },
      { name: AttendanceRecord.name, schema: AttendanceRecordSchema },
      { name: ConductCatalogItem.name, schema: ConductCatalogItemSchema },
      { name: ConductLog.name, schema: ConductLogSchema },
      { name: SchoolConfig.name, schema: SchoolConfigSchema },
      { name: Punishment.name, schema: PunishmentSchema },
      { name: Holiday.name, schema: HolidaySchema },
      { name: TimetableSlot.name, schema: TimetableSlotSchema },
      { name: PpctItem.name, schema: PpctItemSchema },
      { name: LessonLog.name, schema: LessonLogSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
