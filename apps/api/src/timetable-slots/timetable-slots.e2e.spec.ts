import request from 'supertest';
import { formatDateOnly } from '../common/utils/date';
import { LessonLogEngineService } from '../lesson-logs/lesson-log-engine.service';
import { TimetableSlotsController } from './timetable-slots.controller';
import { TimetableSlotsService } from './timetable-slots.service';
import { Phase3App, Phase3Session, createPhase3App } from '../../test/phase3-test-app';
import { d, seedPpct, seedSlots, seedSubjectPosition } from '../../test/phase3-fixtures';

const SAME_POSITION_CONFLICT = 'Tiết này đã có trong thời khóa biểu của môn trong khoảng thời gian trùng';
const TEACHER_CONFLICT = 'Bạn đã có tiết khác vào thời điểm này';
const SLOT_NOT_FOUND = 'Không tìm thấy tiết trong thời khóa biểu';
const SUBJECT_ONLY = 'Chỉ vị trí giáo viên bộ môn mới có thời khóa biểu và PPCT';
const TO_BEFORE_FROM = 'Ngày kết thúc hiệu lực không được trước ngày bắt đầu hiệu lực';
const INVALID_BODY = 'Dữ liệu gửi lên không hợp lệ';
const BAD_DATE = 'Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd';
const MONDAY_ONLY_DATES = ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26', '2026-02-02'];

describe('TimetableSlots (e2e)', () => {
  let ctx: Phase3App;
  let engine: LessonLogEngineService;
  let teacher: Phase3Session;
  let otherTeacher: Phase3Session;
  let admin: Phase3Session;
  let student: Phase3Session;
  let gvcnCounter = 0;

  beforeAll(async () => {
    ctx = await createPhase3App({
      dbName: 'timetable_slots_e2e',
      controllers: [TimetableSlotsController],
      providers: [TimetableSlotsService, LessonLogEngineService],
    });
    engine = ctx.app.get(LessonLogEngineService);
    teacher = await ctx.register('gvbm.slots');
    otherTeacher = await ctx.register('gvbm.slots.khac');
    admin = await ctx.register('admin.slots', 'ADMIN');
    student = await ctx.register('hocsinh.slots', 'STUDENT');
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    const { models } = ctx;
    await models.timetableSlot.deleteMany({});
    await models.ppctItem.deleteMany({});
    await models.lessonLog.deleteMany({});
    await models.position.deleteMany({});
    await models.klass.deleteMany({});
  });

  const api = () => request(ctx.app.getHttpServer());
  const slotsUrl = (positionId: string, slotId = '') => `/positions/${positionId}/timetable-slots/${slotId}`;
  const as = (session: Phase3Session, req: request.Test) => req.set('Authorization', `Bearer ${session.token}`);

  // GVBM `teacher` giữ môn Toán của một lớp mới (mỗi lần gọi một lớp riêng).
  async function seedToan(opts: { holder?: Phase3Session | null; className?: string } = {}) {
    const holder = opts.holder === undefined ? teacher : opts.holder;
    return seedSubjectPosition(ctx.models, {
      schoolYearId: ctx.schoolYearId,
      className: opts.className ?? '11A4',
      subject: 'Toán',
      holderId: holder?.userId,
    });
  }

  function postSlot(session: Phase3Session, positionId: string, body: Record<string, unknown>) {
    return as(session, api().post(slotsUrl(positionId))).send(body);
  }

  // Trả ngày (yyyy-mm-dd) của log theo đúng thứ tự `itemIds`, null nếu mục chưa có log.
  async function datesOf(itemIds: string[]): Promise<Array<string | null>> {
    const logs = await ctx.models.lessonLog.find({ ppctItemId: { $in: itemIds } });
    const byItem = new Map(logs.map((log) => [String(log.ppctItemId), formatDateOnly(log.date)]));
    return itemIds.map((id) => byItem.get(id) ?? null);
  }

  describe('tạo tiết (POST)', () => {
    it('GVBM tạo slot (201), effectiveTo null lưu được, log của position được tính lại', async () => {
      const { positionId } = await seedToan();
      const itemIds = await seedPpct(ctx.models, positionId, 5);

      const res = await postSlot(teacher, positionId, {
        dayOfWeek: 2,
        period: 1,
        effectiveFrom: '2026-01-05',
        effectiveTo: null,
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        positionId,
        dayOfWeek: 2,
        period: 1,
        effectiveFrom: '2026-01-05T00:00:00.000Z',
        effectiveTo: null,
      });
      expect(await datesOf(itemIds)).toEqual(MONDAY_ONLY_DATES);
    });

    it('không gửi effectiveTo thì lưu null; có gửi thì lưu đúng ngày', async () => {
      const { positionId } = await seedToan();
      const open = await postSlot(teacher, positionId, { dayOfWeek: 2, period: 1, effectiveFrom: '2026-01-05' });
      const closed = await postSlot(teacher, positionId, {
        dayOfWeek: 3,
        period: 1,
        effectiveFrom: '2026-01-05',
        effectiveTo: '2026-02-01',
      });
      expect(open.body.effectiveTo).toBeNull();
      expect(closed.body.effectiveTo).toBe('2026-02-01T00:00:00.000Z');
    });

    it('position có PPCT nhưng chưa có slot nào: tạo slot đầu tiên không lỗi; position chưa có PPCT cũng không lỗi', async () => {
      const withPpct = await seedToan({ className: '11A4' });
      await seedPpct(ctx.models, withPpct.positionId, 3);
      const withoutPpct = await seedToan({ className: '11A5' });

      const first = await postSlot(teacher, withPpct.positionId, { dayOfWeek: 4, period: 2, effectiveFrom: '2026-01-05' });
      const second = await postSlot(teacher, withoutPpct.positionId, {
        dayOfWeek: 4,
        period: 3,
        effectiveFrom: '2026-01-05',
      });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(await ctx.models.lessonLog.countDocuments({ positionId: withPpct.positionId })).toBe(3);
      expect(await ctx.models.lessonLog.countDocuments({ positionId: withoutPpct.positionId })).toBe(0);
    });

    it('slot Thứ Bảy vẫn tạo được dù lớp không học Thứ Bảy (không chặn ở v1)', async () => {
      const { positionId } = await seedToan();
      const res = await postSlot(teacher, positionId, { dayOfWeek: 7, period: 1, effectiveFrom: '2026-01-05' });
      expect(res.status).toBe(201);
    });

    it('ADMIN ghi được vào position của giáo viên khác', async () => {
      const { positionId } = await seedToan();
      const res = await postSlot(admin, positionId, { dayOfWeek: 2, period: 1, effectiveFrom: '2026-01-05' });
      expect(res.status).toBe(201);
    });
  });

  describe('đổi TKB end-to-end', () => {
    it('slot Thứ Hai kết thúc 01-18 + slot Thứ Ba tiết 2 từ 01-19: 2 mục đầu giữ nguyên, các mục sau sang Thứ Ba', async () => {
      const { positionId } = await seedToan();
      const itemIds = await seedPpct(ctx.models, positionId, 5);

      const monday = await postSlot(teacher, positionId, {
        dayOfWeek: 2,
        period: 1,
        effectiveFrom: '2026-01-05',
        effectiveTo: '2026-01-18',
      });
      expect(monday.status).toBe(201);
      expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-12', null, null, null]);
      const logsBefore = await ctx.models.lessonLog.find({ positionId }).sort({ date: 1 });

      const tuesday = await postSlot(teacher, positionId, { dayOfWeek: 3, period: 2, effectiveFrom: '2026-01-19' });
      expect(tuesday.status).toBe(201);

      expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-12', '2026-01-20', '2026-01-27', '2026-02-03']);
      const logsAfter = await ctx.models.lessonLog.find({ positionId, date: { $lt: d('2026-01-19') } }).sort({ date: 1 });
      expect(logsAfter.map((log) => String(log._id))).toEqual(logsBefore.map((log) => String(log._id)));
    });
  });

  describe('phát hiện trùng', () => {
    it('cùng position, cùng (dayOfWeek, period), hiệu lực chồng nhau -> 409 và không lưu', async () => {
      const { positionId } = await seedToan();
      await postSlot(teacher, positionId, { dayOfWeek: 2, period: 1, effectiveFrom: '2026-01-05' });

      const res = await postSlot(teacher, positionId, { dayOfWeek: 2, period: 1, effectiveFrom: '2026-01-12' });

      expect(res.status).toBe(409);
      expect(res.body.message).toBe(SAME_POSITION_CONFLICT);
      expect(await ctx.models.timetableSlot.countDocuments({ positionId })).toBe(1);
    });

    it('hiệu lực liền kề không chồng (to 01-18, from 01-19) -> 201; chạm ngày 01-18 -> 409', async () => {
      const { positionId } = await seedToan();
      await postSlot(teacher, positionId, {
        dayOfWeek: 2,
        period: 1,
        effectiveFrom: '2026-01-05',
        effectiveTo: '2026-01-18',
      });

      const adjacent = await postSlot(teacher, positionId, { dayOfWeek: 2, period: 1, effectiveFrom: '2026-01-19' });
      expect(adjacent.status).toBe(201);

      const touching = await postSlot(teacher, positionId, {
        dayOfWeek: 2,
        period: 1,
        effectiveFrom: '2025-12-01',
        effectiveTo: '2026-01-05',
      });
      expect(touching.status).toBe(409);
      expect(touching.body.message).toBe(SAME_POSITION_CONFLICT);
    });

    it('khác dayOfWeek hoặc khác period trong cùng position không trùng', async () => {
      const { positionId } = await seedToan();
      await postSlot(teacher, positionId, { dayOfWeek: 2, period: 1, effectiveFrom: '2026-01-05' });

      expect((await postSlot(teacher, positionId, { dayOfWeek: 3, period: 1, effectiveFrom: '2026-01-05' })).status).toBe(201);
      expect((await postSlot(teacher, positionId, { dayOfWeek: 2, period: 2, effectiveFrom: '2026-01-05' })).status).toBe(201);
    });

    it('GVBM giữ Toán ở 2 lớp: cùng (dayOfWeek, period) chồng hiệu lực -> 409 cho giáo viên; khác period -> 201', async () => {
      const first = await seedToan({ className: '11A4' });
      const second = await seedToan({ className: '11A5' });
      expect((await postSlot(teacher, first.positionId, { dayOfWeek: 3, period: 2, effectiveFrom: '2026-01-05' })).status).toBe(201);

      const conflict = await postSlot(teacher, second.positionId, { dayOfWeek: 3, period: 2, effectiveFrom: '2026-01-12' });
      expect(conflict.status).toBe(409);
      expect(conflict.body.message).toBe(TEACHER_CONFLICT);
      expect(await ctx.models.timetableSlot.countDocuments({ positionId: second.positionId })).toBe(0);

      const otherPeriod = await postSlot(teacher, second.positionId, { dayOfWeek: 3, period: 3, effectiveFrom: '2026-01-12' });
      expect(otherPeriod.status).toBe(201);
    });

    it('2 lớp của cùng giáo viên có hiệu lực không chồng nhau -> 201; chạm biên -> 409', async () => {
      const first = await seedToan({ className: '11A4' });
      const second = await seedToan({ className: '11A5' });
      await seedSlots(ctx.models, first.positionId, [{ dayOfWeek: 3, period: 2, from: '2026-01-05', to: '2026-01-18' }]);

      const touching = await postSlot(teacher, second.positionId, { dayOfWeek: 3, period: 2, effectiveFrom: '2026-01-18' });
      expect(touching.status).toBe(409);
      expect(touching.body.message).toBe(TEACHER_CONFLICT);

      const adjacent = await postSlot(teacher, second.positionId, { dayOfWeek: 3, period: 2, effectiveFrom: '2026-01-19' });
      expect(adjacent.status).toBe(201);
    });

    it('slot cùng giờ của giáo viên KHÁC ở lớp khác không bị coi là trùng', async () => {
      const mine = await seedToan({ className: '11A4' });
      const theirs = await seedToan({ holder: otherTeacher, className: '11A5' });
      await seedSlots(ctx.models, mine.positionId, [{ dayOfWeek: 3, period: 2 }]);

      const res = await postSlot(otherTeacher, theirs.positionId, { dayOfWeek: 3, period: 2, effectiveFrom: '2026-01-05' });
      expect(res.status).toBe(201);
    });

    it('sau khi ngừng phụ trách position lớp 1, ADMIN ghi slot vào lớp 1 không bị chặn bởi kiểm tra "cùng giáo viên"', async () => {
      const released = await seedToan({ className: '11A4' });
      const kept = await seedToan({ className: '11A5' });
      await seedSlots(ctx.models, kept.positionId, [{ dayOfWeek: 3, period: 2 }]);

      const release = await as(teacher, api().post(`/positions/${released.positionId}/release`));
      expect(release.status).toBe(201);

      const res = await postSlot(admin, released.positionId, { dayOfWeek: 3, period: 2, effectiveFrom: '2026-01-05' });
      expect(res.status).toBe(201);
    });

    it('trùng ngay trong chính position vacant vẫn bị chặn (kiểm tra cùng position luôn chạy)', async () => {
      const vacant = await seedToan({ holder: null });
      await seedSlots(ctx.models, vacant.positionId, [{ dayOfWeek: 3, period: 2 }]);

      const res = await postSlot(admin, vacant.positionId, { dayOfWeek: 3, period: 2, effectiveFrom: '2026-01-12' });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe(SAME_POSITION_CONFLICT);
    });
  });

  describe('sửa tiết (PATCH)', () => {
    it('chỉ đổi effectiveTo của chính slot không tự báo trùng với chính nó', async () => {
      const { positionId } = await seedToan();
      const [slotId] = await seedSlots(ctx.models, positionId, [{ dayOfWeek: 2, period: 1 }]);

      const res = await as(teacher, api().patch(slotsUrl(positionId, slotId))).send({ effectiveTo: '2026-03-01' });

      expect(res.status).toBe(200);
      expect(res.body.effectiveTo).toBe('2026-03-01T00:00:00.000Z');
      const cleared = await as(teacher, api().patch(slotsUrl(positionId, slotId))).send({ effectiveTo: null });
      expect(cleared.status).toBe(200);
      expect(cleared.body.effectiveTo).toBeNull();
    });

    it('đổi dayOfWeek -> tính lại, log đổi ngày', async () => {
      const { positionId } = await seedToan();
      const [slotId] = await seedSlots(ctx.models, positionId, [{ dayOfWeek: 2, period: 1 }]);
      const itemIds = await seedPpct(ctx.models, positionId, 5);
      await engine.recalculate(positionId, d('2025-09-05'));
      expect(await datesOf(itemIds)).toEqual(MONDAY_ONLY_DATES);

      const res = await as(teacher, api().patch(slotsUrl(positionId, slotId))).send({ dayOfWeek: 3 });

      expect(res.status).toBe(200);
      expect(res.body.dayOfWeek).toBe(3);
      expect(await datesOf(itemIds)).toEqual(['2026-01-06', '2026-01-13', '2026-01-20', '2026-01-27', '2026-02-03']);
    });

    it('dời effectiveFrom về sau: tính lại từ ngày hiệu lực CŨ (sớm hơn) nên không còn log mồ côi ở các tuần trước', async () => {
      const { positionId } = await seedToan();
      const [slotId] = await seedSlots(ctx.models, positionId, [{ dayOfWeek: 2, period: 1, from: '2026-01-05' }]);
      const itemIds = await seedPpct(ctx.models, positionId, 5);
      await engine.recalculate(positionId, d('2025-09-05'));

      const res = await as(teacher, api().patch(slotsUrl(positionId, slotId))).send({ effectiveFrom: '2026-01-19' });

      expect(res.status).toBe(200);
      expect(await datesOf(itemIds)).toEqual(['2026-01-19', '2026-01-26', '2026-02-02', '2026-02-09', '2026-02-16']);
    });

    it('PATCH thành slot trùng slot khác cùng position -> 409', async () => {
      const { positionId } = await seedToan();
      const [, secondId] = await seedSlots(ctx.models, positionId, [
        { dayOfWeek: 2, period: 1 },
        { dayOfWeek: 2, period: 2 },
      ]);

      const res = await as(teacher, api().patch(slotsUrl(positionId, secondId))).send({ period: 1 });

      expect(res.status).toBe(409);
      expect(res.body.message).toBe(SAME_POSITION_CONFLICT);
      expect((await ctx.models.timetableSlot.findById(secondId))!.period).toBe(2);
    });

    it('PATCH thành giờ trùng slot của lớp khác cùng giáo viên -> 409', async () => {
      const first = await seedToan({ className: '11A4' });
      const second = await seedToan({ className: '11A5' });
      await seedSlots(ctx.models, first.positionId, [{ dayOfWeek: 3, period: 2 }]);
      const [secondId] = await seedSlots(ctx.models, second.positionId, [{ dayOfWeek: 3, period: 3 }]);

      const res = await as(teacher, api().patch(slotsUrl(second.positionId, secondId))).send({ period: 2 });

      expect(res.status).toBe(409);
      expect(res.body.message).toBe(TEACHER_CONFLICT);
    });

    it('gửi 1 ngày được so với giá trị đã lưu: effectiveTo < effectiveFrom cũ, hoặc effectiveFrom > effectiveTo cũ -> 400', async () => {
      const { positionId } = await seedToan();
      const [slotId] = await seedSlots(ctx.models, positionId, [
        { dayOfWeek: 2, period: 1, from: '2026-01-05', to: '2026-02-01' },
      ]);

      const toOnly = await as(teacher, api().patch(slotsUrl(positionId, slotId))).send({ effectiveTo: '2026-01-04' });
      expect(toOnly.status).toBe(400);
      expect(toOnly.body.message).toBe(TO_BEFORE_FROM);

      const fromOnly = await as(teacher, api().patch(slotsUrl(positionId, slotId))).send({ effectiveFrom: '2026-02-02' });
      expect(fromOnly.status).toBe(400);
      expect(fromOnly.body.message).toBe(TO_BEFORE_FROM);

      const stored = await ctx.models.timetableSlot.findById(slotId);
      expect(formatDateOnly(stored!.effectiveFrom)).toBe('2026-01-05');
      expect(formatDateOnly(stored!.effectiveTo!)).toBe('2026-02-01');
    });
  });

  describe('xóa tiết (DELETE)', () => {
    it('xóa slot -> 200 { deleted: true } và log được tính lại', async () => {
      const { positionId } = await seedToan();
      const [, thursdayId] = await seedSlots(ctx.models, positionId, [
        { dayOfWeek: 2, period: 1 },
        { dayOfWeek: 5, period: 3 },
      ]);
      const itemIds = await seedPpct(ctx.models, positionId, 5);
      await engine.recalculate(positionId, d('2025-09-05'));
      expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-08', '2026-01-12', '2026-01-15', '2026-01-19']);

      const res = await as(teacher, api().delete(slotsUrl(positionId, thursdayId)));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ deleted: true });
      expect(await ctx.models.timetableSlot.countDocuments({ positionId })).toBe(1);
      expect(await datesOf(itemIds)).toEqual(MONDAY_ONLY_DATES);
    });

    it('xóa slot cuối cùng: log không còn ô được xóa, không lỗi', async () => {
      const { positionId } = await seedToan();
      const [slotId] = await seedSlots(ctx.models, positionId, [{ dayOfWeek: 2, period: 1 }]);
      const itemIds = await seedPpct(ctx.models, positionId, 3);
      await engine.recalculate(positionId, d('2025-09-05'));

      const res = await as(teacher, api().delete(slotsUrl(positionId, slotId)));

      expect(res.status).toBe(200);
      expect(await datesOf(itemIds)).toEqual([null, null, null]);
    });
  });

  describe('IDOR qua slotId và slotId sai định dạng', () => {
    it('DELETE/PATCH slot của position KHÁC qua /positions/<A>/... -> 404 và slot của B còn nguyên', async () => {
      const mine = await seedToan({ className: '11A4' });
      const theirs = await seedToan({ holder: otherTeacher, className: '11A5' });
      const [theirSlotId] = await seedSlots(ctx.models, theirs.positionId, [{ dayOfWeek: 4, period: 4 }]);

      const del = await as(teacher, api().delete(slotsUrl(mine.positionId, theirSlotId)));
      expect(del.status).toBe(404);
      expect(del.body.message).toBe(SLOT_NOT_FOUND);

      const patch = await as(teacher, api().patch(slotsUrl(mine.positionId, theirSlotId))).send({ dayOfWeek: 6 });
      expect(patch.status).toBe(404);
      expect(patch.body.message).toBe(SLOT_NOT_FOUND);

      const stored = await ctx.models.timetableSlot.findById(theirSlotId);
      expect(stored).not.toBeNull();
      expect(stored!.dayOfWeek).toBe(4);
      expect(String(stored!.positionId)).toBe(theirs.positionId);
    });

    it('ADMIN cũng không sửa/xóa được slot của position khác qua đường dẫn của position A', async () => {
      const mine = await seedToan({ className: '11A4' });
      const theirs = await seedToan({ holder: otherTeacher, className: '11A5' });
      const [theirSlotId] = await seedSlots(ctx.models, theirs.positionId, [{ dayOfWeek: 4, period: 4 }]);

      const res = await as(admin, api().delete(slotsUrl(mine.positionId, theirSlotId)));

      expect(res.status).toBe(404);
      expect(await ctx.models.timetableSlot.countDocuments({ _id: theirSlotId })).toBe(1);
    });

    it('slotId không tồn tại hoặc không phải ObjectId -> 404, không phải 400/500', async () => {
      const { positionId } = await seedToan();
      for (const slotId of ['khong-phai-objectid', '123', 'abcdefghijkl', '64b7f0c2a1b2c3d4e5f60718']) {
        const patch = await as(teacher, api().patch(slotsUrl(positionId, slotId))).send({ period: 2 });
        expect([slotId, patch.status, patch.body.message]).toEqual([slotId, 404, SLOT_NOT_FOUND]);
        const del = await as(teacher, api().delete(slotsUrl(positionId, slotId)));
        expect([slotId, del.status, del.body.message]).toEqual([slotId, 404, SLOT_NOT_FOUND]);
      }
    });

    it('xóa lần thứ hai cùng 1 slot -> 404', async () => {
      const { positionId } = await seedToan();
      const [slotId] = await seedSlots(ctx.models, positionId, [{ dayOfWeek: 2, period: 1 }]);
      expect((await as(teacher, api().delete(slotsUrl(positionId, slotId)))).status).toBe(200);
      expect((await as(teacher, api().delete(slotsUrl(positionId, slotId)))).status).toBe(404);
    });
  });

  describe('validation và position HOMEROOM', () => {
    it('body sai (dayOfWeek: 1, period: 11, thiếu effectiveFrom, ngày không có thật) -> 400 tiếng Việt, không lưu', async () => {
      const { positionId } = await seedToan();
      const bad = [
        { dayOfWeek: 1, period: 1, effectiveFrom: '2026-01-05' },
        { dayOfWeek: 8, period: 1, effectiveFrom: '2026-01-05' },
        { dayOfWeek: 2, period: 11, effectiveFrom: '2026-01-05' },
        { dayOfWeek: 2, period: 0, effectiveFrom: '2026-01-05' },
        { dayOfWeek: 2, period: 1 },
        { dayOfWeek: '2', period: 1, effectiveFrom: '2026-01-05' },
      ];
      for (const body of bad) {
        const res = await postSlot(teacher, positionId, body);
        expect([JSON.stringify(body), res.status]).toEqual([JSON.stringify(body), 400]);
        expect(res.body.message).toContain(INVALID_BODY);
      }

      const badDate = await postSlot(teacher, positionId, { dayOfWeek: 2, period: 1, effectiveFrom: '2026-02-30' });
      expect(badDate.status).toBe(400);
      expect(badDate.body.message).toContain(BAD_DATE);

      const reversed = await postSlot(teacher, positionId, {
        dayOfWeek: 2,
        period: 1,
        effectiveFrom: '2026-01-10',
        effectiveTo: '2026-01-09',
      });
      expect(reversed.status).toBe(400);
      expect(reversed.body.message).toContain(TO_BEFORE_FROM);

      expect(await ctx.models.timetableSlot.countDocuments()).toBe(0);
    });

    it('PATCH body sai -> 400', async () => {
      const { positionId } = await seedToan();
      const [slotId] = await seedSlots(ctx.models, positionId, [{ dayOfWeek: 2, period: 1 }]);
      const res = await as(teacher, api().patch(slotsUrl(positionId, slotId))).send({ period: 11 });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain(INVALID_BODY);
    });

    it('ghi (POST/PATCH/DELETE) vào position HOMEROOM -> 400 kèm thông báo; GET trả mảng rỗng', async () => {
      const gvcn = await ctx.createClass(`gvcn.slots.homeroom.${gvcnCounter++}`, '11A6');
      const homeroomId = gvcn.homeroomPositionId;

      const post = await postSlot(gvcn, homeroomId, { dayOfWeek: 2, period: 1, effectiveFrom: '2026-01-05' });
      expect(post.status).toBe(400);
      expect(post.body.message).toBe(SUBJECT_ONLY);

      const slotId = '64b7f0c2a1b2c3d4e5f60718';
      const patch = await as(gvcn, api().patch(slotsUrl(homeroomId, slotId))).send({ period: 2 });
      expect(patch.status).toBe(400);
      expect(patch.body.message).toBe(SUBJECT_ONLY);
      const del = await as(gvcn, api().delete(slotsUrl(homeroomId, slotId)));
      expect(del.status).toBe(400);
      expect(del.body.message).toBe(SUBJECT_ONLY);

      const list = await as(gvcn, api().get(slotsUrl(homeroomId)));
      expect(list.status).toBe(200);
      expect(list.body).toEqual([]);
      expect(await ctx.models.timetableSlot.countDocuments()).toBe(0);
    });
  });

  describe('đọc danh sách (GET)', () => {
    it('trả slot của position, sắp theo dayOfWeek, period, effectiveFrom; không lẫn slot position khác', async () => {
      const mine = await seedToan({ className: '11A4' });
      const theirs = await seedToan({ holder: otherTeacher, className: '11A5' });
      await seedSlots(ctx.models, mine.positionId, [
        { dayOfWeek: 5, period: 3 },
        { dayOfWeek: 2, period: 2 },
        { dayOfWeek: 2, period: 1, from: '2026-02-01' },
        { dayOfWeek: 2, period: 1, from: '2026-01-05', to: '2026-01-31' },
      ]);
      await seedSlots(ctx.models, theirs.positionId, [{ dayOfWeek: 3, period: 1 }]);

      const res = await as(teacher, api().get(slotsUrl(mine.positionId)));

      expect(res.status).toBe(200);
      expect(
        res.body.map((s: { dayOfWeek: number; period: number; effectiveFrom: string }) => [
          s.dayOfWeek,
          s.period,
          s.effectiveFrom.slice(0, 10),
        ]),
      ).toEqual([
        [2, 1, '2026-01-05'],
        [2, 1, '2026-02-01'],
        [2, 2, '2026-01-05'],
        [5, 3, '2026-01-05'],
      ]);
    });

    it('position chưa có slot -> 200 mảng rỗng', async () => {
      const { positionId } = await seedToan();
      const res = await as(teacher, api().get(slotsUrl(positionId)));
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('phân quyền', () => {
    it('chưa đăng nhập -> 401; STUDENT -> 403 cả đọc lẫn ghi', async () => {
      const { positionId } = await seedToan();
      const body = { dayOfWeek: 2, period: 1, effectiveFrom: '2026-01-05' };
      expect((await api().get(slotsUrl(positionId))).status).toBe(401);
      expect((await api().post(slotsUrl(positionId)).send(body)).status).toBe(401);
      expect((await as(student, api().get(slotsUrl(positionId)))).status).toBe(403);
      expect((await postSlot(student, positionId, body)).status).toBe(403);
    });

    it('giáo viên không giữ position và không phải GVCN lớp đó: đọc/ghi đều 403, không đổi dữ liệu', async () => {
      const { positionId } = await seedToan();
      const [slotId] = await seedSlots(ctx.models, positionId, [{ dayOfWeek: 2, period: 1 }]);

      expect((await as(otherTeacher, api().get(slotsUrl(positionId)))).status).toBe(403);
      expect((await postSlot(otherTeacher, positionId, { dayOfWeek: 3, period: 1, effectiveFrom: '2026-01-05' })).status).toBe(403);
      expect((await as(otherTeacher, api().patch(slotsUrl(positionId, slotId))).send({ period: 2 })).status).toBe(403);
      expect((await as(otherTeacher, api().delete(slotsUrl(positionId, slotId)))).status).toBe(403);

      const slots = await ctx.models.timetableSlot.find({ positionId });
      expect(slots.map((s) => [s.dayOfWeek, s.period])).toEqual([[2, 1]]);
    });

    it('GVCN của lớp xem được TKB các môn (200) nhưng không ghi được (403)', async () => {
      const gvcn = await ctx.createClass(`gvcn.slots.perm.${gvcnCounter++}`, '11A7');
      const subjectId = await ctx.joinSubject(gvcn.code, teacher.token, 'Toán');
      const [slotId] = await seedSlots(ctx.models, subjectId, [{ dayOfWeek: 2, period: 1 }]);

      const list = await as(gvcn, api().get(slotsUrl(subjectId)));
      expect(list.status).toBe(200);
      expect(list.body).toHaveLength(1);

      expect((await postSlot(gvcn, subjectId, { dayOfWeek: 3, period: 1, effectiveFrom: '2026-01-05' })).status).toBe(403);
      expect((await as(gvcn, api().patch(slotsUrl(subjectId, slotId))).send({ period: 2 })).status).toBe(403);
      expect((await as(gvcn, api().delete(slotsUrl(subjectId, slotId)))).status).toBe(403);
      expect(await ctx.models.timetableSlot.countDocuments({ positionId: subjectId })).toBe(1);
    });

    it('ADMIN đọc được TKB của mọi position', async () => {
      const { positionId } = await seedToan();
      await seedSlots(ctx.models, positionId, [{ dayOfWeek: 2, period: 1 }]);
      const res = await as(admin, api().get(slotsUrl(positionId)));
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('rollback khi tính lại sổ báo giảng lỗi', () => {
    let consoleError: jest.SpyInstance;

    beforeEach(() => {
      // MongoExceptionFilter log lỗi lạ ra console.error; ở đây lỗi 'boom' là chủ đích.
      consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      consoleError.mockRestore();
    });

    function failNextRecalculation() {
      return jest.spyOn(engine, 'recalculate').mockRejectedValueOnce(new Error('boom'));
    }

    it('POST: tính lại lỗi -> 500 và số slot không đổi', async () => {
      const { positionId } = await seedToan();
      await seedSlots(ctx.models, positionId, [{ dayOfWeek: 2, period: 1 }]);
      const before = await ctx.models.timetableSlot.countDocuments();

      failNextRecalculation();
      const res = await postSlot(teacher, positionId, { dayOfWeek: 3, period: 1, effectiveFrom: '2026-01-05' });

      expect(res.status).toBe(500);
      expect(await ctx.models.timetableSlot.countDocuments()).toBe(before);
    });

    it('PATCH: tính lại lỗi -> 500 và slot giữ nguyên giá trị cũ', async () => {
      const { positionId } = await seedToan();
      const [slotId] = await seedSlots(ctx.models, positionId, [{ dayOfWeek: 2, period: 1 }]);

      failNextRecalculation();
      const res = await as(teacher, api().patch(slotsUrl(positionId, slotId))).send({ dayOfWeek: 4, effectiveTo: '2026-03-01' });

      expect(res.status).toBe(500);
      const stored = await ctx.models.timetableSlot.findById(slotId);
      expect(stored!.dayOfWeek).toBe(2);
      expect(stored!.effectiveTo).toBeNull();
    });

    it('DELETE: tính lại lỗi -> 500 và slot vẫn còn', async () => {
      const { positionId } = await seedToan();
      const [slotId] = await seedSlots(ctx.models, positionId, [{ dayOfWeek: 2, period: 1 }]);

      failNextRecalculation();
      const res = await as(teacher, api().delete(slotsUrl(positionId, slotId)));

      expect(res.status).toBe(500);
      expect(await ctx.models.timetableSlot.countDocuments({ _id: slotId })).toBe(1);
    });
  });
});
