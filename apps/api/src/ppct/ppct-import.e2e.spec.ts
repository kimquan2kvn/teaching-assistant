import ExcelJS from 'exceljs';
import request from 'supertest';
import {
  MAX_PPCT_IMPORT_ROWS,
  MAX_PPCT_PERIOD_COUNT,
  MAX_PPCT_WEEK,
  PPCT_IMPORT_HEADERS,
  ppctImportCommitSchema,
} from '@so-chu-nhiem/shared';
import { formatDateOnly } from '../common/utils/date';
import { LessonLogEngineService } from '../lesson-logs/lesson-log-engine.service';
import { PpctController } from './ppct.controller';
import { PpctService } from './ppct.service';
import { Phase3App, Phase3Session, createPhase3App } from '../../test/phase3-test-app';
import { d, seedPpct, seedSlots, seedSubjectPosition } from '../../test/phase3-fixtures';

const SUBJECT_ONLY = 'Chỉ vị trí giáo viên bộ môn mới có thời khóa biểu và PPCT';
const INVALID_BODY = 'Dữ liệu gửi lên không hợp lệ';
// Thứ Hai (tiết 1) + Thứ Năm (tiết 3) từ 2026-01-05: chuỗi ô tự do của fixture.
const MON_THU_DATES = ['2026-01-05', '2026-01-08', '2026-01-12', '2026-01-15', '2026-01-19'];
const MON_THU_SLOTS = [
  { dayOfWeek: 2, period: 1 },
  { dayOfWeek: 5, period: 3 },
];
const DEFAULT_NOW = '2026-01-04T03:00:00Z';
// Giữa năm học: các ô 01-05, 01-08, 01-12 của TKB Thứ Hai/Thứ Năm đã qua, ô tự do kế tiếp là 01-15.
const MID_YEAR_NOW = '2026-01-14T03:00:00Z';

type SheetCell = string | number | null;

describe('Ppct import (e2e)', () => {
  let ctx: Phase3App;
  let engine: LessonLogEngineService;
  let teacher: Phase3Session;
  let otherTeacher: Phase3Session;
  let admin: Phase3Session;
  let student: Phase3Session;
  let gvcnCounter = 0;

  beforeAll(async () => {
    ctx = await createPhase3App({
      dbName: 'ppct_import_e2e',
      controllers: [PpctController],
      providers: [PpctService, LessonLogEngineService],
    });
    engine = ctx.app.get(LessonLogEngineService);
    teacher = await ctx.register('gvbm.import');
    otherTeacher = await ctx.register('gvbm.import.khac');
    admin = await ctx.register('admin.import', 'ADMIN');
    student = await ctx.register('hocsinh.import', 'STUDENT');
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
  const importUrl = (positionId: string, step: 'preview' | 'commit') => `/positions/${positionId}/ppct/import/${step}`;
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

  async function buildWorkbook(rows: SheetCell[][]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('PPCT');
    sheet.addRow([...PPCT_IMPORT_HEADERS]);
    rows.forEach((row) => sheet.addRow(row));
    return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
  }

  const validSheetRow = (n: number): SheetCell[] => [n, `Bài ${n}`, 1, String(n), `Yêu cầu ${n}`, ''];

  const commitRow = (n: number, overrides: Record<string, unknown> = {}) => ({
    week: n,
    periodLabel: String(n),
    title: `Bài ${n}`,
    periodCount: 1,
    requirement: `Yêu cầu ${n}`,
    ...overrides,
  });

  function preview(session: Phase3Session, positionId: string, buffer: Buffer, filename = 'ppct.xlsx') {
    return as(session, api().post(importUrl(positionId, 'preview'))).attach('file', buffer, filename);
  }

  function commit(session: Phase3Session, positionId: string, rows: unknown[]) {
    return as(session, api().post(importUrl(positionId, 'commit'))).send({ rows });
  }

  async function ordersOf(positionId: string): Promise<number[]> {
    const items = await ctx.models.ppctItem.find({ positionId }).sort({ order: 1 });
    return items.map((item) => item.order);
  }

  describe('preview', () => {
    it('trả { rows } kèm dòng lỗi và KHÔNG ghi DB', async () => {
      const { positionId } = await seedToan();
      await seedSlots(ctx.models, positionId, MON_THU_SLOTS);
      await seedPpct(ctx.models, positionId, 2);
      const itemsBefore = await ctx.models.ppctItem.countDocuments();
      const logsBefore = await ctx.models.lessonLog.countDocuments();
      const buffer = await buildWorkbook([validSheetRow(1), ['abc', '', 0, '', '', ''], validSheetRow(3)]);

      const res = await preview(teacher, positionId, buffer);

      expect(res.status).toBe(201);
      expect(res.body.rows).toHaveLength(3);
      expect(res.body.rows[0]).toMatchObject({ rowNumber: 2, week: 1, title: 'Bài 1', periodCount: 1, errors: [] });
      expect(res.body.rows[1]).toMatchObject({ rowNumber: 3, week: null, periodCount: null });
      expect(res.body.rows[1].errors).toEqual([
        'Tuần phải là số nguyên từ 1 đến 60',
        'Bài học không được để trống',
        'Số tiết phải là số nguyên từ 1 đến 10',
        'Tiết thứ không được để trống',
      ]);
      expect(res.body.rows[2]).toMatchObject({ rowNumber: 4, errors: [] });
      expect(await ctx.models.ppctItem.countDocuments()).toBe(itemsBefore);
      expect(await ctx.models.lessonLog.countDocuments()).toBe(logsBefore);
    });

    it('không gửi file -> 400 "Chưa chọn file để import"', async () => {
      const { positionId } = await seedToan();

      const res = await as(teacher, api().post(importUrl(positionId, 'preview')));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Chưa chọn file để import');
    });

    it('file không phải xlsx -> 400 "File không đúng định dạng Excel (.xlsx)"', async () => {
      const { positionId } = await seedToan();

      const res = await preview(teacher, positionId, Buffer.from('không phải excel'), 'ppct.xlsx');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('File không đúng định dạng Excel (.xlsx)');
    });

    it('501 dòng dữ liệu -> 400 "File có quá nhiều dòng (tối đa 500)" và không ghi DB', async () => {
      const { positionId } = await seedToan();
      const buffer = await buildWorkbook(Array.from({ length: 501 }, (_, i) => validSheetRow((i % 60) + 1)));

      const res = await preview(teacher, positionId, buffer);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('File có quá nhiều dòng (tối đa 500)');
      expect(await ctx.models.ppctItem.countDocuments()).toBe(0);
    });

    it('chưa đăng nhập -> 401; STUDENT -> 403; GVBM môn khác -> 403; không ghi DB', async () => {
      const { positionId } = await seedToan();
      const buffer = await buildWorkbook([validSheetRow(1)]);

      expect((await api().post(importUrl(positionId, 'preview')).attach('file', buffer, 'ppct.xlsx')).status).toBe(401);
      expect((await preview(student, positionId, buffer)).status).toBe(403);
      expect((await preview(otherTeacher, positionId, buffer)).status).toBe(403);
      expect(await ctx.models.ppctItem.countDocuments()).toBe(0);
    });
  });

  describe('commit', () => {
    it('position đã có 2 mục -> mục mới nhận order 3, 4, 5; trả 201 kèm các mục đã tạo', async () => {
      const { positionId } = await seedToan();
      await seedPpct(ctx.models, positionId, 2);

      const res = await commit(teacher, positionId, [
        commitRow(3, { note: 'Ghi chú' }),
        commitRow(4, { periodLabel: '15-16', periodCount: 2 }),
        commitRow(5),
      ]);

      expect(res.status).toBe(201);
      expect(res.body.map((item: { order: number }) => item.order)).toEqual([3, 4, 5]);
      expect(res.body[0]).toMatchObject({ positionId, title: 'Bài 3', note: 'Ghi chú', requirement: 'Yêu cầu 3' });
      expect(res.body[1]).toMatchObject({ periodLabel: '15-16', periodCount: 2 });
      expect(await ordersOf(positionId)).toEqual([1, 2, 3, 4, 5]);
    });

    it('order nối sau max hiện có kể cả khi có chỗ trống (đã xóa mục giữa); position trống bắt đầu từ 1', async () => {
      const gap = await seedToan({ className: '11A4' });
      const empty = await seedToan({ className: '11A5' });
      const ids = await seedPpct(ctx.models, gap.positionId, 3);
      await ctx.models.ppctItem.deleteOne({ _id: ids[1] });

      expect((await commit(teacher, gap.positionId, [commitRow(4)])).status).toBe(201);
      expect((await commit(teacher, empty.positionId, [commitRow(1), commitRow(2)])).status).toBe(201);

      expect(await ordersOf(gap.positionId)).toEqual([1, 3, 4]);
      expect(await ordersOf(empty.positionId)).toEqual([1, 2]);
    });

    it('commit kích hoạt tính lại: có slot thì log xuất hiện đúng thứ tự order, mục cũ không bị nhân đôi log', async () => {
      const { positionId } = await seedToan();
      await seedSlots(ctx.models, positionId, MON_THU_SLOTS);
      await seedPpct(ctx.models, positionId, 2);
      await engine.recalculate(positionId, d('2025-09-05'));

      const res = await commit(teacher, positionId, [commitRow(3), commitRow(4), commitRow(5)]);

      expect(res.status).toBe(201);
      const itemIds = (await ctx.models.ppctItem.find({ positionId }).sort({ order: 1 })).map((item) => String(item._id));
      const logs = await ctx.models.lessonLog.find({ positionId });
      const dateByItem = new Map(logs.map((log) => [String(log.ppctItemId), formatDateOnly(log.date)]));
      expect(itemIds.map((id) => dateByItem.get(id) ?? null)).toEqual(MON_THU_DATES);
      expect(logs).toHaveLength(5);
    });

    it('position chưa có slot: commit thành công, không có log, không lỗi', async () => {
      const { positionId } = await seedToan();

      const res = await commit(teacher, positionId, [commitRow(1), commitRow(2)]);

      expect(res.status).toBe(201);
      expect(await ctx.models.ppctItem.countDocuments({ positionId })).toBe(2);
      expect(await ctx.models.lessonLog.countDocuments({ positionId })).toBe(0);
    });

    it('có dòng sai (periodCount: 0) -> 400 tiếng Việt và KHÔNG lưu dòng nào', async () => {
      const { positionId } = await seedToan();
      await seedPpct(ctx.models, positionId, 1);

      const res = await commit(teacher, positionId, [commitRow(2), commitRow(3, { periodCount: 0 }), commitRow(4)]);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain(INVALID_BODY);
      expect(await ctx.models.ppctItem.countDocuments()).toBe(1);
    });

    it.each<[string, unknown]>([
      ['rows rỗng', []],
      ['thiếu rows', undefined],
      ['quá 500 dòng', Array.from({ length: 501 }, (_, i) => commitRow((i % 60) + 1))],
      ['dòng có week không phải số', [commitRow(1, { week: '1' })]],
      ['dòng thiếu title', [{ week: 1, periodLabel: '1', periodCount: 1 }]],
    ])('body sai (%s) -> 400 và không lưu', async (_label, rows) => {
      const { positionId } = await seedToan();

      const res = await as(teacher, api().post(importUrl(positionId, 'commit'))).send(rows === undefined ? {} : { rows });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain(INVALID_BODY);
      expect(await ctx.models.ppctItem.countDocuments()).toBe(0);
    });

    it('position HOMEROOM -> 400 kèm thông báo, không lưu', async () => {
      const gvcn = await ctx.createClass(`gvcn.import.homeroom.${gvcnCounter++}`, '11A8');

      const res = await commit(gvcn, gvcn.homeroomPositionId, [commitRow(1)]);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(SUBJECT_ONLY);
      expect(await ctx.models.ppctItem.countDocuments()).toBe(0);
    });

    it('GVBM môn khác -> 403; GVCN của lớp -> 403; STUDENT -> 403; chưa đăng nhập -> 401; dữ liệu không đổi', async () => {
      const gvcn = await ctx.createClass(`gvcn.import.perm.${gvcnCounter++}`, '11A9');
      const subjectId = await ctx.joinSubject(gvcn.code, teacher.token, 'Toán');

      expect((await commit(otherTeacher, subjectId, [commitRow(1)])).status).toBe(403);
      expect((await commit(gvcn, subjectId, [commitRow(1)])).status).toBe(403);
      expect((await commit(student, subjectId, [commitRow(1)])).status).toBe(403);
      expect((await api().post(importUrl(subjectId, 'commit')).send({ rows: [commitRow(1)] })).status).toBe(401);
      expect(await ctx.models.ppctItem.countDocuments()).toBe(0);
    });

    it('ADMIN commit được vào mọi position', async () => {
      const { positionId } = await seedToan();

      const res = await commit(admin, positionId, [commitRow(1)]);

      expect(res.status).toBe(201);
      expect(await ctx.models.ppctItem.countDocuments({ positionId })).toBe(1);
    });

    describe('lô lớn: body vượt 100kb mặc định của express', () => {
      // Độ dài tối đa của từng field theo ppctImportCommitSchema. Dùng chữ tiếng Việt 3 byte UTF-8 (không phải ASCII)
      // để body lớn nhất có thể, vì giới hạn body tính theo byte chứ không theo số ký tự.
      const WIDE_CHAR = 'ế';
      const MAX_FIELD_LENGTH = { periodLabel: 20, title: 300, requirement: 1000, note: 500 };
      const maxRow = () => ({
        week: MAX_PPCT_WEEK,
        periodLabel: WIDE_CHAR.repeat(MAX_FIELD_LENGTH.periodLabel),
        title: WIDE_CHAR.repeat(MAX_FIELD_LENGTH.title),
        periodCount: MAX_PPCT_PERIOD_COUNT,
        requirement: WIDE_CHAR.repeat(MAX_FIELD_LENGTH.requirement),
        note: WIDE_CHAR.repeat(MAX_FIELD_LENGTH.note),
      });

      it('fixture đúng là độ dài tối đa của schema dùng chung (nới schema thì phải xem lại giới hạn body)', () => {
        const rows = Array.from({ length: MAX_PPCT_IMPORT_ROWS }, maxRow);

        expect(ppctImportCommitSchema.safeParse({ rows }).success).toBe(true);
        expect(ppctImportCommitSchema.safeParse({ rows: [...rows, maxRow()] }).success).toBe(false);
        for (const field of ['periodLabel', 'title', 'requirement', 'note'] as const) {
          const tooLong = { ...maxRow(), [field]: WIDE_CHAR.repeat(MAX_FIELD_LENGTH[field] + 1) };
          expect(ppctImportCommitSchema.safeParse({ rows: [tooLong] }).success).toBe(false);
        }
      });

      it('500 dòng ở độ dài tối đa của mọi field (hơn 2 MB) -> 201, lưu đủ 500 mục có order liên tiếp, nội dung không bị cắt', async () => {
        const { positionId } = await seedToan();
        const rows = Array.from({ length: MAX_PPCT_IMPORT_ROWS }, maxRow);
        expect(Buffer.byteLength(JSON.stringify({ rows }))).toBeGreaterThan(2 * 1024 * 1024);

        const res = await commit(teacher, positionId, rows);

        expect(res.status).toBe(201);
        expect(res.body).toHaveLength(MAX_PPCT_IMPORT_ROWS);
        expect(await ordersOf(positionId)).toEqual(Array.from({ length: MAX_PPCT_IMPORT_ROWS }, (_, i) => i + 1));
        const last = await ctx.models.ppctItem.findOne({ positionId, order: MAX_PPCT_IMPORT_ROWS });
        expect(last).toMatchObject(maxRow());
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

      it('tính lại lỗi -> 500 và không mục nào của lô import được lưu', async () => {
        const { positionId } = await seedToan();
        await seedPpct(ctx.models, positionId, 2);
        const before = await ctx.models.ppctItem.countDocuments();

        jest.spyOn(engine, 'recalculateWithDefaultFrom').mockRejectedValueOnce(new Error('boom'));
        const res = await commit(teacher, positionId, [commitRow(3), commitRow(4)]);

        expect(res.status).toBe(500);
        expect(await ctx.models.ppctItem.countDocuments()).toBe(before);
        expect(await ordersOf(positionId)).toEqual([1, 2]);
      });
    });
  });

  describe('luồng preview -> sửa -> commit', () => {
    it('dòng hợp lệ lấy từ preview gửi thẳng vào commit được (kể cả note/requirement rỗng, week/periodCount dạng số)', async () => {
      const { positionId } = await seedToan();
      const buffer = await buildWorkbook([
        [1, 'Bài 1', 1, '1', '', ''],
        [2, 'Bài 2', 2, '2-3', 'Yêu cầu', 'Ghi chú'],
      ]);

      const previewRes = await preview(teacher, positionId, buffer);
      expect(previewRes.status).toBe(201);
      type PreviewRow = { week: number; title: string; periodCount: number; periodLabel: string; requirement: string; note: string };
      const rows = previewRes.body.rows.map((row: PreviewRow) => ({
        week: row.week,
        title: row.title,
        periodCount: row.periodCount,
        periodLabel: row.periodLabel,
        requirement: row.requirement,
        note: row.note,
      }));

      const commitRes = await commit(teacher, positionId, rows);

      expect(commitRes.status).toBe(201);
      expect(await ordersOf(positionId)).toEqual([1, 2]);
    });
  });

  describe('commit giữa năm học (hôm nay 2026-01-14, TKB khai báo từ 2026-01-05)', () => {
    beforeEach(() => {
      ctx.clock.set(MID_YEAR_NOW);
    });

    afterEach(() => {
      ctx.clock.set(DEFAULT_NOW);
    });

    async function datesOf(itemIds: string[]): Promise<Array<string | null>> {
      const logs = await ctx.models.lessonLog.find({ ppctItemId: { $in: itemIds } });
      const byItem = new Map(logs.map((log) => [String(log.ppctItemId), formatDateOnly(log.date)]));
      return itemIds.map((id) => byItem.get(id) ?? null);
    }

    async function snapshotOf(itemIds: string[]) {
      const logs = await ctx.models.lessonLog.find({ ppctItemId: { $in: itemIds } });
      const byItem = new Map(logs.map((log) => [String(log.ppctItemId), log]));
      return itemIds.map((id) => {
        const log = byItem.get(id);
        return log ? { id: String(log._id), date: formatDateOnly(log.date), done: log.done } : null;
      });
    }

    const idsOf = (res: { body: Array<{ _id: string }> }) => res.body.map((item) => item._id);

    it('import cả 5 dòng vào position đã có TKB: xếp 01-05, 01-08, 01-12, 01-15, 01-19 như khi nhập từng mục', async () => {
      const { positionId } = await seedToan();
      await seedSlots(ctx.models, positionId, MON_THU_SLOTS);

      const res = await commit(teacher, positionId, [1, 2, 3, 4, 5].map((n) => commitRow(n)));

      expect(res.status).toBe(201);
      expect(await datesOf(idsOf(res))).toEqual(MON_THU_DATES);
    });

    it('position đã có log ở quá khứ: các dòng mới nối ngay sau log cuối, log cũ không đổi', async () => {
      const { positionId } = await seedToan();
      await seedSlots(ctx.models, positionId, MON_THU_SLOTS);
      const oldIds = await seedPpct(ctx.models, positionId, 2);
      await engine.recalculate(positionId, d('2025-09-05'));
      await ctx.models.lessonLog.updateOne({ ppctItemId: oldIds[0] }, { done: true });
      const before = await snapshotOf(oldIds);
      expect(before.map((log) => log?.date)).toEqual(['2026-01-05', '2026-01-08']);

      const res = await commit(teacher, positionId, [commitRow(3), commitRow(4), commitRow(5)]);

      expect(res.status).toBe(201);
      expect(await datesOf(idsOf(res))).toEqual(['2026-01-12', '2026-01-15', '2026-01-19']);
      expect(await snapshotOf(oldIds)).toEqual(before);
    });

    it('lịch đã kéo tới tương lai: các dòng mới nối đuôi từ hôm nay như cũ', async () => {
      const { positionId } = await seedToan();
      await seedSlots(ctx.models, positionId, MON_THU_SLOTS);
      const oldIds = await seedPpct(ctx.models, positionId, 6);
      await engine.recalculate(positionId, d('2025-09-05'));
      const before = await snapshotOf(oldIds);
      expect(before.map((log) => log?.date)).toEqual([...MON_THU_DATES, '2026-01-22']);

      const res = await commit(teacher, positionId, [commitRow(7), commitRow(8)]);

      expect(res.status).toBe(201);
      expect(await datesOf(idsOf(res))).toEqual(['2026-01-26', '2026-01-29']);
      expect(await snapshotOf(oldIds)).toEqual(before);
    });
  });
});
