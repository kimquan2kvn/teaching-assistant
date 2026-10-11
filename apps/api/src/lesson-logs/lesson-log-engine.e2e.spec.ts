import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { Clock } from '../common/utils/clock';
import { formatDateOnly } from '../common/utils/date';
import { runInTransaction } from '../common/utils/transaction';
import { LessonLogEngineService } from './lesson-log-engine.service';
import { buildTestMongoUri } from '../../test/build-test-mongo-uri';
import {
  PHASE3_SCHEMAS,
  Phase3Models,
  clearPhase3Data,
  createFixedClock,
  d,
  getPhase3Models,
  initPhase3Models,
  seedPpct,
  seedSchoolYear,
  seedSlots,
  seedSubjectPosition,
} from '../../test/phase3-fixtures';

const MON_THU = [
  { dayOfWeek: 2, period: 1 }, // Thứ Hai tiết 1 (2026-01-05 là Thứ Hai)
  { dayOfWeek: 5, period: 3 }, // Thứ Năm tiết 3
];
const YEAR_START = d('2025-09-05');
const NO_ROOM_MESSAGE = 'Ngày này không có tiết của môn';
const OCCUPIED_MESSAGE = 'Ngày này đã có buổi học khác, không thể chuyển vào';

describe('LessonLogEngineService (e2e)', () => {
  let moduleRef: TestingModule;
  let service: LessonLogEngineService;
  let models: Phase3Models;
  let connection: Connection;
  const clock = createFixedClock('2026-01-14T03:00:00Z');

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(buildTestMongoUri('lesson_log_engine_e2e')),
        MongooseModule.forFeature(PHASE3_SCHEMAS),
      ],
      providers: [LessonLogEngineService, { provide: Clock, useValue: clock }],
    }).compile();
    await moduleRef.init();
    service = moduleRef.get(LessonLogEngineService);
    models = getPhase3Models(moduleRef);
    connection = moduleRef.get(getConnectionToken());
    await initPhase3Models(models);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    clock.set('2026-01-14T03:00:00Z');
    await clearPhase3Data(models);
  });

  async function arrange(opts: { count?: number; yearEnd?: string; slots?: typeof MON_THU } = {}) {
    const schoolYearId = await seedSchoolYear(models, {
      name: '2025-2026',
      start: '2025-09-05',
      end: opts.yearEnd ?? '2026-05-31',
      isCurrent: true,
    });
    const { classId, positionId } = await seedSubjectPosition(models, { schoolYearId, className: '11A4', subject: 'Toán' });
    const slotIds = await seedSlots(models, positionId, opts.slots ?? MON_THU);
    const itemIds = await seedPpct(models, positionId, opts.count ?? 5);
    return { schoolYearId, classId, positionId, slotIds, itemIds };
  }

  async function datesOf(itemIds: string[]): Promise<Array<string | null>> {
    const logs = await models.lessonLog.find({ ppctItemId: { $in: itemIds } });
    const byItem = new Map(logs.map((log) => [String(log.ppctItemId), formatDateOnly(log.date)]));
    return itemIds.map((id) => byItem.get(id) ?? null);
  }

  async function logIdsOf(itemIds: string[]): Promise<Array<string | null>> {
    const logs = await models.lessonLog.find({ ppctItemId: { $in: itemIds } });
    const byItem = new Map(logs.map((log) => [String(log.ppctItemId), String(log._id)]));
    return itemIds.map((id) => byItem.get(id) ?? null);
  }

  async function settle(promise: Promise<unknown>): Promise<Error | null> {
    return promise.then(
      () => null,
      (error: Error) => error,
    );
  }

  it('(a) rải 5 mục vào Thứ Hai + Thứ Năm, mặc định done=false và isManuallyAdjusted=false', async () => {
    const { positionId, itemIds } = await arrange({ count: 5 });

    const result = await service.recalculate(positionId, YEAR_START);

    expect(result).toEqual({ scheduled: 5 });
    expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-08', '2026-01-12', '2026-01-15', '2026-01-19']);
    const logs = await models.lessonLog.find({ positionId });
    expect(logs).toHaveLength(5);
    expect(logs.every((log) => log.done === false && log.isManuallyAdjusted === false)).toBe(true);
  });

  it('(b) idempotent: tính lại lần 2 giữ nguyên _id và ngày của cả 5 log', async () => {
    const { positionId, itemIds } = await arrange({ count: 5 });
    await service.recalculate(positionId, YEAR_START);
    const idsBefore = await logIdsOf(itemIds);
    const datesBefore = await datesOf(itemIds);

    await service.recalculate(positionId, YEAR_START);

    expect(await logIdsOf(itemIds)).toEqual(idsBefore);
    expect(await datesOf(itemIds)).toEqual(datesBefore);
    expect(await models.lessonLog.countDocuments({ positionId })).toBe(5);
  });

  it('(c) kịch bản 8: tiết TC/CĐ xen kẽ và cột Tuần không ảnh hưởng, chỉ rải theo order', async () => {
    const { positionId, itemIds } = await arrange({ count: 4 });
    const labels = ['1', 'CĐ1', 'CĐ2', '2'];
    const weeks = [40, 1, 30, 2];
    for (let i = 0; i < itemIds.length; i++) {
      await models.ppctItem.updateOne({ _id: itemIds[i] }, { periodLabel: labels[i], week: weeks[i] });
    }

    await service.recalculate(positionId, YEAR_START);

    expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-08', '2026-01-12', '2026-01-15']);
  });

  it('(d) kịch bản 11: log done bị khóa, thêm ngày nghỉ đúng ngày của nó thì KHÔNG bị dời', async () => {
    const { schoolYearId, positionId, itemIds } = await arrange({ count: 3 });
    await service.recalculate(positionId, YEAR_START);
    expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-08', '2026-01-12']);
    await models.lessonLog.updateOne({ ppctItemId: itemIds[1] }, { done: true });
    const idsBefore = await logIdsOf(itemIds);
    await models.holiday.create({
      schoolYearId,
      startDate: d('2026-01-05'),
      endDate: d('2026-01-05'),
      type: 'LE',
      name: 'Nghỉ',
    });

    const result = await service.recalculate(positionId, d('2026-01-05'));

    expect(result).toEqual({ scheduled: 2 });
    expect(await datesOf(itemIds)).toEqual(['2026-01-12', '2026-01-08', '2026-01-15']);
    expect(await logIdsOf(itemIds)).toEqual(idsBefore);
    const doneLog = await models.lessonLog.findOne({ ppctItemId: itemIds[1] });
    expect(doneLog?.done).toBe(true);
  });

  it('(e) kịch bản 10: log kéo tay (isManuallyAdjusted) chiếm chỗ, các mục khác rải quanh nó', async () => {
    const { positionId, itemIds } = await arrange({ count: 4 });
    await service.recalculate(positionId, YEAR_START);
    await models.lessonLog.updateOne({ ppctItemId: itemIds[1] }, { isManuallyAdjusted: true, date: d('2026-01-12') });

    await service.recalculate(positionId, YEAR_START);

    expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-12', '2026-01-08', '2026-01-15']);
    const locked = await models.lessonLog.findOne({ ppctItemId: itemIds[1] });
    expect(locked?.isManuallyAdjusted).toBe(true);
  });

  it('(f) quá khứ bất biến: log date < fromDate giữ nguyên _id/ngày kể cả chưa khóa, phần sau xếp lại theo TKB mới', async () => {
    const { positionId, itemIds } = await arrange({ count: 5 });
    await service.recalculate(positionId, YEAR_START);
    const idsBefore = await logIdsOf(itemIds);
    await models.timetableSlot.deleteOne({ positionId, dayOfWeek: 5 });

    const result = await service.recalculate(positionId, d('2026-01-15'));

    expect(result).toEqual({ scheduled: 2 });
    expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-08', '2026-01-12', '2026-01-19', '2026-01-26']);
    const idsAfter = await logIdsOf(itemIds);
    expect(idsAfter).toEqual(idsBefore);
    expect(await models.lessonLog.countDocuments({ positionId })).toBe(5);
  });

  describe('(m) bài nhiều tiết bắt đầu trước fromDate vẫn giữ các ô sau fromDate', () => {
    // Bài 2 chiếm 2 ô (01-08 và 01-12): ngày hôm nay/fromDate rơi vào giữa 2 ô đó là chỗ engine dễ làm mất tiết thứ 2.
    async function arrangeMultiPeriod() {
      const ctx = await arrange({ count: 4 });
      await models.ppctItem.updateOne({ _id: ctx.itemIds[1] }, { periodCount: 2 });
      await service.recalculate(ctx.positionId, YEAR_START);
      expect(await datesOf(ctx.itemIds)).toEqual(['2026-01-05', '2026-01-08', '2026-01-15', '2026-01-19']);
      return ctx;
    }

    it('recalculateWithDefaultFrom với hôm nay = 01-10 (giữa 2 ô của bài 2): không đổi ngày/_id của bất kỳ log nào', async () => {
      const { positionId, itemIds } = await arrangeMultiPeriod();
      const idsBefore = await logIdsOf(itemIds);
      clock.set('2026-01-10T03:00:00Z');

      await service.recalculateWithDefaultFrom(positionId);

      expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-08', '2026-01-15', '2026-01-19']);
      expect(await logIdsOf(itemIds)).toEqual(idsBefore);
    });

    it('thêm ngày nghỉ 01-12 (ô thứ 2 của bài 2) rồi tính lại từ đó: bài 2 lấy ô kế tiếp, bài 3, 4 lùi', async () => {
      const { schoolYearId, positionId, itemIds } = await arrangeMultiPeriod();
      await models.holiday.create({
        schoolYearId,
        startDate: d('2026-01-12'),
        endDate: d('2026-01-12'),
        type: 'LE',
        name: 'Nghỉ',
      });

      await service.recalculate(positionId, d('2026-01-12'));

      expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-08', '2026-01-19', '2026-01-22']);
    });

    it('tính lại từ mọi fromDate khác nhau (có bài 2-3 tiết, ngày nghỉ, log done) cho đúng cùng một lịch, giữ nguyên _id', async () => {
      const { schoolYearId, positionId, itemIds } = await arrange({ count: 6 });
      const periodCounts = [1, 2, 1, 3, 1, 1];
      for (const [i, periodCount] of periodCounts.entries()) {
        await models.ppctItem.updateOne({ _id: itemIds[i] }, { periodCount });
      }
      await service.recalculate(positionId, YEAR_START);
      await models.lessonLog.updateOne({ ppctItemId: itemIds[2] }, { done: true });
      await models.holiday.create({
        schoolYearId,
        startDate: d('2026-01-12'),
        endDate: d('2026-01-12'),
        type: 'LE',
        name: 'Nghỉ',
      });
      await service.recalculate(positionId, d('2026-01-12'));
      const baseline = ['2026-01-05', '2026-01-08', '2026-01-15', '2026-01-22', '2026-02-02', '2026-02-05'];
      expect(await datesOf(itemIds)).toEqual(baseline);
      const idsBefore = await logIdsOf(itemIds);

      const fromDates = ['2025-09-05', '2026-01-05', '2026-01-06', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-12'].concat(
        ['2026-01-13', '2026-01-15', '2026-01-16', '2026-01-19', '2026-01-20', '2026-01-22', '2026-01-23', '2026-01-27'],
        ['2026-02-02', '2026-02-03', '2026-02-05', '2026-02-06'],
      );
      for (const from of fromDates) {
        await service.recalculate(positionId, d(from));

        expect({ from, dates: await datesOf(itemIds) }).toEqual({ from, dates: baseline });
        expect(await logIdsOf(itemIds)).toEqual(idsBefore);
      }
    });
  });

  describe('(g) recalculateWithDefaultFrom', () => {
    it('position chưa có log nào: rơi về đầu năm học dù hôm nay là 2026-01-14', async () => {
      const { positionId, itemIds } = await arrange({ count: 5 });

      const result = await service.recalculateWithDefaultFrom(positionId);

      expect(result).toEqual({ scheduled: 5 });
      expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-08', '2026-01-12', '2026-01-15', '2026-01-19']);
    });

    it('position đã có log: log trước hôm nay giữ nguyên, mục mới vào ô trống kế tiếp', async () => {
      const { positionId, itemIds } = await arrange({ count: 5 });
      await service.recalculate(positionId, YEAR_START);
      const sixthId = await addPpctItem(positionId, 6);
      const idsBefore = await logIdsOf(itemIds);

      const result = await service.recalculateWithDefaultFrom(positionId);

      expect(result).toEqual({ scheduled: 3 });
      expect(await datesOf([...itemIds, sixthId])).toEqual([
        '2026-01-05',
        '2026-01-08',
        '2026-01-12',
        '2026-01-15',
        '2026-01-19',
        '2026-01-22',
      ]);
      expect(await logIdsOf(itemIds)).toEqual(idsBefore);
    });

    it('"hôm nay" tính theo giờ Việt Nam: 2026-01-15 20:00 UTC đã là 2026-01-16 ở Việt Nam nên log 01-15 được giữ', async () => {
      const { positionId, itemIds } = await arrange({ count: 5 });
      await service.recalculate(positionId, YEAR_START);
      await models.timetableSlot.deleteOne({ positionId, dayOfWeek: 5 });
      clock.set('2026-01-15T20:00:00Z');

      const result = await service.recalculateWithDefaultFrom(positionId);

      // Nếu nhầm "hôm nay" = 2026-01-15 (theo UTC) thì mục 4 bị dời sang 01-19 và scheduled = 2.
      expect(result).toEqual({ scheduled: 1 });
      expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-08', '2026-01-12', '2026-01-15', '2026-01-19']);
    });
  });

  describe('(h) trạng thái rỗng', () => {
    it('có PPCT nhưng chưa có slot: scheduled=0, không throw, không tạo log', async () => {
      const { positionId } = await arrange({ count: 5, slots: [] });

      const result = await service.recalculate(positionId, YEAR_START);

      expect(result).toEqual({ scheduled: 0 });
      expect(await models.lessonLog.countDocuments({ positionId })).toBe(0);
    });

    it('position không có PPCT: scheduled=0, không throw', async () => {
      const { positionId } = await arrange({ count: 0 });

      await expect(service.recalculate(positionId, YEAR_START)).resolves.toEqual({ scheduled: 0 });
      expect(await models.lessonLog.countDocuments({ positionId })).toBe(0);
    });

    it('PPCT dài hơn số ô còn lại: chỉ tạo log cho phần vừa chỗ, không lỗi', async () => {
      const { positionId, itemIds } = await arrange({ count: 5, yearEnd: '2026-01-12' });

      const result = await service.recalculate(positionId, YEAR_START);

      expect(result).toEqual({ scheduled: 3 });
      expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-08', '2026-01-12', null, null]);
    });
  });

  it('(i) rollback: bulkWrite lỗi thì deleteMany trước đó cũng rollback, 5 log cũ còn nguyên', async () => {
    const { schoolYearId, positionId, itemIds } = await arrange({ count: 5 });
    await service.recalculate(positionId, YEAR_START);
    const idsBefore = await logIdsOf(itemIds);
    const datesBefore = await datesOf(itemIds);
    await models.schoolYear.updateOne({ _id: schoolYearId }, { endDate: d('2026-01-12') });
    jest.spyOn(models.lessonLog, 'bulkWrite').mockRejectedValueOnce(new Error('boom'));

    await expect(service.recalculate(positionId, YEAR_START)).rejects.toThrow('boom');

    expect(await models.lessonLog.countDocuments({ positionId })).toBe(5);
    expect(await logIdsOf(itemIds)).toEqual(idsBefore);
    expect(await datesOf(itemIds)).toEqual(datesBefore);

    // Đối chứng: không còn lỗi giả lập thì cùng lệnh tính lại này THẬT SỰ xóa 2 log mất chỗ.
    await service.recalculate(positionId, YEAR_START);
    expect(await models.lessonLog.countDocuments({ positionId })).toBe(3);
  });

  it('(j) recalculateSchoolYear chỉ động tới position có PPCT thuộc lớp của năm học đó', async () => {
    const a = await arrange({ count: 5 });
    const b = await seedSubjectPosition(models, { schoolYearId: a.schoolYearId, className: '11A5', subject: 'Văn' });
    await seedSlots(models, b.positionId, MON_THU);
    await seedPpct(models, b.positionId, 3);
    const withoutPpct = await seedSubjectPosition(models, { schoolYearId: a.schoolYearId, className: '11A6', subject: 'Lý' });
    await seedSlots(models, withoutPpct.positionId, MON_THU);
    const otherYearId = await seedSchoolYear(models, { name: '2026-2027', start: '2026-09-05', end: '2027-05-31' });
    const other = await seedSubjectPosition(models, { schoolYearId: otherYearId, className: '12A1', subject: 'Toán' });
    await seedSlots(models, other.positionId, MON_THU);
    await seedPpct(models, other.positionId, 4);

    const result = await runInTransaction(connection, (session) =>
      service.recalculateSchoolYear(a.schoolYearId, YEAR_START, session),
    );

    expect(result).toEqual({ positions: 2, scheduled: 8 });
    expect(await models.lessonLog.countDocuments({ positionId: a.positionId })).toBe(5);
    expect(await models.lessonLog.countDocuments({ positionId: b.positionId })).toBe(3);
    expect(await models.lessonLog.countDocuments({ positionId: withoutPpct.positionId })).toBe(0);
    expect(await models.lessonLog.countDocuments({ positionId: other.positionId })).toBe(0);
  });

  it('(l) chỉ áp ngày nghỉ của năm học của lớp, bỏ qua ngày nghỉ của năm học khác', async () => {
    const { positionId, itemIds } = await arrange({ count: 2 });
    const otherYearId = await seedSchoolYear(models, { name: '2026-2027', start: '2026-09-05', end: '2027-05-31' });
    await models.holiday.create({
      schoolYearId: otherYearId,
      startDate: d('2026-01-05'),
      endDate: d('2026-01-08'),
      type: 'KHAC',
      name: 'Nghỉ năm khác',
    });

    await service.recalculate(positionId, YEAR_START);

    expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-08']);
  });

  describe('(k) assertCanMoveLog', () => {
    async function arrangeForMove() {
      const ctx = await arrange({ count: 4 });
      await service.recalculate(ctx.positionId, YEAR_START);
      await models.holiday.create({
        schoolYearId: ctx.schoolYearId,
        startDate: d('2026-01-19'),
        endDate: d('2026-01-19'),
        type: 'LE',
        name: 'Nghỉ lễ',
      });
      await models.lessonLog.updateOne({ ppctItemId: ctx.itemIds[2] }, { isManuallyAdjusted: true }); // khóa ở 01-12
      return ctx;
    }
    const assertMove = (positionId: string, itemId: string, date: string) =>
      runInTransaction(connection, (session) => service.assertCanMoveLog(positionId, itemId, d(date), session));

    it('đích là ngày nghỉ: 400', async () => {
      const { positionId, itemIds } = await arrangeForMove();

      const error = await settle(assertMove(positionId, itemIds[0], '2026-01-19'));

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error?.message).toBe(NO_ROOM_MESSAGE);
    });

    it('đích là ngày không có slot (Thứ Ba): 400', async () => {
      const { positionId, itemIds } = await arrangeForMove();

      const error = await settle(assertMove(positionId, itemIds[0], '2026-01-13'));

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error?.message).toBe(NO_ROOM_MESSAGE);
    });

    it('đích nằm ngoài năm học: 400 (không có buổi học nào ở đó)', async () => {
      const { positionId, itemIds } = await arrangeForMove();

      const error = await settle(assertMove(positionId, itemIds[0], '2026-06-01'));

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error?.message).toBe(NO_ROOM_MESSAGE);
    });

    it('đích đã bị log khóa khác chiếm hết ô duy nhất: 409', async () => {
      const { positionId, itemIds } = await arrangeForMove();

      const error = await settle(assertMove(positionId, itemIds[0], '2026-01-12'));

      expect(error).toBeInstanceOf(ConflictException);
      expect(error?.message).toBe(OCCUPIED_MESSAGE);
    });

    it('đích hợp lệ và còn trống: resolve', async () => {
      const { positionId, itemIds } = await arrangeForMove();

      await expect(assertMove(positionId, itemIds[0], '2026-01-22')).resolves.toBeUndefined();
    });

    it('log của chính mục đang chuyển không tự chặn mình (chuyển lại đúng ngày đã khóa của nó)', async () => {
      const { positionId, itemIds } = await arrangeForMove();

      await expect(assertMove(positionId, itemIds[2], '2026-01-12')).resolves.toBeUndefined();
    });
  });

  async function addPpctItem(positionId: string, order: number): Promise<string> {
    const created = await models.ppctItem.create({
      positionId,
      order,
      week: order,
      periodLabel: String(order),
      title: `Bài ${order}`,
      periodCount: 1,
    });
    return String(created._id);
  }
});
