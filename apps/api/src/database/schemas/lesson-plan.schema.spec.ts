import mongoose, { Schema as MongooseSchema } from 'mongoose';
import { HolidaySchema } from './holiday.schema';
import { TimetableSlotSchema } from './timetable-slot.schema';
import { PpctItemSchema } from './ppct-item.schema';
import { LessonLogSchema } from './lesson-log.schema';
import { SchoolConfigSchema } from './school-config.schema';

// Connection không mở kết nối thật — chỉ để dựng model và gọi validateSync()/default mà không cần DB.
const connection = mongoose.createConnection();
const HolidayModel = connection.model('Holiday', HolidaySchema);
const TimetableSlotModel = connection.model('TimetableSlot', TimetableSlotSchema);
const PpctItemModel = connection.model('PpctItem', PpctItemSchema);
const LessonLogModel = connection.model('LessonLog', LessonLogSchema);
const SchoolConfigModel = connection.model('SchoolConfig', SchoolConfigSchema);

const newId = () => new mongoose.Types.ObjectId();

describe('Phase 3 schemas — field ObjectId ref không bị cast thành Mixed', () => {
  it.each([
    ['Holiday.schoolYearId', HolidaySchema, 'schoolYearId'],
    ['TimetableSlot.positionId', TimetableSlotSchema, 'positionId'],
    ['PpctItem.positionId', PpctItemSchema, 'positionId'],
    ['LessonLog.positionId', LessonLogSchema, 'positionId'],
    ['LessonLog.ppctItemId', LessonLogSchema, 'ppctItemId'],
  ])('%s có instance ObjectId', (_label, schema: MongooseSchema, field) => {
    expect(schema.path(field).instance).toBe('ObjectId');
  });
});

describe('HolidaySchema', () => {
  it('có index (schoolYearId, startDate) không unique', () => {
    const entry = HolidaySchema.indexes().find(
      ([fields]) => JSON.stringify(fields) === JSON.stringify({ schoolYearId: 1, startDate: 1 }),
    );
    expect(entry).toBeDefined();
    expect(entry?.[1].unique).toBeUndefined();
  });

  it('từ chối type ngoài LE | DOT_XUAT | KHAC', () => {
    const doc = new HolidayModel({
      schoolYearId: newId(),
      startDate: new Date('2026-02-16T00:00:00Z'),
      endDate: new Date('2026-02-20T00:00:00Z'),
      type: 'TET',
      name: 'Tết',
    });
    const error = doc.validateSync();
    expect(error?.errors.type).toBeDefined();
  });

  it.each(['LE', 'DOT_XUAT', 'KHAC'])('chấp nhận type %s', (type) => {
    const doc = new HolidayModel({
      schoolYearId: newId(),
      startDate: new Date('2026-02-16T00:00:00Z'),
      endDate: new Date('2026-02-20T00:00:00Z'),
      type,
      name: 'Nghỉ',
    });
    expect(doc.validateSync()).toBeUndefined();
  });
});

describe('TimetableSlotSchema', () => {
  it('có index (positionId, dayOfWeek, period) không unique', () => {
    const entry = TimetableSlotSchema.indexes().find(
      ([fields]) =>
        JSON.stringify(fields) === JSON.stringify({ positionId: 1, dayOfWeek: 1, period: 1 }),
    );
    expect(entry).toBeDefined();
    expect(entry?.[1].unique).toBeUndefined();
  });

  it('effectiveTo mặc định null (không giới hạn) và vẫn là kiểu Date', () => {
    const doc = new TimetableSlotModel({
      positionId: newId(),
      dayOfWeek: 2,
      period: 1,
      effectiveFrom: new Date('2026-01-05T00:00:00Z'),
    });
    expect(doc.effectiveTo).toBeNull();
    expect(doc.validateSync()).toBeUndefined();
    expect(TimetableSlotSchema.path('effectiveTo').instance).toBe('Date');
  });
});

describe('PpctItemSchema', () => {
  it('có unique index (positionId, order)', () => {
    expect(PpctItemSchema.indexes()).toContainEqual([
      { positionId: 1, order: 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });

  it('mặc định requirement là chuỗi rỗng và periodCount là 1', () => {
    const doc = new PpctItemModel({
      positionId: newId(),
      order: 1,
      week: 1,
      periodLabel: '1',
      title: 'Bài mở đầu',
    });
    expect(doc.requirement).toBe('');
    expect(doc.periodCount).toBe(1);
    expect(doc.validateSync()).toBeUndefined();
  });

  it('không bắt buộc note', () => {
    const doc = new PpctItemModel({
      positionId: newId(),
      order: 1,
      week: 1,
      periodLabel: 'TC1',
      title: 'Tự chọn',
    });
    expect(doc.note).toBeUndefined();
  });
});

describe('LessonLogSchema', () => {
  it('có unique index (positionId, ppctItemId) và index (positionId, date) không unique', () => {
    const indexes = LessonLogSchema.indexes();
    expect(indexes).toContainEqual([
      { positionId: 1, ppctItemId: 1 },
      expect.objectContaining({ unique: true }),
    ]);
    const byDate = indexes.find(
      ([fields]) => JSON.stringify(fields) === JSON.stringify({ positionId: 1, date: 1 }),
    );
    expect(byDate).toBeDefined();
    expect(byDate?.[1].unique).toBeUndefined();
  });

  it('mặc định done và isManuallyAdjusted là false', () => {
    const doc = new LessonLogModel({
      positionId: newId(),
      ppctItemId: newId(),
      date: new Date('2026-01-05T00:00:00Z'),
    });
    expect(doc.done).toBe(false);
    expect(doc.isManuallyAdjusted).toBe(false);
    expect(doc.validateSync()).toBeUndefined();
  });
});

describe('SchoolConfigSchema', () => {
  it('saturdayIsSchoolDay mặc định false (document cũ thiếu field vẫn đọc ra false)', () => {
    expect(new SchoolConfigModel({}).saturdayIsSchoolDay).toBe(false);
  });
});
