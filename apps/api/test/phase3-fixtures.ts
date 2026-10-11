import { ModelDefinition, getModelToken } from '@nestjs/mongoose';
import { TestingModule } from '@nestjs/testing';
import { Model, Types } from 'mongoose';
import { User, UserSchema } from '../src/database/schemas/user.schema';
import { SchoolYear, SchoolYearSchema } from '../src/database/schemas/school-year.schema';
import { Semester, SemesterSchema } from '../src/database/schemas/semester.schema';
import { Class, ClassSchema } from '../src/database/schemas/class.schema';
import { Position, PositionSchema } from '../src/database/schemas/position.schema';
import { Student, StudentSchema } from '../src/database/schemas/student.schema';
import { AttendanceRecord, AttendanceRecordSchema } from '../src/database/schemas/attendance-record.schema';
import { ConductCatalogItem, ConductCatalogItemSchema } from '../src/database/schemas/conduct-catalog-item.schema';
import { ConductLog, ConductLogSchema } from '../src/database/schemas/conduct-log.schema';
import { SchoolConfig, SchoolConfigSchema } from '../src/database/schemas/school-config.schema';
import { Punishment, PunishmentSchema } from '../src/database/schemas/punishment.schema';
import { Holiday, HolidaySchema } from '../src/database/schemas/holiday.schema';
import { TimetableSlot, TimetableSlotSchema } from '../src/database/schemas/timetable-slot.schema';
import { PpctItem, PpctItemSchema } from '../src/database/schemas/ppct-item.schema';
import { LessonLog, LessonLogSchema } from '../src/database/schemas/lesson-log.schema';

// Khớp đúng danh sách model của DatabaseModule (toàn bộ schema hiện có + 4 schema Phase 3).
export const PHASE3_SCHEMAS: ModelDefinition[] = [
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
];

export interface Phase3Models {
  user: Model<User>;
  schoolYear: Model<SchoolYear>;
  schoolConfig: Model<SchoolConfig>;
  klass: Model<Class>;
  position: Model<Position>;
  student: Model<Student>;
  holiday: Model<Holiday>;
  timetableSlot: Model<TimetableSlot>;
  ppctItem: Model<PpctItem>;
  lessonLog: Model<LessonLog>;
}

export function getPhase3Models(moduleRef: TestingModule): Phase3Models {
  return {
    user: moduleRef.get(getModelToken(User.name)),
    schoolYear: moduleRef.get(getModelToken(SchoolYear.name)),
    schoolConfig: moduleRef.get(getModelToken(SchoolConfig.name)),
    klass: moduleRef.get(getModelToken(Class.name)),
    position: moduleRef.get(getModelToken(Position.name)),
    student: moduleRef.get(getModelToken(Student.name)),
    holiday: moduleRef.get(getModelToken(Holiday.name)),
    timetableSlot: moduleRef.get(getModelToken(TimetableSlot.name)),
    ppctItem: moduleRef.get(getModelToken(PpctItem.name)),
    lessonLog: moduleRef.get(getModelToken(LessonLog.name)),
  };
}

// Đợi collection + unique index build xong TRƯỚC khi chạy transaction (tạo index song song với transaction
// trên cùng collection làm transaction bị abort).
export async function initPhase3Models(models: Phase3Models): Promise<void> {
  for (const model of Object.values(models)) {
    await model.init();
  }
}

export async function clearPhase3Data(models: Phase3Models): Promise<void> {
  for (const model of Object.values(models)) {
    await model.deleteMany({});
  }
}

export const d = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

export interface FixedClock {
  now(): Date;
  set(iso: string): void;
}

export function createFixedClock(iso: string): FixedClock {
  let current = new Date(iso);
  return {
    now: () => new Date(current),
    set: (next: string) => {
      current = new Date(next);
    },
  };
}

export async function seedSchoolYear(
  models: Phase3Models,
  args: { name: string; start: string; end: string; isCurrent?: boolean },
): Promise<string> {
  const year = await models.schoolYear.create({
    name: args.name,
    startDate: d(args.start),
    endDate: d(args.end),
    isCurrent: args.isCurrent ?? false,
  });
  return String(year._id);
}

export async function seedSubjectPosition(
  models: Phase3Models,
  args: { schoolYearId: string; className: string; subject: string; holderId?: string },
): Promise<{ classId: string; positionId: string }> {
  const klass = await models.klass.create({
    code: `${args.className}-${new Types.ObjectId().toHexString().slice(-6)}`,
    name: args.className,
    schoolYearId: args.schoolYearId,
  });
  const position = await models.position.create({
    classId: klass._id,
    type: 'SUBJECT',
    subject: args.subject,
    holderId: args.holderId ?? null,
  });
  return { classId: String(klass._id), positionId: String(position._id) };
}

// Trả id các slot theo đúng thứ tự `rows`.
export async function seedSlots(
  models: Phase3Models,
  positionId: string,
  rows: Array<{ dayOfWeek: number; period: number; from?: string; to?: string | null }>,
): Promise<string[]> {
  const created = await models.timetableSlot.insertMany(
    rows.map((row) => ({
      positionId,
      dayOfWeek: row.dayOfWeek,
      period: row.period,
      effectiveFrom: d(row.from ?? '2026-01-05'),
      effectiveTo: row.to ? d(row.to) : null,
    })),
  );
  return created.map((slot) => String(slot._id));
}

// Trả id các mục theo `order` (order 1..count).
export async function seedPpct(
  models: Phase3Models,
  positionId: string,
  count: number,
  opts: { periodCount?: number } = {},
): Promise<string[]> {
  const created = await models.ppctItem.insertMany(
    Array.from({ length: count }, (_, i) => ({
      positionId,
      order: i + 1,
      week: i + 1,
      periodLabel: String(i + 1),
      title: `Bài ${i + 1}`,
      periodCount: opts.periodCount ?? 1,
    })),
  );
  return created.map((item) => String(item._id));
}
