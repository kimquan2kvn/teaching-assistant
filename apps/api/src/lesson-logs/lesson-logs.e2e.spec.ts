import { Types } from 'mongoose';
import request from 'supertest';
import { formatDateOnly } from '../common/utils/date';
import { LessonLogEngineService } from './lesson-log-engine.service';
import { LessonLogsController } from './lesson-logs.controller';
import { LessonLogsService } from './lesson-logs.service';
import { Phase3App, Phase3Session, createPhase3App } from '../../test/phase3-test-app';
import { d, seedPpct, seedSlots, seedSubjectPosition } from '../../test/phase3-fixtures';

const LOG_NOT_FOUND = 'Không tìm thấy buổi học';
const NO_CELL = 'Ngày này không có tiết của môn';
const OCCUPIED = 'Ngày này đã có buổi học khác, không thể chuyển vào';
const NEED_FIELD = 'Cần gửi ít nhất một trong hai trường: date hoặc done';
const INVALID_BODY = 'Dữ liệu gửi lên không hợp lệ';
const INVALID_DATE = 'Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd';
const RANGE_ORDER = 'Ngày bắt đầu không được sau ngày kết thúc';
// Thứ Hai (tiết 1) + Thứ Năm (tiết 3) từ 2026-01-05: chuỗi ô tự do của fixture.
const MON_THU_DATES = ['2026-01-05', '2026-01-08', '2026-01-12', '2026-01-15', '2026-01-19'];
const MON_THU_SLOTS = [
  { dayOfWeek: 2, period: 1 },
  { dayOfWeek: 5, period: 3 },
];

describe('LessonLogs (e2e)', () => {
  let ctx: Phase3App;
  let engine: LessonLogEngineService;
  let teacher: Phase3Session;
  let otherTeacher: Phase3Session;
  let admin: Phase3Session;
  let student: Phase3Session;
  let gvcnCounter = 0;

  beforeAll(async () => {
    ctx = await createPhase3App({
      dbName: 'lesson_logs_e2e',
      controllers: [LessonLogsController],
      providers: [LessonLogsService, LessonLogEngineService],
    });
    engine = ctx.app.get(LessonLogEngineService);
    teacher = await ctx.register('gvbm.lessonlog');
    otherTeacher = await ctx.register('gvbm.lessonlog.khac');
    admin = await ctx.register('admin.lessonlog', 'ADMIN');
    student = await ctx.register('hocsinh.lessonlog', 'STUDENT');
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    ctx.clock.set('2026-01-04T03:00:00Z');
    const { models } = ctx;
    await models.lessonLog.deleteMany({});
    await models.ppctItem.deleteMany({});
    await models.timetableSlot.deleteMany({});
    await models.holiday.deleteMany({});
    await models.position.deleteMany({});
    await models.klass.deleteMany({});
  });

  const api = () => request(ctx.app.getHttpServer());
  const logsUrl = (positionId: string, suffix = '') => `/positions/${positionId}/lesson-logs${suffix}`;
  const as = (session: Phase3Session, req: request.Test) => req.set('Authorization', `Bearer ${session.token}`);

  // 5 mục PPCT + slot Thứ Hai/Thứ Năm, đã xếp sẵn log 01-05, 01-08, 01-12, 01-15, 01-19.
  async function arrange(opts: { holder?: Phase3Session | null; className?: string; count?: number } = {}) {
    const holder = opts.holder === undefined ? teacher : opts.holder;
    const { positionId, classId } = await seedSubjectPosition(ctx.models, {
      schoolYearId: ctx.schoolYearId,
      className: opts.className ?? '11A4',
      subject: 'Toán',
      holderId: holder?.userId,
    });
    await seedSlots(ctx.models, positionId, MON_THU_SLOTS);
    const itemIds = await seedPpct(ctx.models, positionId, opts.count ?? 5);
    await engine.recalculate(positionId, d('2025-09-05'));
    return { positionId, classId, itemIds };
  }

  const logOf = (itemId: string) => ctx.models.lessonLog.findOne({ ppctItemId: itemId });

  // Trả ngày (yyyy-mm-dd) của log theo đúng thứ tự `itemIds`, null nếu mục chưa có log.
  async function datesOf(itemIds: string[]): Promise<Array<string | null>> {
    const logs = await ctx.models.lessonLog.find({ ppctItemId: { $in: itemIds } });
    const byItem = new Map(logs.map((log) => [String(log.ppctItemId), formatDateOnly(log.date)]));
    return itemIds.map((id) => byItem.get(id) ?? null);
  }

  async function manualFlagsOf(itemIds: string[]): Promise<boolean[]> {
    const logs = await ctx.models.lessonLog.find({ ppctItemId: { $in: itemIds } });
    const byItem = new Map(logs.map((log) => [String(log.ppctItemId), log.isManuallyAdjusted]));
    return itemIds.map((id) => byItem.get(id) ?? false);
  }

  async function patchLog(session: Phase3Session, positionId: string, logId: string, body: Record<string, unknown>) {
    return as(session, api().patch(logsUrl(positionId, `/${logId}`))).send(body);
  }

  async function patchItem(session: Phase3Session, positionId: string, itemId: string, body: Record<string, unknown>) {
    const log = await logOf(itemId);
    return patchLog(session, positionId, String(log!._id), body);
  }

  function declareHoliday(date: string) {
    return ctx.models.holiday.create({
      schoolYearId: ctx.schoolYearId,
      startDate: d(date),
      endDate: d(date),
      type: 'LE',
      name: 'Nghỉ',
    });
  }

  describe('đọc (GET)', () => {
    it('trả log kèm ppctItem đúng, sắp theo ngày; không có from/to thì trả tất cả', async () => {
      const { positionId, itemIds } = await arrange();

      const res = await as(teacher, api().get(logsUrl(positionId)));

      expect(res.status).toBe(200);
      expect(res.body.map((log: { date: string }) => log.date.slice(0, 10))).toEqual(MON_THU_DATES);
      expect(res.body.map((log: { ppctItemId: string }) => log.ppctItemId)).toEqual(itemIds);
      expect(res.body[0]).toMatchObject({
        positionId,
        ppctItemId: itemIds[0],
        date: '2026-01-05T00:00:00.000Z',
        done: false,
        isManuallyAdjusted: false,
        ppctItem: { order: 1, week: 1, periodLabel: '1', title: 'Bài 1', periodCount: 1, requirement: '' },
      });
      expect(typeof res.body[0]._id).toBe('string');
    });

    it('sắp theo ngày dù thứ tự lưu trong DB khác; cùng ngày thì sắp theo order của mục PPCT', async () => {
      const { positionId, itemIds } = await arrange();
      await ctx.models.lessonLog.deleteMany({ positionId });
      // Chèn theo thứ tự mục 5, 4, 3, 2, 1: mục 5 và 4 cùng ngày 01-05 nhưng mục 5 được lưu trước, nên chỉ khi sắp
      // theo order của mục PPCT thì mục 4 mới đứng trước mục 5.
      const dates = ['2026-01-19', '2026-01-15', '2026-01-12', '2026-01-05', '2026-01-05'];
      await ctx.models.lessonLog.insertMany(
        [4, 3, 2, 1, 0].map((i) => ({ positionId, ppctItemId: itemIds[i], date: d(dates[i]) })),
      );

      const res = await as(teacher, api().get(logsUrl(positionId)));

      expect(res.status).toBe(200);
      expect(res.body.map((log: { ppctItemId: string }) => log.ppctItemId)).toEqual([
        itemIds[3],
        itemIds[4],
        itemIds[2],
        itemIds[1],
        itemIds[0],
      ]);
    });

    it('from/to lọc theo khoảng gồm cả hai đầu; chỉ from hoặc chỉ to cũng được', async () => {
      const { positionId, itemIds } = await arrange();

      const both = await as(teacher, api().get(`${logsUrl(positionId)}?from=2026-01-08&to=2026-01-15`));
      expect(both.status).toBe(200);
      expect(both.body.map((log: { ppctItemId: string }) => log.ppctItemId)).toEqual(itemIds.slice(1, 4));

      const fromOnly = await as(teacher, api().get(`${logsUrl(positionId)}?from=2026-01-12`));
      expect(fromOnly.body.map((log: { ppctItemId: string }) => log.ppctItemId)).toEqual(itemIds.slice(2));

      const toOnly = await as(teacher, api().get(`${logsUrl(positionId)}?to=2026-01-08`));
      expect(toOnly.body.map((log: { ppctItemId: string }) => log.ppctItemId)).toEqual(itemIds.slice(0, 2));

      const none = await as(teacher, api().get(`${logsUrl(positionId)}?from=2026-03-01&to=2026-03-31`));
      expect(none.status).toBe(200);
      expect(none.body).toEqual([]);
    });

    it('from/to sai định dạng hoặc ngày không có thật -> 400; from > to -> 400 kèm thông báo', async () => {
      const { positionId } = await arrange();

      const impossible = await as(teacher, api().get(`${logsUrl(positionId)}?from=2026-02-30`));
      expect(impossible.status).toBe(400);
      expect(impossible.body.message).toBe(INVALID_DATE);

      const vnFormat = await as(teacher, api().get(`${logsUrl(positionId)}?to=19/01/2026`));
      expect(vnFormat.status).toBe(400);
      expect(vnFormat.body.message).toBe(INVALID_DATE);

      const reversed = await as(teacher, api().get(`${logsUrl(positionId)}?from=2026-01-15&to=2026-01-08`));
      expect(reversed.status).toBe(400);
      expect(reversed.body.message).toBe(RANGE_ORDER);

      const sameDay = await as(teacher, api().get(`${logsUrl(positionId)}?from=2026-01-08&to=2026-01-08`));
      expect(sameDay.status).toBe(200);
      expect(sameDay.body).toHaveLength(1);
    });

    it('không lẫn log của position khác; position chưa có log hoặc là HOMEROOM -> mảng rỗng', async () => {
      const mine = await arrange({ className: '11A4' });
      await arrange({ holder: otherTeacher, className: '11A5' });
      const empty = await seedSubjectPosition(ctx.models, {
        schoolYearId: ctx.schoolYearId,
        className: '11A6',
        subject: 'Toán',
        holderId: teacher.userId,
      });
      const gvcn = await ctx.createClass(`gvcn.lessonlog.empty.${gvcnCounter++}`, '11A7');

      const res = await as(teacher, api().get(logsUrl(mine.positionId)));
      expect(res.body).toHaveLength(5);
      expect(res.body.every((log: { positionId: string }) => log.positionId === mine.positionId)).toBe(true);

      expect((await as(teacher, api().get(logsUrl(empty.positionId)))).body).toEqual([]);
      const homeroom = await as(gvcn, api().get(logsUrl(gvcn.homeroomPositionId)));
      expect(homeroom.status).toBe(200);
      expect(homeroom.body).toEqual([]);
    });

    it('ghép PPCT bằng đúng 1 query logs + 1 query PPCT (không N+1)', async () => {
      const { positionId } = await arrange();
      const findLogs = jest.spyOn(ctx.models.lessonLog, 'find');
      const findItems = jest.spyOn(ctx.models.ppctItem, 'find');

      const res = await as(teacher, api().get(logsUrl(positionId)));

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(5);
      expect(findLogs).toHaveBeenCalledTimes(1);
      expect(findItems).toHaveBeenCalledTimes(1);
    });
  });

  describe('tích đã thực hiện (PATCH { done })', () => {
    it('{done:true} -> 200 kèm ppctItem, lưu done, không đổi ngày/isManuallyAdjusted, không tính lại', async () => {
      const { positionId, itemIds } = await arrange();
      const recalculate = jest.spyOn(engine, 'recalculate');

      const res = await patchItem(teacher, positionId, itemIds[1], { done: true });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ppctItemId: itemIds[1],
        positionId,
        done: true,
        isManuallyAdjusted: false,
        date: '2026-01-08T00:00:00.000Z',
        ppctItem: { order: 2, title: 'Bài 2' },
      });
      expect((await logOf(itemIds[1]))!.done).toBe(true);
      expect(await datesOf(itemIds)).toEqual(MON_THU_DATES);
      expect(recalculate).not.toHaveBeenCalled();
    });

    it('{done:false} bỏ tích được', async () => {
      const { positionId, itemIds } = await arrange();
      await patchItem(teacher, positionId, itemIds[0], { done: true });

      const res = await patchItem(teacher, positionId, itemIds[0], { done: false });

      expect(res.status).toBe(200);
      expect(res.body.done).toBe(false);
      expect((await logOf(itemIds[0]))!.done).toBe(false);
    });

    it('log đã done bị khóa: thêm ngày nghỉ vào đúng ngày của nó rồi tính lại thì log vẫn giữ ngày', async () => {
      const { positionId, itemIds } = await arrange();
      expect((await patchItem(teacher, positionId, itemIds[1], { done: true })).status).toBe(200);

      await declareHoliday('2026-01-08');
      await engine.recalculate(positionId, d('2026-01-05'));

      expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-08', '2026-01-15', '2026-01-19', '2026-01-22']);
      expect((await logOf(itemIds[1]))!.done).toBe(true);
    });
  });

  describe('kéo chỉnh tay (PATCH { date })', () => {
    it('chuyển mục 1 sang 2026-01-22 (Thứ Năm trống) -> isManuallyAdjusted, các log chưa khóa dồn lại quanh nó', async () => {
      const { positionId, itemIds } = await arrange();

      const res = await patchItem(teacher, positionId, itemIds[0], { date: '2026-01-22' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ppctItemId: itemIds[0],
        date: '2026-01-22T00:00:00.000Z',
        isManuallyAdjusted: true,
        done: false,
        ppctItem: { order: 1 },
      });
      expect(await datesOf(itemIds)).toEqual(['2026-01-22', '2026-01-05', '2026-01-08', '2026-01-12', '2026-01-15']);
      expect(await manualFlagsOf(itemIds)).toEqual([true, false, false, false, false]);
    });

    it('chuyển mục 5 lên sớm hơn (01-19 -> 01-08): tính lại từ ngày sớm hơn, các mục chưa khóa lùi lại', async () => {
      const { positionId, itemIds } = await arrange();

      const res = await patchItem(teacher, positionId, itemIds[4], { date: '2026-01-08' });

      expect(res.status).toBe(200);
      expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-12', '2026-01-15', '2026-01-19', '2026-01-08']);
      expect(await manualFlagsOf(itemIds)).toEqual([false, false, false, false, true]);
    });

    it('gửi cả date và done: vừa chuyển ngày vừa tích', async () => {
      const { positionId, itemIds } = await arrange();

      const res = await patchItem(teacher, positionId, itemIds[0], { date: '2026-01-22', done: true });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ date: '2026-01-22T00:00:00.000Z', done: true, isManuallyAdjusted: true });
      expect(await datesOf(itemIds)).toEqual(['2026-01-22', '2026-01-05', '2026-01-08', '2026-01-12', '2026-01-15']);
    });

    it('date trùng ngày hiện tại thì không phải kéo tay: không đặt isManuallyAdjusted, không tính lại', async () => {
      const { positionId, itemIds } = await arrange();
      const recalculate = jest.spyOn(engine, 'recalculate');

      const res = await patchItem(teacher, positionId, itemIds[0], { date: '2026-01-05', done: true });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ date: '2026-01-05T00:00:00.000Z', done: true, isManuallyAdjusted: false });
      expect(recalculate).not.toHaveBeenCalled();
    });

    it('ngày không có tiết (Thứ Ba), ngày nghỉ đã khai báo, ngoài năm học -> 400, log không đổi', async () => {
      const { positionId, itemIds } = await arrange();
      await declareHoliday('2026-01-22');

      for (const date of ['2026-01-06', '2026-01-22', '2027-01-04']) {
        const res = await patchItem(teacher, positionId, itemIds[0], { date });
        expect([date, res.status, res.body.message]).toEqual([date, 400, NO_CELL]);
      }

      expect(await datesOf(itemIds)).toEqual(MON_THU_DATES);
      expect(await manualFlagsOf(itemIds)).toEqual([false, false, false, false, false]);
    });

    it('đổi vào ngày mà ô duy nhất đã bị log done khác chiếm -> 409, log không đổi', async () => {
      const { positionId, itemIds } = await arrange();
      await patchItem(teacher, positionId, itemIds[2], { done: true }); // mục 3 done ở 01-12 (ô duy nhất của ngày)

      const res = await patchItem(teacher, positionId, itemIds[0], { date: '2026-01-12' });

      expect(res.status).toBe(409);
      expect(res.body.message).toBe(OCCUPIED);
      expect(await datesOf(itemIds)).toEqual(MON_THU_DATES);
      expect((await logOf(itemIds[0]))!.isManuallyAdjusted).toBe(false);
    });

    it('body sai: {} -> 400 kèm thông báo thiếu trường; done sai kiểu / date sai định dạng -> 400, log không đổi', async () => {
      const { positionId, itemIds } = await arrange();

      const empty = await patchItem(teacher, positionId, itemIds[0], {});
      expect(empty.status).toBe(400);
      expect(empty.body.message).toContain(NEED_FIELD);

      for (const body of [{ done: 'yes' }, { date: '2026-02-30' }, { date: '22/01/2026' }, { date: 20260122 }]) {
        const res = await patchItem(teacher, positionId, itemIds[0], body);
        expect([JSON.stringify(body), res.status]).toEqual([JSON.stringify(body), 400]);
        expect(res.body.message).toContain(INVALID_BODY);
      }

      expect(await datesOf(itemIds)).toEqual(MON_THU_DATES);
      expect((await logOf(itemIds[0]))!.done).toBe(false);
    });
  });

  describe('IDOR qua id con', () => {
    it('PATCH /positions/<A>/lesson-logs/<log của B> -> 404 và log của B nguyên vẹn (cả done lẫn date)', async () => {
      const mine = await arrange({ className: '11A4' });
      const theirs = await arrange({ holder: otherTeacher, className: '11A5' });
      const theirLog = await logOf(theirs.itemIds[0]);

      for (const body of [{ done: true }, { date: '2026-01-22' }, { date: '2026-01-22', done: true }]) {
        const res = await patchLog(teacher, mine.positionId, String(theirLog!._id), body);
        expect([JSON.stringify(body), res.status, res.body.message]).toEqual([JSON.stringify(body), 404, LOG_NOT_FOUND]);
      }

      const after = await logOf(theirs.itemIds[0]);
      expect(after).toMatchObject({ done: false, isManuallyAdjusted: false });
      expect(formatDateOnly(after!.date)).toBe('2026-01-05');
      expect(String(after!.positionId)).toBe(theirs.positionId);
      expect(await datesOf(theirs.itemIds)).toEqual(MON_THU_DATES);
    });

    it('ADMIN cũng không sửa được log của position khác qua đường dẫn của position A', async () => {
      const mine = await arrange({ className: '11A4' });
      const theirs = await arrange({ holder: otherTeacher, className: '11A5' });
      const theirLog = await logOf(theirs.itemIds[0]);

      const res = await patchLog(admin, mine.positionId, String(theirLog!._id), { done: true });

      expect(res.status).toBe(404);
      expect((await logOf(theirs.itemIds[0]))!.done).toBe(false);
    });

    it('id không tồn tại hoặc không phải ObjectId -> 404, không phải 400/500', async () => {
      const { positionId } = await arrange();
      for (const logId of ['khong-phai-objectid', '123', 'abcdefghijkl', new Types.ObjectId().toHexString()]) {
        const res = await patchLog(teacher, positionId, logId, { done: true });
        expect([logId, res.status, res.body.message]).toEqual([logId, 404, LOG_NOT_FOUND]);
      }
    });
  });

  describe('rollback khi tính lại lỗi', () => {
    let consoleError: jest.SpyInstance;

    beforeEach(() => {
      // MongoExceptionFilter log lỗi lạ ra console.error; ở đây lỗi 'boom' là chủ đích.
      consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      consoleError.mockRestore();
    });

    it('PATCH { date }: engine.recalculate lỗi -> 500, log vẫn ở ngày cũ, isManuallyAdjusted vẫn false', async () => {
      const { positionId, itemIds } = await arrange();
      jest.spyOn(engine, 'recalculate').mockRejectedValueOnce(new Error('boom'));

      const res = await patchItem(teacher, positionId, itemIds[0], { date: '2026-01-22', done: true });

      expect(res.status).toBe(500);
      const log = await logOf(itemIds[0]);
      expect(formatDateOnly(log!.date)).toBe('2026-01-05');
      expect(log).toMatchObject({ isManuallyAdjusted: false, done: false });
      expect(await datesOf(itemIds)).toEqual(MON_THU_DATES);
    });
  });

  describe('POST recalculate (ADMIN)', () => {
    it('không body: tính lại từ hôm nay (VN), log đã kéo tay vẫn giữ, scheduled = số mục được xếp lại', async () => {
      const { positionId, itemIds } = await arrange();
      // Mục 2 kéo tay sang 01-12 nhưng chưa tính lại: mục 3 vẫn đang nằm trên 01-12.
      await ctx.models.lessonLog.updateOne({ ppctItemId: itemIds[1] }, { isManuallyAdjusted: true, date: d('2026-01-12') });

      const res = await as(admin, api().post(logsUrl(positionId, '/recalculate')));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ scheduled: 4 });
      expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-12', '2026-01-08', '2026-01-15', '2026-01-19']);
      expect((await logOf(itemIds[1]))).toMatchObject({ isManuallyAdjusted: true });
    });

    it('không body khi mọi log đã ở quá khứ: mục chưa có log xếp từ hôm nay (01-26), không lấp ô trống đã qua', async () => {
      const { positionId, itemIds } = await arrange();
      await ctx.models.lessonLog.deleteOne({ ppctItemId: itemIds[4] }); // mục 5 (từng ở 01-19) chưa có log
      ctx.clock.set('2026-01-25T03:00:00Z');

      const res = await as(admin, api().post(logsUrl(positionId, '/recalculate')));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ scheduled: 1 });
      expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-08', '2026-01-12', '2026-01-15', '2026-01-26']);
    });

    it('có { fromDate: 2026-01-15 }: chỉ log từ 01-15 được xếp lại theo TKB mới', async () => {
      const { positionId, itemIds } = await arrange();
      await ctx.models.timetableSlot.deleteOne({ positionId, dayOfWeek: 5 });

      const res = await as(admin, api().post(logsUrl(positionId, '/recalculate'))).send({ fromDate: '2026-01-15' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ scheduled: 2 });
      expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-08', '2026-01-12', '2026-01-19', '2026-01-26']);
    });

    it('fromDate sai định dạng -> 400, log không đổi', async () => {
      const { positionId, itemIds } = await arrange();

      const res = await as(admin, api().post(logsUrl(positionId, '/recalculate'))).send({ fromDate: '2026-02-30' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain(INVALID_DATE);
      expect(await datesOf(itemIds)).toEqual(MON_THU_DATES);
    });

    it('position HOMEROOM không có PPCT: 200 { scheduled: 0 }', async () => {
      const gvcn = await ctx.createClass(`gvcn.lessonlog.recalc.${gvcnCounter++}`, '11A8');

      const res = await as(admin, api().post(logsUrl(gvcn.homeroomPositionId, '/recalculate')));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ scheduled: 0 });
    });

    it('GVBM chủ position và GVCN của lớp gọi -> 403, log không đổi', async () => {
      const gvcn = await ctx.createClass(`gvcn.lessonlog.recalc.perm.${gvcnCounter++}`, '11A9');
      const subjectId = await ctx.joinSubject(gvcn.code, teacher.token, 'Toán');
      await seedSlots(ctx.models, subjectId, MON_THU_SLOTS);
      const itemIds = await seedPpct(ctx.models, subjectId, 3);
      await engine.recalculate(subjectId, d('2025-09-05'));
      await ctx.models.lessonLog.updateOne({ ppctItemId: itemIds[0] }, { date: d('2026-03-02') });

      for (const session of [teacher, gvcn, otherTeacher]) {
        const res = await as(session, api().post(logsUrl(subjectId, '/recalculate')));
        expect(res.status).toBe(403);
      }

      expect(await datesOf(itemIds)).toEqual(['2026-03-02', '2026-01-08', '2026-01-12']);
    });
  });

  describe('phân quyền', () => {
    it('chưa đăng nhập -> 401; STUDENT -> 403 mọi route', async () => {
      const { positionId, itemIds } = await arrange();
      const logId = String((await logOf(itemIds[0]))!._id);

      expect((await api().get(logsUrl(positionId))).status).toBe(401);
      expect((await api().patch(logsUrl(positionId, `/${logId}`)).send({ done: true })).status).toBe(401);
      expect((await api().post(logsUrl(positionId, '/recalculate'))).status).toBe(401);

      expect((await as(student, api().get(logsUrl(positionId)))).status).toBe(403);
      expect((await patchLog(student, positionId, logId, { done: true })).status).toBe(403);
      expect((await as(student, api().post(logsUrl(positionId, '/recalculate')))).status).toBe(403);
      expect((await logOf(itemIds[0]))!.done).toBe(false);
    });

    it('giáo viên không giữ position và không phải GVCN lớp đó: đọc/ghi đều 403, không đổi dữ liệu', async () => {
      const { positionId, itemIds } = await arrange();
      const logId = String((await logOf(itemIds[0]))!._id);

      expect((await as(otherTeacher, api().get(logsUrl(positionId)))).status).toBe(403);
      expect((await patchLog(otherTeacher, positionId, logId, { done: true })).status).toBe(403);
      expect((await patchLog(otherTeacher, positionId, logId, { date: '2026-01-22' })).status).toBe(403);

      expect(await datesOf(itemIds)).toEqual(MON_THU_DATES);
      expect((await logOf(itemIds[0]))!.done).toBe(false);
    });

    it('GVCN của lớp xem được sổ báo giảng các môn (200) nhưng không tích/kéo được (403)', async () => {
      const gvcn = await ctx.createClass(`gvcn.lessonlog.perm.${gvcnCounter++}`, '11A3');
      const subjectId = await ctx.joinSubject(gvcn.code, teacher.token, 'Toán');
      await seedSlots(ctx.models, subjectId, MON_THU_SLOTS);
      const itemIds = await seedPpct(ctx.models, subjectId, 3);
      await engine.recalculate(subjectId, d('2025-09-05'));
      const logId = String((await logOf(itemIds[0]))!._id);

      const list = await as(gvcn, api().get(logsUrl(subjectId)));
      expect(list.status).toBe(200);
      expect(list.body).toHaveLength(3);

      expect((await patchLog(gvcn, subjectId, logId, { done: true })).status).toBe(403);
      expect((await patchLog(gvcn, subjectId, logId, { date: '2026-01-22' })).status).toBe(403);
      expect((await logOf(itemIds[0]))).toMatchObject({ done: false, isManuallyAdjusted: false });
    });

    it('ADMIN đọc và tích/kéo được sổ báo giảng của mọi position', async () => {
      const { positionId, itemIds } = await arrange({ holder: otherTeacher });

      expect((await as(admin, api().get(logsUrl(positionId)))).body).toHaveLength(5);
      expect((await patchItem(admin, positionId, itemIds[0], { done: true })).status).toBe(200);
      const moved = await patchItem(admin, positionId, itemIds[1], { date: '2026-01-22' });
      expect(moved.status).toBe(200);
      expect(moved.body.isManuallyAdjusted).toBe(true);
    });
  });
});
