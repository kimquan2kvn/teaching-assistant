import ExcelJS from 'exceljs';
import request from 'supertest';
import { PPCT_IMPORT_HEADERS } from '@so-chu-nhiem/shared';
import { HolidaysController } from '../holidays/holidays.controller';
import { HolidaysService } from '../holidays/holidays.service';
import { PpctController } from '../ppct/ppct.controller';
import { PpctService } from '../ppct/ppct.service';
import { TimetableMeController, TimetableSlotsController } from '../timetable-slots/timetable-slots.controller';
import { TimetableSlotsService } from '../timetable-slots/timetable-slots.service';
import { LessonLogEngineService } from './lesson-log-engine.service';
import { LessonLogsController } from './lesson-logs.controller';
import { LessonLogsService } from './lesson-logs.service';
import { TeacherLessonLogsController } from './teacher-lesson-logs.controller';
import { Phase3App, Phase3Session, createPhase3App } from '../../test/phase3-test-app';
import { d, seedPpct, seedSlots } from '../../test/phase3-fixtures';

type Persona = 'GVBM' | 'GVCN' | 'GVBM-khác' | 'GV-lớp-khác' | 'ADMIN' | 'STUDENT';
// Thứ tự cột của bảng 4.4 trong spec: GVBM / GVCN / GVBM-khác / GV-lớp-khác / ADMIN / STUDENT.
type Expected = [number, number, number, number, number, number];
type Agent = ReturnType<typeof request>;

const PERSONAS: Persona[] = ['GVBM', 'GVCN', 'GVBM-khác', 'GV-lớp-khác', 'ADMIN', 'STUDENT'];
const WEEK_START = '2026-01-05';
// Thứ Hai (tiết 1) + Thứ Năm (tiết 3) từ 2026-01-05 → log 01-05, 01-08, 01-12, 01-15, 01-19.
const MON_THU_SLOTS = [
  { dayOfWeek: 2, period: 1 },
  { dayOfWeek: 5, period: 3 },
];

interface Fixture {
  schoolYearId: string;
  positionId: string;
  slotIds: string[];
  itemIds: string[];
  logIds: string[];
  holidayId: string;
}

interface RouteCase {
  name: string;
  // true: route có `:positionId` (dùng cho kiểm (iii) — id thật của position lớp A).
  positionBound: boolean;
  expected: Expected;
  send: (agent: Agent, f: Fixture) => request.Test;
}

const READ_ALL: Expected = [200, 200, 200, 200, 200, 403];
const TEACHER_ONLY_READ: Expected = [200, 200, 200, 200, 403, 403];
const POSITION_READ: Expected = [200, 200, 403, 403, 200, 403];
const adminOnly = (status: number): Expected => [403, 403, 403, 403, status, 403];
const selfWrite = (status: number): Expected => [status, 403, 403, 403, status, 403];

describe('Phase 3 permission matrix (e2e)', () => {
  let ctx: Phase3App;
  let engine: LessonLogEngineService;
  let tokens: Record<Persona, string>;
  let gvbm: Phase3Session;
  let gvcn: Phase3Session & { classId: string; code: string };
  let toanPositionId: string;
  let vanPositionId: string;
  let fixture: Fixture;
  let workbook: Buffer;

  beforeAll(async () => {
    ctx = await createPhase3App({
      dbName: 'phase3_permission_matrix_e2e',
      controllers: [
        HolidaysController,
        TimetableSlotsController,
        TimetableMeController,
        PpctController,
        LessonLogsController,
        TeacherLessonLogsController,
      ],
      providers: [HolidaysService, TimetableSlotsService, PpctService, LessonLogsService, LessonLogEngineService],
    });
    engine = ctx.app.get(LessonLogEngineService);

    // Lớp A: GVCN + GVBM giữ Toán + GVBM-khác giữ Ngữ văn. Lớp B: giáo viên khác hẳn làm GVCN.
    gvcn = await ctx.createClass('gvcn.matrix.a', '11A');
    gvbm = await ctx.register('gvbm.matrix.toan');
    const gvbmOther = await ctx.register('gvbm.matrix.van');
    toanPositionId = await ctx.joinSubject(gvcn.code, gvbm.token, 'Toán');
    vanPositionId = await ctx.joinSubject(gvcn.code, gvbmOther.token, 'Ngữ văn');
    const gvOtherClass = await ctx.createClass('gvcn.matrix.b', '11B');
    const admin = await ctx.register('admin.matrix', 'ADMIN');
    const student = await ctx.register('hocsinh.matrix', 'STUDENT');
    tokens = {
      GVBM: gvbm.token,
      GVCN: gvcn.token,
      'GVBM-khác': gvbmOther.token,
      'GV-lớp-khác': gvOtherClass.token,
      ADMIN: admin.token,
      STUDENT: student.token,
    };

    const excel = new ExcelJS.Workbook();
    const sheet = excel.addWorksheet('PPCT');
    sheet.addRow([...PPCT_IMPORT_HEADERS]);
    sheet.addRow([1, 'Bài import', 1, '9', 'Yêu cầu', '']);
    workbook = (await excel.xlsx.writeBuffer()) as unknown as Buffer;
  });

  afterAll(async () => {
    await ctx.close();
  });

  // Mỗi test dựng lại dữ liệu gốc của GVBM ở lớp A (2 slot, 5 mục PPCT, log đã xếp, 1 ngày nghỉ) để lệnh DELETE
  // của hàng này không làm hỏng hàng khác. Lớp/vị trí/tài khoản dùng chung (không bị xóa).
  async function buildFixture(): Promise<Fixture> {
    const { models } = ctx;
    ctx.clock.set('2026-01-04T03:00:00Z');
    await models.lessonLog.deleteMany({});
    await models.ppctItem.deleteMany({});
    await models.timetableSlot.deleteMany({});
    await models.holiday.deleteMany({});

    const slotIds = await seedSlots(models, toanPositionId, MON_THU_SLOTS);
    const itemIds = await seedPpct(models, toanPositionId, 5);
    await engine.recalculate(toanPositionId, d('2025-09-05'));
    const logs = await models.lessonLog.find({ positionId: toanPositionId }).sort({ date: 1 });
    if (logs.length === 0) throw new Error('fixture ma trận không sinh được lesson log nào');
    const holiday = await models.holiday.create({
      schoolYearId: ctx.schoolYearId,
      startDate: d('2026-03-02'),
      endDate: d('2026-03-03'),
      type: 'LE',
      name: 'Nghỉ ma trận',
    });
    return {
      schoolYearId: ctx.schoolYearId,
      positionId: toanPositionId,
      slotIds,
      itemIds,
      logIds: logs.map((log) => String(log._id)),
      holidayId: String(holiday._id),
    };
  }

  beforeEach(async () => {
    fixture = await buildFixture();
  });

  const agent = (): Agent => request(ctx.app.getHttpServer());
  const withAuth = (req: request.Test, token: string | null) =>
    token === null ? req : req.set('Authorization', `Bearer ${token}`);

  // Toàn bộ slot/mục/log/ngày nghỉ (document đầy đủ) để so trước-sau: lần gọi bị từ chối không được đổi gì.
  async function snapshot() {
    const { models } = ctx;
    const [slots, items, logs, holidays] = await Promise.all([
      models.timetableSlot.find({}).sort({ _id: 1 }).lean(),
      models.ppctItem.find({}).sort({ _id: 1 }).lean(),
      models.lessonLog.find({}).sort({ _id: 1 }).lean(),
      models.holiday.find({}).sort({ _id: 1 }).lean(),
    ]);
    return JSON.parse(JSON.stringify({ slots, items, logs, holidays }));
  }

  const positionUrl = (f: Fixture, suffix: string) => `/positions/${f.positionId}${suffix}`;

  const ROUTES: RouteCase[] = [
    {
      name: 'GET /school-years/:id/holidays',
      positionBound: false,
      expected: READ_ALL,
      send: (a, f) => a.get(`/school-years/${f.schoolYearId}/holidays`),
    },
    {
      name: 'GET /school-years/:id/calendar-stats',
      positionBound: false,
      expected: READ_ALL,
      send: (a, f) => a.get(`/school-years/${f.schoolYearId}/calendar-stats`).query({ asOf: WEEK_START }),
    },
    {
      name: 'POST /holidays',
      positionBound: false,
      expected: adminOnly(201),
      send: (a, f) =>
        a
          .post('/holidays')
          .send({
            schoolYearId: f.schoolYearId,
            startDate: '2026-02-10',
            endDate: '2026-02-12',
            type: 'KHAC',
            name: 'Nghỉ mới',
          }),
    },
    {
      name: 'PATCH /holidays/:id',
      positionBound: false,
      expected: adminOnly(200),
      send: (a, f) => a.patch(`/holidays/${f.holidayId}`).send({ name: 'Tên mới' }),
    },
    {
      name: 'DELETE /holidays/:id',
      positionBound: false,
      expected: adminOnly(200),
      send: (a, f) => a.delete(`/holidays/${f.holidayId}`),
    },
    {
      name: 'GET /positions/:positionId/timetable-slots',
      positionBound: true,
      expected: POSITION_READ,
      send: (a, f) => a.get(positionUrl(f, '/timetable-slots')),
    },
    {
      name: 'GET /positions/:positionId/ppct',
      positionBound: true,
      expected: POSITION_READ,
      send: (a, f) => a.get(positionUrl(f, '/ppct')),
    },
    {
      name: 'GET /positions/:positionId/lesson-logs',
      positionBound: true,
      expected: POSITION_READ,
      send: (a, f) => a.get(positionUrl(f, '/lesson-logs')),
    },
    {
      name: 'POST /positions/:positionId/timetable-slots',
      positionBound: true,
      expected: selfWrite(201),
      send: (a, f) =>
        a.post(positionUrl(f, '/timetable-slots')).send({ dayOfWeek: 3, period: 2, effectiveFrom: WEEK_START }),
    },
    {
      name: 'PATCH /positions/:positionId/timetable-slots/:slotId',
      positionBound: true,
      expected: selfWrite(200),
      send: (a, f) => a.patch(positionUrl(f, `/timetable-slots/${f.slotIds[0]}`)).send({ period: 2 }),
    },
    {
      name: 'DELETE /positions/:positionId/timetable-slots/:slotId',
      positionBound: true,
      expected: selfWrite(200),
      send: (a, f) => a.delete(positionUrl(f, `/timetable-slots/${f.slotIds[0]}`)),
    },
    {
      name: 'POST /positions/:positionId/ppct',
      positionBound: true,
      expected: selfWrite(201),
      send: (a, f) =>
        a
          .post(positionUrl(f, '/ppct'))
          .send({ week: 6, periodLabel: '6', title: 'Bài mới', periodCount: 1, requirement: '' }),
    },
    {
      name: 'PATCH /positions/:positionId/ppct/:itemId',
      positionBound: true,
      expected: selfWrite(200),
      send: (a, f) => a.patch(positionUrl(f, `/ppct/${f.itemIds[0]}`)).send({ title: 'Bài đã sửa' }),
    },
    {
      name: 'DELETE /positions/:positionId/ppct/:itemId',
      positionBound: true,
      expected: selfWrite(200),
      send: (a, f) => a.delete(positionUrl(f, `/ppct/${f.itemIds[0]}`)),
    },
    {
      name: 'POST /positions/:positionId/ppct/import/preview',
      positionBound: true,
      expected: selfWrite(201),
      send: (a, f) => a.post(positionUrl(f, '/ppct/import/preview')).attach('file', workbook, 'ppct.xlsx'),
    },
    {
      name: 'POST /positions/:positionId/ppct/import/commit',
      positionBound: true,
      expected: selfWrite(201),
      send: (a, f) =>
        a
          .post(positionUrl(f, '/ppct/import/commit'))
          .send({ rows: [{ week: 9, periodLabel: '9', title: 'Bài import', periodCount: 1, requirement: '' }] }),
    },
    {
      name: 'PATCH /positions/:positionId/lesson-logs/:id',
      positionBound: true,
      expected: selfWrite(200),
      send: (a, f) => a.patch(positionUrl(f, `/lesson-logs/${f.logIds[0]}`)).send({ done: true }),
    },
    {
      name: 'POST /positions/:positionId/lesson-logs/recalculate',
      positionBound: true,
      expected: adminOnly(200),
      send: (a, f) => a.post(positionUrl(f, '/lesson-logs/recalculate')).send({}),
    },
    {
      name: 'GET /timetable/me',
      positionBound: false,
      expected: TEACHER_ONLY_READ,
      send: (a) => a.get('/timetable/me').query({ weekStart: WEEK_START }),
    },
    {
      name: 'GET /lesson-logs/week',
      positionBound: false,
      expected: TEACHER_ONLY_READ,
      send: (a) => a.get('/lesson-logs/week').query({ weekStart: WEEK_START }),
    },
  ];

  // Bảng 4.4: từng route × từng vai. Lần gọi bị 403 phải không đổi dữ liệu (kiểm thêm (i)); anon luôn 401 và
  // cũng không đổi dữ liệu (kiểm thêm (iv)). Cột GV-lớp-khác dùng id thật của lớp A (kiểm thêm (iii)).
  describe.each(ROUTES.map((route) => [route.name, route] as const))('%s', (_name, route) => {
    it.each(PERSONAS.map((persona, index) => [persona, route.expected[index]] as const))(
      '%s -> %i',
      async (persona, status) => {
        const before = await snapshot();

        const res = await withAuth(route.send(agent(), fixture), tokens[persona]);

        expect(res.status).toBe(status);
        if (status === 403) {
          expect(await snapshot()).toEqual(before);
        }
      },
    );

    it('anon (không token) -> 401 và dữ liệu không đổi', async () => {
      const before = await snapshot();

      const res = await withAuth(route.send(agent(), fixture), null);

      expect(res.status).toBe(401);
      expect(await snapshot()).toEqual(before);
    });
  });

  describe('(i) lần gọi bị từ chối không đổi số lượng slot/mục/log/ngày nghỉ', () => {
    it('mọi route ghi × mọi vai không được phép: đếm trước-sau bằng nhau', async () => {
      const writeRoutes = ROUTES.filter((route) => !route.name.startsWith('GET'));
      const count = async () => {
        const { models } = ctx;
        return {
          slots: await models.timetableSlot.countDocuments({}),
          items: await models.ppctItem.countDocuments({}),
          logs: await models.lessonLog.countDocuments({}),
          holidays: await models.holiday.countDocuments({}),
        };
      };
      const before = await count();
      let deniedCalls = 0;

      for (const route of writeRoutes) {
        for (const [index, persona] of PERSONAS.entries()) {
          if (route.expected[index] !== 403) continue;
          const res = await withAuth(route.send(agent(), fixture), tokens[persona]);
          expect(res.status).toBe(403);
          deniedCalls += 1;
        }
      }

      expect(deniedCalls).toBeGreaterThan(0);
      expect(await count()).toEqual(before);
    });
  });

  describe('(ii) /lesson-logs/week và /timetable/me chỉ chứa position mà người gọi đang giữ', () => {
    const getWeek = (token: string) =>
      withAuth(agent().get('/lesson-logs/week').query({ weekStart: WEEK_START }), token);
    const getGrid = (token: string) => withAuth(agent().get('/timetable/me').query({ weekStart: WEEK_START }), token);
    const positionIdsOf = (items: Array<{ positionId: string }>) => items.map((item) => item.positionId);

    it('GVBM thấy slot + log của Toán lớp A (đối chứng để các hàng bên dưới không rỗng giả)', async () => {
      const week = await getWeek(gvbm.token);
      const grid = await getGrid(gvbm.token);

      expect(week.status).toBe(200);
      expect(week.body.length).toBeGreaterThan(0);
      expect(new Set(positionIdsOf(week.body))).toEqual(new Set([toanPositionId]));
      expect(grid.status).toBe(200);
      expect(grid.body.slots.length).toBe(2);
      expect(grid.body.lessonLogs.length).toBeGreaterThan(0);
    });

    const NOT_HOLDING_TOAN = ['GVCN', 'GVBM-khác', 'GV-lớp-khác'] as const;
    it.each(NOT_HOLDING_TOAN)('%s không thấy log/slot của position GVBM', async (persona) => {
      const week = await getWeek(tokens[persona]);
      const grid = await getGrid(tokens[persona]);

      expect(week.status).toBe(200);
      expect(week.body).toEqual([]);
      expect(grid.status).toBe(200);
      expect(grid.body.slots).toEqual([]);
      expect(grid.body.lessonLogs).toEqual([]);
    });

    it('GVCN giữ thêm 1 môn trong lớp mình: chỉ thấy môn của mình, không thấy môn của GVBM cùng lớp', async () => {
      const homeroom = await ctx.createClass('gvcn.matrix.c', '11C');
      const lichSuPositionId = await ctx.joinSubject(homeroom.code, homeroom.token, 'Lịch sử');
      const gvbmC = await ctx.register('gvbm.matrix.c');
      const toanCPositionId = await ctx.joinSubject(homeroom.code, gvbmC.token, 'Toán');
      for (const positionId of [lichSuPositionId, toanCPositionId]) {
        await seedSlots(ctx.models, positionId, MON_THU_SLOTS.map((slot) => ({ ...slot, period: slot.period + 3 })));
        await seedPpct(ctx.models, positionId, 3);
        await engine.recalculate(positionId, d('2025-09-05'));
      }

      const week = await getWeek(homeroom.token);
      const grid = await getGrid(homeroom.token);

      expect(week.body.length).toBeGreaterThan(0);
      expect(new Set(positionIdsOf(week.body))).toEqual(new Set([lichSuPositionId]));
      expect(grid.body.slots.length).toBe(2);
      expect(new Set(positionIdsOf(grid.body.slots))).toEqual(new Set([lichSuPositionId]));
      expect(new Set(positionIdsOf(grid.body.lessonLogs))).toEqual(new Set([lichSuPositionId]));
    });
  });

  describe('(iii) GV lớp khác biết đúng positionId/itemId/slotId/logId vẫn bị chặn mọi route theo position', () => {
    const positionRoutes = ROUTES.filter((route) => route.positionBound);

    const table = positionRoutes.map((route) => [route.name, route] as const);
    it.each(table)('%s -> 403, không lộ dữ liệu', async (_name, route) => {
      const res = await withAuth(route.send(agent(), fixture), tokens['GV-lớp-khác']);

      expect(res.status).toBe(403);
      const body = JSON.stringify(res.body);
      for (const id of [fixture.positionId, ...fixture.itemIds, ...fixture.slotIds, ...fixture.logIds]) {
        expect(body).not.toContain(id);
      }
      expect(body).not.toContain('Bài ');
    });
  });

  describe('IDOR qua id con: GVBM-khác dùng position của mình với id con của Toán lớp A -> 404', () => {
    const vanUrl = (suffix: string) => `/positions/${vanPositionId}${suffix}`;
    const cases: Array<[string, (f: Fixture) => request.Test]> = [
      [
        'PATCH timetable-slots/:slotId',
        (f) => agent().patch(vanUrl(`/timetable-slots/${f.slotIds[0]}`)).send({ period: 2 }),
      ],
      ['DELETE timetable-slots/:slotId', (f) => agent().delete(vanUrl(`/timetable-slots/${f.slotIds[0]}`))],
      ['PATCH ppct/:itemId', (f) => agent().patch(vanUrl(`/ppct/${f.itemIds[0]}`)).send({ title: 'Bị sửa' })],
      ['DELETE ppct/:itemId', (f) => agent().delete(vanUrl(`/ppct/${f.itemIds[0]}`))],
      ['PATCH lesson-logs/:id', (f) => agent().patch(vanUrl(`/lesson-logs/${f.logIds[0]}`)).send({ done: true })],
    ];

    it.each(cases)('%s', async (_name, build) => {
      const before = await snapshot();

      const res = await withAuth(build(fixture), tokens['GVBM-khác']);

      expect(res.status).toBe(404);
      expect(await snapshot()).toEqual(before);
    });
  });
});
