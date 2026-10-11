import request from 'supertest';
import { formatDateOnly } from '../common/utils/date';
import { LessonLogEngineService } from '../lesson-logs/lesson-log-engine.service';
import { PpctController } from './ppct.controller';
import { PpctService } from './ppct.service';
import { Phase3App, Phase3Session, createPhase3App } from '../../test/phase3-test-app';
import { d, seedPpct, seedSlots, seedSubjectPosition } from '../../test/phase3-fixtures';

const ITEM_NOT_FOUND = 'Không tìm thấy mục PPCT';
const SUBJECT_ONLY = 'Chỉ vị trí giáo viên bộ môn mới có thời khóa biểu và PPCT';
const INVALID_BODY = 'Dữ liệu gửi lên không hợp lệ';
// Thứ Hai (tiết 1) + Thứ Năm (tiết 3) từ 2026-01-05: chuỗi ô tự do của fixture.
const MON_THU_DATES = ['2026-01-05', '2026-01-08', '2026-01-12', '2026-01-15', '2026-01-19'];
const MON_THU_SLOTS = [
  { dayOfWeek: 2, period: 1 },
  { dayOfWeek: 5, period: 3 },
];
// Tiết đôi: mỗi ngày dạy có 2 ô liên tiếp (Thứ Hai tiết 1-2, Thứ Năm tiết 3-4).
const DOUBLE_PERIOD_SLOTS = [
  { dayOfWeek: 2, period: 1 },
  { dayOfWeek: 2, period: 2 },
  { dayOfWeek: 5, period: 3 },
  { dayOfWeek: 5, period: 4 },
];
const DEFAULT_NOW = '2026-01-04T03:00:00Z';
// Giữa năm học: các ô 01-05, 01-08, 01-12 của TKB Thứ Hai/Thứ Năm đã qua, ô tự do kế tiếp là 01-15.
const MID_YEAR_NOW = '2026-01-14T03:00:00Z';

describe('Ppct (e2e)', () => {
  let ctx: Phase3App;
  let engine: LessonLogEngineService;
  let teacher: Phase3Session;
  let otherTeacher: Phase3Session;
  let admin: Phase3Session;
  let student: Phase3Session;
  let gvcnCounter = 0;

  beforeAll(async () => {
    ctx = await createPhase3App({
      dbName: 'ppct_e2e',
      controllers: [PpctController],
      providers: [PpctService, LessonLogEngineService],
    });
    engine = ctx.app.get(LessonLogEngineService);
    teacher = await ctx.register('gvbm.ppct');
    otherTeacher = await ctx.register('gvbm.ppct.khac');
    admin = await ctx.register('admin.ppct', 'ADMIN');
    student = await ctx.register('hocsinh.ppct', 'STUDENT');
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
  const ppctUrl = (positionId: string, itemId = '') => `/positions/${positionId}/ppct/${itemId}`;
  const as = (session: Phase3Session, req: request.Test) => req.set('Authorization', `Bearer ${session.token}`);

  async function seedToan(opts: { holder?: Phase3Session | null; className?: string } = {}) {
    const holder = opts.holder === undefined ? teacher : opts.holder;
    return seedSubjectPosition(ctx.models, {
      schoolYearId: ctx.schoolYearId,
      className: opts.className ?? '11A4',
      subject: 'Toán',
      holderId: holder?.userId,
    });
  }

  const itemBody = (n: number, overrides: Record<string, unknown> = {}) => ({
    week: n,
    periodLabel: String(n),
    title: `Bài ${n}`,
    periodCount: 1,
    requirement: `Yêu cầu bài ${n}`,
    ...overrides,
  });

  function postItem(session: Phase3Session, positionId: string, body: Record<string, unknown>) {
    return as(session, api().post(ppctUrl(positionId))).send(body);
  }

  // Trả ngày (yyyy-mm-dd) của log theo đúng thứ tự `itemIds`, null nếu mục chưa có log.
  async function datesOf(itemIds: string[]): Promise<Array<string | null>> {
    const logs = await ctx.models.lessonLog.find({ ppctItemId: { $in: itemIds } });
    const byItem = new Map(logs.map((log) => [String(log.ppctItemId), formatDateOnly(log.date)]));
    return itemIds.map((id) => byItem.get(id) ?? null);
  }

  async function ordersOf(positionId: string): Promise<number[]> {
    const items = await ctx.models.ppctItem.find({ positionId }).sort({ order: 1 });
    return items.map((item) => item.order);
  }

  describe('tạo mục (POST) và đọc (GET)', () => {
    it('GVBM POST 5 mục -> 201, GET trả order 1..5, log xếp 01-05,01-08,01-12,01-15,01-19', async () => {
      const { positionId } = await seedToan();
      await seedSlots(ctx.models, positionId, MON_THU_SLOTS);

      const ids: string[] = [];
      for (let n = 1; n <= 5; n++) {
        const res = await postItem(teacher, positionId, itemBody(n));
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ positionId, order: n, title: `Bài ${n}`, periodCount: 1 });
        ids.push(res.body._id);
      }

      const list = await as(teacher, api().get(ppctUrl(positionId)));
      expect(list.status).toBe(200);
      expect(list.body.map((item: { order: number }) => item.order)).toEqual([1, 2, 3, 4, 5]);
      expect(list.body.map((item: { _id: string }) => item._id)).toEqual(ids);
      expect(await datesOf(ids)).toEqual(MON_THU_DATES);
    });

    it('note tuỳ chọn được lưu; không gửi requirement thì lưu chuỗi rỗng', async () => {
      const { positionId } = await seedToan();
      const res = await postItem(teacher, positionId, {
        week: 1,
        periodLabel: '15-16',
        title: 'Bài dài',
        periodCount: 2,
        note: 'Ghi chú',
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ periodLabel: '15-16', periodCount: 2, requirement: '', note: 'Ghi chú' });
    });

    it('kịch bản 7/8 qua API: nhập 1,2,TC1,3 rồi CĐ1 -> ngày theo thứ tự nhập, week và periodLabel không ảnh hưởng', async () => {
      const { positionId } = await seedToan();
      await seedSlots(ctx.models, positionId, MON_THU_SLOTS);
      const rows = [
        { week: 5, periodLabel: '1' },
        { week: 1, periodLabel: '2' },
        { week: 3, periodLabel: 'TC1' },
        { week: 2, periodLabel: '3' },
      ];

      const ids: string[] = [];
      for (const [i, row] of rows.entries()) {
        const res = await postItem(teacher, positionId, itemBody(i + 1, row));
        expect(res.status).toBe(201);
        ids.push(res.body._id);
      }
      expect(await datesOf(ids)).toEqual(MON_THU_DATES.slice(0, 4));

      const last = await postItem(teacher, positionId, itemBody(5, { week: 1, periodLabel: 'CĐ1' }));
      expect(last.status).toBe(201);
      ids.push(last.body._id);

      expect(await datesOf(ids)).toEqual(MON_THU_DATES);
      expect(await ordersOf(positionId)).toEqual([1, 2, 3, 4, 5]);
    });

    it('GET: sắp theo order, không lẫn mục của position khác; position chưa có mục -> mảng rỗng', async () => {
      const mine = await seedToan({ className: '11A4' });
      const theirs = await seedToan({ holder: otherTeacher, className: '11A5' });
      const empty = await seedToan({ className: '11A6' });
      await ctx.models.ppctItem.insertMany([
        { positionId: mine.positionId, order: 3, week: 1, periodLabel: '3', title: 'C' },
        { positionId: mine.positionId, order: 1, week: 1, periodLabel: '1', title: 'A' },
        { positionId: mine.positionId, order: 2, week: 1, periodLabel: '2', title: 'B' },
        { positionId: theirs.positionId, order: 1, week: 1, periodLabel: '1', title: 'Khác' },
      ]);

      const res = await as(teacher, api().get(ppctUrl(mine.positionId)));
      expect(res.status).toBe(200);
      expect(res.body.map((item: { title: string }) => item.title)).toEqual(['A', 'B', 'C']);

      const none = await as(teacher, api().get(ppctUrl(empty.positionId)));
      expect(none.status).toBe(200);
      expect(none.body).toEqual([]);
    });

    it('position chưa có slot: POST và PATCH đều thành công, không có log, không lỗi', async () => {
      const { positionId } = await seedToan();

      const created = await postItem(teacher, positionId, itemBody(1));
      expect(created.status).toBe(201);
      const patched = await as(teacher, api().patch(ppctUrl(positionId, created.body._id))).send({ title: 'Đổi tên' });
      expect(patched.status).toBe(200);

      expect(await ctx.models.lessonLog.countDocuments({ positionId })).toBe(0);
    });

    it('PPCT dài hơn số ô còn lại không lỗi: mục thừa không có log', async () => {
      const { positionId } = await seedToan();
      await seedSlots(ctx.models, positionId, [{ dayOfWeek: 2, period: 1, from: '2026-05-25' }]);
      const ids: string[] = [];
      for (let n = 1; n <= 3; n++) {
        const res = await postItem(teacher, positionId, itemBody(n));
        expect(res.status).toBe(201);
        ids.push(res.body._id);
      }
      // Năm học kết thúc 2026-05-31: chỉ còn Thứ Hai 05-25 -> 1 ô.
      expect(await datesOf(ids)).toEqual(['2026-05-25', null, null]);
    });
  });

  describe('thêm mục giữa năm học (hôm nay 2026-01-14, TKB khai báo từ 2026-01-05)', () => {
    beforeEach(() => {
      ctx.clock.set(MID_YEAR_NOW);
    });

    afterEach(() => {
      ctx.clock.set(DEFAULT_NOW);
    });

    // Position có TKB và `count` mục đã xếp sẵn từ đầu năm học: 01-05, 01-08, 01-12, 01-15, 01-19, 01-22, ...
    async function seedPlaced(count: number, slots = MON_THU_SLOTS) {
      const { positionId } = await seedToan();
      await seedSlots(ctx.models, positionId, slots);
      const ids = await seedPpct(ctx.models, positionId, count);
      await engine.recalculate(positionId, d('2025-09-05'));
      return { positionId, ids };
    }

    // Dấu vết đầy đủ của log theo thứ tự `itemIds` để so sánh "không đổi gì cả" (kể cả _id và cờ).
    async function snapshotOf(itemIds: string[]) {
      const logs = await ctx.models.lessonLog.find({ ppctItemId: { $in: itemIds } });
      const byItem = new Map(logs.map((log) => [String(log.ppctItemId), log]));
      return itemIds.map((id) => {
        const log = byItem.get(id);
        if (!log) return null;
        return {
          id: String(log._id),
          date: formatDateOnly(log.date),
          done: log.done,
          isManuallyAdjusted: log.isManuallyAdjusted,
        };
      });
    }

    async function postItems(positionId: string, from: number, to: number): Promise<string[]> {
      const ids: string[] = [];
      for (let n = from; n <= to; n++) {
        const res = await postItem(teacher, positionId, itemBody(n));
        expect(res.status).toBe(201);
        ids.push(res.body._id);
      }
      return ids;
    }

    it('POST từng mục 1..5: mỗi mục vào ô trống đầu tiên, không để ô trống nào ở giữa', async () => {
      const { positionId } = await seedToan();
      await seedSlots(ctx.models, positionId, MON_THU_SLOTS);

      const ids: string[] = [];
      for (let n = 1; n <= 5; n++) {
        const res = await postItem(teacher, positionId, itemBody(n));
        expect(res.status).toBe(201);
        ids.push(res.body._id);
        expect(await datesOf(ids)).toEqual(MON_THU_DATES.slice(0, n));
      }
      expect(await ordersOf(positionId)).toEqual([1, 2, 3, 4, 5]);
      expect(await ctx.models.lessonLog.countDocuments({ positionId })).toBe(5);
    });

    it('nhập PPCT trước rồi mới khai báo TKB: cùng lịch với nhập TKB trước', async () => {
      const { positionId } = await seedToan();
      const ids = await postItems(positionId, 1, 5);
      expect(await datesOf(ids)).toEqual([null, null, null, null, null]);

      // TimetableSlotsService.create ghi slot rồi tính lại từ effectiveFrom của slot.
      await seedSlots(ctx.models, positionId, MON_THU_SLOTS);
      await engine.recalculate(positionId, d('2026-01-05'));

      expect(await datesOf(ids)).toEqual(MON_THU_DATES);
    });

    it('TKB có tiết đôi: POST từng mục lấp nốt tiết còn trống trong ngày của mục trước', async () => {
      const { positionId } = await seedToan();
      await seedSlots(ctx.models, positionId, DOUBLE_PERIOD_SLOTS);

      const ids: string[] = [];
      for (let n = 1; n <= 5; n++) {
        const res = await postItem(teacher, positionId, itemBody(n));
        expect(res.status).toBe(201);
        ids.push(res.body._id);
      }

      // Mỗi ngày 2 ô: 01-05 x2, 01-08 x2, 01-12; giống hệt khi import cả 5 mục một lượt.
      expect(await datesOf(ids)).toEqual(['2026-01-05', '2026-01-05', '2026-01-08', '2026-01-08', '2026-01-12']);
    });

    it('lịch đã kéo tới tương lai: mục mới nối đuôi như cũ, log done / kéo tay / đã qua không đổi', async () => {
      const { positionId, ids } = await seedPlaced(6);
      expect(await datesOf(ids)).toEqual([...MON_THU_DATES, '2026-01-22']);
      await ctx.models.lessonLog.updateOne({ ppctItemId: ids[1] }, { done: true }); // 01-08, đã dạy
      await ctx.models.lessonLog.updateOne({ ppctItemId: ids[3] }, { isManuallyAdjusted: true }); // 01-15, giữ chỗ
      const before = await snapshotOf(ids);

      const res = await postItem(teacher, positionId, itemBody(7));

      expect(res.status).toBe(201);
      expect(await datesOf([...ids, res.body._id])).toEqual([...MON_THU_DATES, '2026-01-22', '2026-01-26']);
      expect(await snapshotOf(ids)).toEqual(before);
    });

    it('log muộn nhất đúng hôm nay: mục mới nối ngay sau, log của hôm nay không đổi', async () => {
      ctx.clock.set('2026-01-15T03:00:00Z');
      const { positionId, ids } = await seedPlaced(4);
      const before = await snapshotOf(ids);

      const res = await postItem(teacher, positionId, itemBody(5));

      expect(res.status).toBe(201);
      expect(await datesOf([...ids, res.body._id])).toEqual(MON_THU_DATES);
      expect(await snapshotOf(ids)).toEqual(before);
    });

    it('mọi log đã done ở quá khứ: mục mới vào ô trống kế tiếp (không nhảy tới hôm nay), log done không đổi', async () => {
      const { positionId, ids } = await seedPlaced(2);
      await ctx.models.lessonLog.updateMany({ ppctItemId: { $in: ids } }, { done: true });
      const before = await snapshotOf(ids);
      expect(before.map((log) => log?.date)).toEqual(['2026-01-05', '2026-01-08']);

      const res = await postItem(teacher, positionId, itemBody(3));

      expect(res.status).toBe(201);
      expect(await datesOf([res.body._id])).toEqual(['2026-01-12']);
      expect(await snapshotOf(ids)).toEqual(before);
    });

    it('log done ở quá khứ còn ô trống phía trước: không có log nào bị dời về ô trống đó', async () => {
      const { positionId, ids } = await seedPlaced(2);
      // Mục 2 kéo từ 01-08 sang 01-12 rồi tích đã dạy: ô 01-08 trống.
      await ctx.models.lessonLog.updateOne(
        { ppctItemId: ids[1] },
        { isManuallyAdjusted: true, done: true, date: d('2026-01-12') },
      );
      const before = await snapshotOf(ids);
      expect(before.map((log) => log?.date)).toEqual(['2026-01-05', '2026-01-12']);

      const res = await postItem(teacher, positionId, itemBody(3));

      expect(res.status).toBe(201);
      expect(await datesOf([res.body._id])).toEqual(['2026-01-15']);
      expect(await snapshotOf(ids)).toEqual(before);
    });

    it('mục đã qua vừa được PATCH tăng số tiết (chiếm lấn ô của mục sau): POST mục mới không dời log nào ở quá khứ', async () => {
      const { positionId, ids } = await seedPlaced(3); // 01-05, 01-08, 01-12
      const patch = await as(teacher, api().patch(ppctUrl(positionId, ids[1]))).send({ periodCount: 2 });
      expect(patch.status).toBe(200);
      const before = await snapshotOf(ids);
      // PATCH tính từ hôm nay nên không đụng log đã qua, dù bài 2 giờ chiếm cả ô 01-12 của mục 3.
      expect(before.map((log) => log?.date)).toEqual(['2026-01-05', '2026-01-08', '2026-01-12']);

      const res = await postItem(teacher, positionId, itemBody(4));

      expect(res.status).toBe(201);
      // Mục 3 (log vẫn ở 01-12) giữ chỗ ô kế tiếp 01-15 nên mục 4 vào 01-19; không log cũ nào bị xếp lại.
      expect(await datesOf([res.body._id])).toEqual(['2026-01-19']);
      expect(await snapshotOf(ids)).toEqual(before);
    });

    // PATCH/DELETE giữ quy tắc "đã có log thì từ hôm nay": mục chưa có log không lấp các ô đã qua. Hôm nay 01-20 để
    // giữa log muộn nhất (01-12) và hôm nay còn 2 ô trống (01-15, 01-19) làm phép thử.
    describe('sửa/xóa mục vẫn tính lại từ hôm nay (2026-01-20)', () => {
      beforeEach(() => {
        ctx.clock.set('2026-01-20T03:00:00Z');
      });

      // 3 mục đã xếp ở quá khứ (01-05, 01-08, 01-12) + mục 4 chưa có log.
      async function seedWithPendingItem() {
        const { positionId, ids } = await seedPlaced(3);
        const [pendingItem] = await ctx.models.ppctItem.create([
          { positionId, order: 4, week: 4, periodLabel: '4', title: 'Bài 4', periodCount: 1 },
        ]);
        expect(await datesOf(ids)).toEqual(['2026-01-05', '2026-01-08', '2026-01-12']);
        return { positionId, ids, pendingId: String(pendingItem._id) };
      }

      it('PATCH: mục chưa có log được xếp vào ô trống đầu tiên từ hôm nay (01-22), không phải 01-15', async () => {
        const { positionId, ids, pendingId } = await seedWithPendingItem();
        const before = await snapshotOf(ids);

        const res = await as(teacher, api().patch(ppctUrl(positionId, ids[0]))).send({ title: 'Đổi tên' });

        expect(res.status).toBe(200);
        expect(await datesOf([pendingId])).toEqual(['2026-01-22']);
        expect(await snapshotOf(ids)).toEqual(before);
      });

      it('DELETE: mục chưa có log được xếp vào ô trống đầu tiên từ hôm nay (01-22), không phải 01-15', async () => {
        const { positionId, ids, pendingId } = await seedWithPendingItem();
        const before = await snapshotOf(ids.slice(1));

        const res = await as(teacher, api().delete(ppctUrl(positionId, ids[0])));

        expect(res.status).toBe(200);
        expect(await datesOf([pendingId])).toEqual(['2026-01-22']);
        expect(await snapshotOf(ids.slice(1))).toEqual(before);
      });
    });
  });

  describe('sửa mục (PATCH)', () => {
    it('periodCount mục 2 từ 1 lên 2 -> mục 2 chiếm 2 ô (date vẫn là ô đầu), mục 3, 4, 5 lùi 1 ô', async () => {
      const { positionId } = await seedToan();
      await seedSlots(ctx.models, positionId, MON_THU_SLOTS);
      const ids = await seedPpct(ctx.models, positionId, 5);
      await engine.recalculate(positionId, d('2025-09-05'));
      expect(await datesOf(ids)).toEqual(MON_THU_DATES);

      const res = await as(teacher, api().patch(ppctUrl(positionId, ids[1]))).send({ periodCount: 2 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ _id: ids[1], periodCount: 2, order: 2 });
      expect(await datesOf(ids)).toEqual(['2026-01-05', '2026-01-08', '2026-01-15', '2026-01-19', '2026-01-22']);
    });

    it('PATCH sửa chính tả khi đang dạy dở bài 2 tiết (hôm nay 01-10, giữa 2 ô của bài 2): lịch các bài không đổi', async () => {
      const { positionId } = await seedToan();
      await seedSlots(ctx.models, positionId, MON_THU_SLOTS);
      const ids: string[] = [];
      for (const [i, periodCount] of [1, 2, 1, 1].entries()) {
        const res = await postItem(teacher, positionId, itemBody(i + 1, { periodCount }));
        expect(res.status).toBe(201);
        ids.push(res.body._id);
      }
      const scheduled = ['2026-01-05', '2026-01-08', '2026-01-15', '2026-01-19'];
      expect(await datesOf(ids)).toEqual(scheduled);
      const logIdsBefore = (await ctx.models.lessonLog.find({ positionId }).sort({ date: 1 })).map((log) => String(log._id));

      try {
        ctx.clock.set('2026-01-10T03:00:00Z');
        const res = await as(teacher, api().patch(ppctUrl(positionId, ids[3]))).send({ title: 'Bài 4 (đã sửa chính tả)' });
        expect(res.status).toBe(200);
      } finally {
        ctx.clock.set('2026-01-04T03:00:00Z');
      }

      expect(await datesOf(ids)).toEqual(scheduled);
      const logIdsAfter = (await ctx.models.lessonLog.find({ positionId }).sort({ date: 1 })).map((log) => String(log._id));
      expect(logIdsAfter).toEqual(logIdsBefore);
    });

    it('PATCH chỉ gửi { title } không làm mất requirement, note, week, periodLabel; order không đổi', async () => {
      const { positionId } = await seedToan();
      const created = await postItem(teacher, positionId, itemBody(1, { note: 'Ghi chú cũ' }));

      const res = await as(teacher, api().patch(ppctUrl(positionId, created.body._id))).send({ title: 'Tên mới' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        title: 'Tên mới',
        requirement: 'Yêu cầu bài 1',
        note: 'Ghi chú cũ',
        week: 1,
        periodLabel: '1',
        periodCount: 1,
        order: 1,
      });
      const stored = await ctx.models.ppctItem.findById(created.body._id);
      expect(stored).toMatchObject({ title: 'Tên mới', requirement: 'Yêu cầu bài 1', note: 'Ghi chú cũ' });
    });

    it('PATCH không có trường `order` trong schema nên bỏ qua order gửi kèm', async () => {
      const { positionId } = await seedToan();
      const ids = await seedPpct(ctx.models, positionId, 2);

      const res = await as(teacher, api().patch(ppctUrl(positionId, ids[0]))).send({ title: 'X', order: 2 });

      expect(res.status).toBe(200);
      expect(await ordersOf(positionId)).toEqual([1, 2]);
    });
  });

  describe('xóa mục (DELETE)', () => {
    it('xóa mục 2 (log done=true cũng bị xóa): các mục sau dồn lên, order không đánh số lại, mục mới nhận max+1', async () => {
      const { positionId } = await seedToan();
      await seedSlots(ctx.models, positionId, MON_THU_SLOTS);
      const ids = await seedPpct(ctx.models, positionId, 5);
      await engine.recalculate(positionId, d('2025-09-05'));
      await ctx.models.lessonLog.updateOne({ ppctItemId: ids[1] }, { done: true });

      const res = await as(teacher, api().delete(ppctUrl(positionId, ids[1])));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ deleted: true });
      expect(await ctx.models.ppctItem.countDocuments({ _id: ids[1] })).toBe(0);
      expect(await ctx.models.lessonLog.countDocuments({ ppctItemId: ids[1] })).toBe(0);
      expect(await datesOf(ids)).toEqual(['2026-01-05', null, '2026-01-08', '2026-01-12', '2026-01-15']);
      expect(await ordersOf(positionId)).toEqual([1, 3, 4, 5]);

      const added = await postItem(teacher, positionId, itemBody(6));
      expect(added.status).toBe(201);
      expect(added.body.order).toBe(6);
      expect(await datesOf([...ids.filter((_, i) => i !== 1), added.body._id])).toEqual([
        '2026-01-05',
        '2026-01-08',
        '2026-01-12',
        '2026-01-15',
        '2026-01-19',
      ]);
    });

    it('xóa mục không làm đổi log của position khác', async () => {
      const mine = await seedToan({ className: '11A4' });
      const theirs = await seedToan({ holder: otherTeacher, className: '11A5' });
      await seedSlots(ctx.models, mine.positionId, MON_THU_SLOTS);
      await seedSlots(ctx.models, theirs.positionId, MON_THU_SLOTS);
      const mineIds = await seedPpct(ctx.models, mine.positionId, 3);
      const theirIds = await seedPpct(ctx.models, theirs.positionId, 3);
      await engine.recalculate(mine.positionId, d('2025-09-05'));
      await engine.recalculate(theirs.positionId, d('2025-09-05'));

      const res = await as(teacher, api().delete(ppctUrl(mine.positionId, mineIds[0])));

      expect(res.status).toBe(200);
      expect(await datesOf(theirIds)).toEqual(['2026-01-05', '2026-01-08', '2026-01-12']);
    });

    it('xóa lần thứ hai cùng 1 mục -> 404', async () => {
      const { positionId } = await seedToan();
      const [itemId] = await seedPpct(ctx.models, positionId, 1);
      expect((await as(teacher, api().delete(ppctUrl(positionId, itemId)))).status).toBe(200);

      const again = await as(teacher, api().delete(ppctUrl(positionId, itemId)));
      expect(again.status).toBe(404);
      expect(again.body.message).toBe(ITEM_NOT_FOUND);
    });
  });

  describe('IDOR qua itemId và itemId sai định dạng', () => {
    it('PATCH/DELETE mục của position KHÁC qua /positions/<A>/ppct/<itemB> -> 404 và mục của B nguyên vẹn', async () => {
      const mine = await seedToan({ className: '11A4' });
      const theirs = await seedToan({ holder: otherTeacher, className: '11A5' });
      await seedSlots(ctx.models, theirs.positionId, MON_THU_SLOTS);
      const [theirItemId] = await seedPpct(ctx.models, theirs.positionId, 1);
      await engine.recalculate(theirs.positionId, d('2025-09-05'));

      const patch = await as(teacher, api().patch(ppctUrl(mine.positionId, theirItemId))).send({ title: 'Bị sửa' });
      expect(patch.status).toBe(404);
      expect(patch.body.message).toBe(ITEM_NOT_FOUND);

      const del = await as(teacher, api().delete(ppctUrl(mine.positionId, theirItemId)));
      expect(del.status).toBe(404);
      expect(del.body.message).toBe(ITEM_NOT_FOUND);

      const stored = await ctx.models.ppctItem.findById(theirItemId);
      expect(stored).toMatchObject({ title: 'Bài 1' });
      expect(String(stored!.positionId)).toBe(theirs.positionId);
      expect(await ctx.models.lessonLog.countDocuments({ ppctItemId: theirItemId })).toBe(1);
    });

    it('ADMIN cũng không sửa/xóa được mục của position khác qua đường dẫn của position A', async () => {
      const mine = await seedToan({ className: '11A4' });
      const theirs = await seedToan({ holder: otherTeacher, className: '11A5' });
      const [theirItemId] = await seedPpct(ctx.models, theirs.positionId, 1);

      const del = await as(admin, api().delete(ppctUrl(mine.positionId, theirItemId)));
      const patch = await as(admin, api().patch(ppctUrl(mine.positionId, theirItemId))).send({ title: 'Bị sửa' });

      expect(del.status).toBe(404);
      expect(patch.status).toBe(404);
      expect(await ctx.models.ppctItem.countDocuments({ _id: theirItemId, title: 'Bài 1' })).toBe(1);
    });

    it('itemId không tồn tại hoặc không phải ObjectId -> 404, không phải 400/500', async () => {
      const { positionId } = await seedToan();
      for (const itemId of ['khong-phai-objectid', '123', 'abcdefghijkl', '64b7f0c2a1b2c3d4e5f60718']) {
        const patch = await as(teacher, api().patch(ppctUrl(positionId, itemId))).send({ title: 'X' });
        expect([itemId, patch.status, patch.body.message]).toEqual([itemId, 404, ITEM_NOT_FOUND]);
        const del = await as(teacher, api().delete(ppctUrl(positionId, itemId)));
        expect([itemId, del.status, del.body.message]).toEqual([itemId, 404, ITEM_NOT_FOUND]);
      }
    });
  });

  describe('đồng thời', () => {
    it('2 POST đồng thời: mỗi response là 201 hoặc 409 (không 500), order không trùng, số mục = số 201', async () => {
      // Lặp nhiều vòng trên position mới: race chỉ lộ ra khi 2 transaction chồng thời gian.
      for (let round = 0; round < 5; round++) {
        const { positionId } = await seedToan({ className: `11R${round}` });
        await seedSlots(ctx.models, positionId, MON_THU_SLOTS);
        await seedPpct(ctx.models, positionId, round); // round = 0 -> position còn trống, các vòng sau đã có mục.

        const responses = await Promise.all([
          postItem(teacher, positionId, itemBody(1, { title: 'Song song A' })),
          postItem(teacher, positionId, itemBody(2, { title: 'Song song B' })),
        ]);

        const outcomes = responses.map((res) => ({ round, status: res.status, message: res.body.message }));
        expect(outcomes.filter((outcome) => outcome.status !== 201 && outcome.status !== 409)).toEqual([]);
        const created = outcomes.filter((outcome) => outcome.status === 201).length;
        expect(created).toBeGreaterThanOrEqual(1);

        const orders = await ordersOf(positionId);
        expect(orders).toHaveLength(round + created);
        expect(new Set(orders).size).toBe(orders.length);
        expect(orders).toEqual(Array.from({ length: orders.length }, (_, i) => i + 1));
        // Sau race, mọi mục đều có log (ô còn dư rất nhiều) và không có log mồ côi.
        const itemIds = (await ctx.models.ppctItem.find({ positionId })).map((item) => String(item._id));
        expect((await datesOf(itemIds)).every(Boolean)).toBe(true);
        expect(await ctx.models.lessonLog.countDocuments({ positionId })).toBe(itemIds.length);
      }
    });
  });

  describe('validation và position HOMEROOM', () => {
    it('body sai (periodCount: 0, week: 61, thiếu title, ...) -> 400 tiếng Việt, không lưu', async () => {
      const { positionId } = await seedToan();
      const withoutTitle: Record<string, unknown> = itemBody(1);
      delete withoutTitle.title;
      const bad = [
        itemBody(1, { periodCount: 0 }),
        itemBody(1, { periodCount: 11 }),
        itemBody(1, { week: 61 }),
        itemBody(1, { week: 0 }),
        itemBody(1, { periodLabel: '' }),
        itemBody(1, { periodLabel: 'x'.repeat(21) }),
        itemBody(1, { title: '   ' }),
        itemBody(1, { week: '1' }),
        withoutTitle,
      ];
      for (const body of bad) {
        const res = await postItem(teacher, positionId, body);
        expect([JSON.stringify(body), res.status]).toEqual([JSON.stringify(body), 400]);
        expect(res.body.message).toContain(INVALID_BODY);
      }
      expect(await ctx.models.ppctItem.countDocuments()).toBe(0);
    });

    it('PATCH body sai -> 400, mục không đổi', async () => {
      const { positionId } = await seedToan();
      const [itemId] = await seedPpct(ctx.models, positionId, 1);

      const res = await as(teacher, api().patch(ppctUrl(positionId, itemId))).send({ periodCount: 0 });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain(INVALID_BODY);
      expect((await ctx.models.ppctItem.findById(itemId))!.periodCount).toBe(1);
    });

    it('ghi (POST/PATCH/DELETE) vào position HOMEROOM -> 400 kèm thông báo; GET trả mảng rỗng', async () => {
      const gvcn = await ctx.createClass(`gvcn.ppct.homeroom.${gvcnCounter++}`, '11A8');
      const homeroomId = gvcn.homeroomPositionId;

      const post = await postItem(gvcn, homeroomId, itemBody(1));
      expect(post.status).toBe(400);
      expect(post.body.message).toBe(SUBJECT_ONLY);

      const itemId = '64b7f0c2a1b2c3d4e5f60718';
      const patch = await as(gvcn, api().patch(ppctUrl(homeroomId, itemId))).send({ title: 'X' });
      expect(patch.status).toBe(400);
      expect(patch.body.message).toBe(SUBJECT_ONLY);
      const del = await as(gvcn, api().delete(ppctUrl(homeroomId, itemId)));
      expect(del.status).toBe(400);
      expect(del.body.message).toBe(SUBJECT_ONLY);

      const list = await as(gvcn, api().get(ppctUrl(homeroomId)));
      expect(list.status).toBe(200);
      expect(list.body).toEqual([]);
      expect(await ctx.models.ppctItem.countDocuments()).toBe(0);
    });
  });

  describe('phân quyền', () => {
    it('chưa đăng nhập -> 401; STUDENT -> 403 cả đọc lẫn ghi', async () => {
      const { positionId } = await seedToan();
      expect((await api().get(ppctUrl(positionId))).status).toBe(401);
      expect((await api().post(ppctUrl(positionId)).send(itemBody(1))).status).toBe(401);
      expect((await as(student, api().get(ppctUrl(positionId)))).status).toBe(403);
      expect((await postItem(student, positionId, itemBody(1))).status).toBe(403);
      expect(await ctx.models.ppctItem.countDocuments()).toBe(0);
    });

    it('giáo viên không giữ position và không phải GVCN lớp đó: đọc/ghi đều 403, không đổi dữ liệu', async () => {
      const { positionId } = await seedToan();
      const [itemId] = await seedPpct(ctx.models, positionId, 1);

      expect((await as(otherTeacher, api().get(ppctUrl(positionId)))).status).toBe(403);
      expect((await postItem(otherTeacher, positionId, itemBody(2))).status).toBe(403);
      expect((await as(otherTeacher, api().patch(ppctUrl(positionId, itemId))).send({ title: 'X' })).status).toBe(403);
      expect((await as(otherTeacher, api().delete(ppctUrl(positionId, itemId)))).status).toBe(403);

      const items = await ctx.models.ppctItem.find({ positionId });
      expect(items.map((item) => item.title)).toEqual(['Bài 1']);
    });

    it('GVCN của lớp xem được PPCT các môn (200) nhưng không ghi được (403)', async () => {
      const gvcn = await ctx.createClass(`gvcn.ppct.perm.${gvcnCounter++}`, '11A9');
      const subjectId = await ctx.joinSubject(gvcn.code, teacher.token, 'Toán');
      const [itemId] = await seedPpct(ctx.models, subjectId, 1);

      const list = await as(gvcn, api().get(ppctUrl(subjectId)));
      expect(list.status).toBe(200);
      expect(list.body).toHaveLength(1);

      expect((await postItem(gvcn, subjectId, itemBody(2))).status).toBe(403);
      expect((await as(gvcn, api().patch(ppctUrl(subjectId, itemId))).send({ title: 'X' })).status).toBe(403);
      expect((await as(gvcn, api().delete(ppctUrl(subjectId, itemId)))).status).toBe(403);
      expect(await ctx.models.ppctItem.countDocuments({ positionId: subjectId })).toBe(1);
    });

    it('ADMIN đọc và ghi được PPCT của mọi position', async () => {
      const { positionId } = await seedToan();
      const created = await postItem(admin, positionId, itemBody(1));
      expect(created.status).toBe(201);
      expect((await as(admin, api().get(ppctUrl(positionId)))).body).toHaveLength(1);
      expect((await as(admin, api().patch(ppctUrl(positionId, created.body._id))).send({ title: 'Admin sửa' })).status).toBe(200);
      expect((await as(admin, api().delete(ppctUrl(positionId, created.body._id)))).status).toBe(200);
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
      return jest.spyOn(engine, 'recalculateWithDefaultFrom').mockRejectedValueOnce(new Error('boom'));
    }

    it('POST: tính lại lỗi -> 500 và số mục PPCT không đổi', async () => {
      const { positionId } = await seedToan();
      await seedPpct(ctx.models, positionId, 2);
      const before = await ctx.models.ppctItem.countDocuments();

      failNextRecalculation();
      const res = await postItem(teacher, positionId, itemBody(3));

      expect(res.status).toBe(500);
      expect(await ctx.models.ppctItem.countDocuments()).toBe(before);
    });

    it('PATCH: tính lại lỗi -> 500 và mục giữ nguyên giá trị cũ', async () => {
      const { positionId } = await seedToan();
      const [itemId] = await seedPpct(ctx.models, positionId, 1);

      failNextRecalculation();
      const res = await as(teacher, api().patch(ppctUrl(positionId, itemId))).send({ title: 'Đã đổi', periodCount: 3 });

      expect(res.status).toBe(500);
      expect(await ctx.models.ppctItem.findById(itemId)).toMatchObject({ title: 'Bài 1', periodCount: 1 });
    });

    it('DELETE: tính lại lỗi -> 500, mục và log của nó vẫn còn', async () => {
      const { positionId } = await seedToan();
      await seedSlots(ctx.models, positionId, MON_THU_SLOTS);
      const [itemId] = await seedPpct(ctx.models, positionId, 1);
      await engine.recalculate(positionId, d('2025-09-05'));
      expect(await ctx.models.lessonLog.countDocuments({ ppctItemId: itemId })).toBe(1);

      failNextRecalculation();
      const res = await as(teacher, api().delete(ppctUrl(positionId, itemId)));

      expect(res.status).toBe(500);
      expect(await ctx.models.ppctItem.countDocuments({ _id: itemId })).toBe(1);
      expect(await ctx.models.lessonLog.countDocuments({ ppctItemId: itemId })).toBe(1);
    });
  });
});
