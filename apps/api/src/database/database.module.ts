import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { SchoolYear, SchoolYearSchema } from './schemas/school-year.schema';
import { Semester, SemesterSchema } from './schemas/semester.schema';
import { Class, ClassSchema } from './schemas/class.schema';
import { Position, PositionSchema } from './schemas/position.schema';
import { Student, StudentSchema } from './schemas/student.schema';

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
    ]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
