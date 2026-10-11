import request from 'supertest';
import { LessonLogEngineService } from './lesson-log-engine.service';
import { LessonLogsController } from './lesson-logs.controller';
import { LessonLogsService } from './lesson-logs.service';
import { TeacherLessonLogsController } from './teacher-lesson-logs.controller';
import { TimetableMeController, TimetableSlotsController } from '../timetable-slots/timetable-slots.controller';
import { TimetableSlotsService } from '../timetable-slots/timetable-slots.service';
import { Phase3App, Phase3Session, createPhase3App } from '../../test/phase3-test-app';
import { d, seedPpct, seedSlots, seedSubjectPosition } from '../../test/phase3-fixtures';

const INVALID_DATE = 'Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd';
const WEEK_LOGS_URL = '/lesson-logs/week';
const WEEK_GRID_URL = '/timetable/me';
// Thứ Hai (tiết 1) + Thứ Năm (tiết 3) từ 2026-01-05, 5 mục: log ở 01-05, 01-08, 01-12, 01-15, 01-19.
const MON_THU_SLOTS = [
  { dayOfWeek: 2, period: 1 },
  { dayOfWeek: 5, period: 3 },
];

interface WeekLogBody {
  _id: string;
  positionId: string;
  date: string;
  ppctItem: { order: number };
  position: { _id: string; classId: string; className: string; subject: string };
}

describe('Teacher week views (e2e)', () => {
  let ctx: Phase3App;
  let engine: LessonLogEngineService;
  let teacherX: Phase3Session;
  let teacherY: Phase3Session;
  let teacherNoPosition: Phase3Session;
  let admin: Phase3Session;
  let student: Phase3Session;
  let gvcnCounter = 0;

  beforeAll(async () => {
    ctx = await createPhase3App({
      dbName: 'teacher_week_views_e2e',
      // Đăng ký cả controller theo-position để chứng minh route tuần không bị `positions/:positionId/...` chặn/nuốt.
      controllers: [LessonLogsController, TeacherLessonLogsController, TimetableSlotsController, TimetableMeController],
      providers: [LessonLogsService, TimetableSlotsService, LessonLogEngineService],
    });
    engine = ctx.app.get(LessonLogEngineService);
    teacherX = await ctx.register('gvbm.week.x');
    teacherY = await ctx.register('gvbm.week.y');
    teacherNoPosition = await ctx.register('gv.week.trong');
    admin = await ctx.register('admin.week', 'ADMIN');
    student = await ctx.register('hocsinh.week', 'STUDENT');
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
  const as = (session: Phase3Session, req: request.Test) => req.set('Authorization', `Bearer ${session.token}`);
  const getWeekLogs = (session: Phase3Session, weekStart?: string) =>
    as(session, api().get(WEEK_LOGS_URL).query(weekStart === undefined ? {} : { weekStart }));
  const getWeekGrid = (session: Phase3Session, weekStart?: string) =>
    as(session, api().get(WEEK_GRID_URL).query(weekStart === undefined ? {} : { weekStart }));

  // Seed position + TKB + PPCT rồi xếp log từ đầu năm học.
  async function seedSubject(args: {
    holder: Phase3Session | null;
    className: string;
    subject: string;
    slots?: Array<{ dayOfWeek: number; period: number; from?: string; to?: string | null }>;
    ppctCount?: number;
  }) {
    const { positionId, classId } = await seedSubjectPosition(ctx.models, {
      schoolYearId: ctx.schoolYearId,
      className: args.className,
      subject: args.subject,
      holderId: args.holder?.userId,
    });
    const slotIds = args.slots ? await seedSlots(ctx.models, positionId, args.slots) : [];
    const itemIds = args.ppctCount ? await seedPpct(ctx.models, positionId, args.ppctCount) : [];
    await engine.recalculate(positionId, d('2025-09-05'));
    return { positionId, classId, slotIds, itemIds };
  }

  // X: Toán 11A1 (Thứ Hai tiết 1 + Thứ Năm tiết 3, 5 mục) + Văn 11A2 (Thứ Ba tiết 2, 3 mục: 01-06, 01-13, 01-20).
  // Y: Toán 11A3 cùng TKB như Toán 11A1 — dữ liệu "của người khác" không được lọt vào kết quả của X.
  async function seedScenario() {
    const toanX = await seedSubject({
      holder: teacherX,
      className: '11A1',
      subject: 'Toán',
      slots: MON_THU_SLOTS,
      ppctCount: 5,
    });
    const vanX = await seedSubject({
      holder: teacherX,
      className: '11A2',
      subject: 'Văn',
      slots: [{ dayOfWeek: 3, period: 2 }],
      ppctCount: 3,
    });
    const toanY = await seedSubject({
      holder: teacherY,
      className: '11A3',
      subject: 'Toán',
      slots: MON_THU_SLOTS,
      ppctCount: 5,
    });
    return { toanX, vanX, toanY };
  }

  const summarize = (logs: WeekLogBody[]) =>
    logs.map((log) => [log.date.slice(0, 10), log.position.className, log.position.subject, log.ppctItem.order]);

  const WEEK_OF_12_JAN = [
    ['2026-01-12', '11A1', 'Toán', 3],
    ['2026-01-13', '11A2', 'Văn', 2],
    ['2026-01-15', '11A1', 'Toán', 4],
  ];
  const WEEK_OF_05_JAN = [
    ['2026-01-05', '11A1', 'Toán', 1],
    ['2026-01-06', '11A2', 'Văn', 1],
    ['2026-01-08', '11A1', 'Toán', 2],
  ];

  describe('GET /lesson-logs/week', () => {
    it('chỉ trả log của position GVBM đang giữ trong tuần, kèm position.className/subject, sắp theo ngày', async () => {
      const { toanX, vanX, toanY } = await seedScenario();

      const res = await getWeekLogs(teacherX, '2026-01-12');

      expect(res.status).toBe(200);
      expect(summarize(res.body)).toEqual(WEEK_OF_12_JAN);
      const positionIds = new Set(res.body.map((log: WeekLogBody) => log.positionId));
      expect(positionIds).toEqual(new Set([toanX.positionId, vanX.positionId]));
      expect(positionIds.has(toanY.positionId)).toBe(false);
      expect(res.body[0]).toMatchObject({
        positionId: toanX.positionId,
        ppctItemId: toanX.itemIds[2],
        date: '2026-01-12T00:00:00.000Z',
        done: false,
        isManuallyAdjusted: false,
        ppctItem: { order: 3, week: 3, periodLabel: '3', title: 'Bài 3', periodCount: 1, requirement: '' },
        position: { _id: toanX.positionId, classId: toanX.classId, className: '11A1', subject: 'Toán' },
      });
      expect(typeof res.body[0]._id).toBe('string');
    });

    it('giáo viên Y chỉ thấy position của mình (không lẫn dữ liệu của X)', async () => {
      const { toanY } = await seedScenario();

      const res = await getWeekLogs(teacherY, '2026-01-12');

      expect(res.status).toBe(200);
      expect(summarize(res.body)).toEqual([
        ['2026-01-12', '11A3', 'Toán', 3],
        ['2026-01-15', '11A3', 'Toán', 4],
      ]);
      expect(res.body.every((log: WeekLogBody) => log.positionId === toanY.positionId)).toBe(true);
    });

    it('weekStart là Thứ Tư hoặc Chủ Nhật được chuẩn hóa về Thứ Hai của tuần đó', async () => {
      await seedScenario();

      const monday = await getWeekLogs(teacherX, '2026-01-12');
      const wednesday = await getWeekLogs(teacherX, '2026-01-14');
      const sunday = await getWeekLogs(teacherX, '2026-01-18');
      const nextMonday = await getWeekLogs(teacherX, '2026-01-19');

      expect(wednesday.status).toBe(200);
      expect(wednesday.body).toEqual(monday.body);
      expect(sunday.body).toEqual(monday.body);
      // Tuần kế tiếp thật sự khác (không bị kéo lùi về tuần trước).
      expect(summarize(nextMonday.body)).toEqual([
        ['2026-01-19', '11A1', 'Toán', 5],
        ['2026-01-20', '11A2', 'Văn', 3],
      ]);
    });

    it('log đúng ngày đầu/cuối tuần đều có mặt, log ngoài tuần thì không', async () => {
      const { toanX } = await seedScenario();
      // 01-18 là Chủ Nhật (cuối tuần), 01-11 là Chủ Nhật tuần trước: ghi thẳng DB để kiểm biên [weekStart, weekEnd].
      await ctx.models.lessonLog.updateOne({ ppctItemId: toanX.itemIds[2] }, { date: d('2026-01-18') });
      await ctx.models.lessonLog.updateOne({ ppctItemId: toanX.itemIds[1] }, { date: d('2026-01-11') });

      const res = await getWeekLogs(teacherX, '2026-01-12');

      expect(summarize(res.body)).toEqual([
        ['2026-01-13', '11A2', 'Văn', 2],
        ['2026-01-15', '11A1', 'Toán', 4],
        ['2026-01-18', '11A1', 'Toán', 3],
      ]);
    });

    it('cùng ngày thì sắp theo order của mục PPCT', async () => {
      await seedScenario();
      // Thứ Hai tiết 2 của Sử 11A4: ngày 01-12 có Toán mục 3 (order 3) và Sử mục 2 (order 2).
      await seedSubject({
        holder: teacherX,
        className: '11A4',
        subject: 'Sử',
        slots: [{ dayOfWeek: 2, period: 2 }],
        ppctCount: 3,
      });

      const res = await getWeekLogs(teacherX, '2026-01-12');

      expect(summarize(res.body).slice(0, 2)).toEqual([
        ['2026-01-12', '11A4', 'Sử', 2],
        ['2026-01-12', '11A1', 'Toán', 3],
      ]);
    });

    it('GVCN chỉ giữ HOMEROOM nhận 200 với mảng rỗng, không thấy log của GVBM trong lớp mình', async () => {
      gvcnCounter += 1;
      const gvcn = await ctx.createClass(`gvcn.week.${gvcnCounter}`, '11A9');
      const positionId = await ctx.joinSubject(gvcn.code, teacherX.token, 'Toán');
      await seedSlots(ctx.models, positionId, MON_THU_SLOTS);
      await seedPpct(ctx.models, positionId, 5);
      await engine.recalculate(positionId, d('2025-09-05'));

      const gvcnRes = await getWeekLogs(gvcn, '2026-01-12');
      const gvbmRes = await getWeekLogs(teacherX, '2026-01-12');

      expect(gvcnRes.status).toBe(200);
      expect(gvcnRes.body).toEqual([]);
      expect(summarize(gvbmRes.body)).toEqual([
        ['2026-01-12', '11A9', 'Toán', 3],
        ['2026-01-15', '11A9', 'Toán', 4],
      ]);
    });

    it('giáo viên chưa giữ vị trí nào, hoặc giữ vị trí chưa có TKB/PPCT: 200 với mảng rỗng', async () => {
      const none = await getWeekLogs(teacherNoPosition, '2026-01-12');
      expect(none.status).toBe(200);
      expect(none.body).toEqual([]);

      await seedSubject({ holder: teacherNoPosition, className: '11A5', subject: 'Toán' });
      const empty = await getWeekLogs(teacherNoPosition, '2026-01-12');
      expect(empty.status).toBe(200);
      expect(empty.body).toEqual([]);
    });

    it('không truyền weekStart: dùng tuần hiện tại theo giờ VN (Thứ Hai 01:00 VN vẫn là UTC Chủ Nhật không lùi tuần)', async () => {
      await seedScenario();

      ctx.clock.set('2026-01-11T18:00:00Z'); // Thứ Hai 2026-01-12 01:00 giờ VN
      const mondayEarly = await getWeekLogs(teacherX);
      ctx.clock.set('2026-01-11T16:00:00Z'); // Chủ Nhật 2026-01-11 23:00 giờ VN
      const sundayLate = await getWeekLogs(teacherX);

      expect(mondayEarly.status).toBe(200);
      expect(summarize(mondayEarly.body)).toEqual(WEEK_OF_12_JAN);
      expect(summarize(sundayLate.body)).toEqual([
        ['2026-01-05', '11A1', 'Toán', 1],
        ['2026-01-06', '11A2', 'Văn', 1],
        ['2026-01-08', '11A1', 'Toán', 2],
      ]);
    });

    it.each(['2026-02-30', '12/01/2026', 'abc'])('weekStart không hợp lệ (%s) -> 400 tiếng Việt', async (weekStart) => {
      const res = await getWeekLogs(teacherX, weekStart);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(INVALID_DATE);
    });

    it('gom query theo positionId (không N+1): mỗi collection chỉ query 1 lần dù giữ nhiều position', async () => {
      await seedScenario();
      const positionFind = jest.spyOn(ctx.models.position, 'find');
      const classFind = jest.spyOn(ctx.models.klass, 'find');
      const logFind = jest.spyOn(ctx.models.lessonLog, 'find');
      const itemFind = jest.spyOn(ctx.models.ppctItem, 'find');

      const res = await getWeekLogs(teacherX, '2026-01-12');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      for (const spy of [positionFind, classFind, logFind, itemFind]) {
        expect(spy).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('GET /timetable/me', () => {
    it('trả weekStart/weekEnd dạng yyyy-mm-dd, slot kèm position và lessonLogs đúng tuần của giáo viên', async () => {
      const { toanX, vanX, toanY } = await seedScenario();

      const res = await getWeekGrid(teacherX, '2026-01-14');

      expect(res.status).toBe(200);
      expect(res.body.weekStart).toBe('2026-01-12');
      expect(res.body.weekEnd).toBe('2026-01-18');
      expect(summarize(res.body.lessonLogs)).toEqual(WEEK_OF_12_JAN);
      // slot sắp theo thứ trong tuần rồi tiết: Thứ Hai Toán, Thứ Ba Văn, Thứ Năm Toán.
      const slotSummary = res.body.slots.map((slot: { dayOfWeek: number; position: { subject: string } }) => [
        slot.dayOfWeek,
        slot.position.subject,
      ]);
      expect(slotSummary).toEqual([
        [2, 'Toán'],
        [3, 'Văn'],
        [5, 'Toán'],
      ]);
      expect(res.body.slots[0]).toMatchObject({
        positionId: toanX.positionId,
        dayOfWeek: 2,
        period: 1,
        effectiveFrom: '2026-01-05T00:00:00.000Z',
        effectiveTo: null,
        position: { _id: toanX.positionId, classId: toanX.classId, className: '11A1', subject: 'Toán' },
      });
      expect(typeof res.body.slots[0]._id).toBe('string');
      expect(res.body.slots[1].position).toEqual({
        _id: vanX.positionId,
        classId: vanX.classId,
        className: '11A2',
        subject: 'Văn',
      });
      const slotPositionIds = res.body.slots.map((slot: { positionId: string }) => slot.positionId);
      expect(slotPositionIds).not.toContain(toanY.positionId);
    });

    it('slot có hiệu lực giao với tuần: kết thúc trước tuần bị loại, bắt đầu giữa tuần vẫn có mặt, biên bao gồm', async () => {
      const { slotIds } = await seedSubject({
        holder: teacherX,
        className: '11A1',
        subject: 'Toán',
        slots: [
          { dayOfWeek: 2, period: 1, from: '2026-01-05' }, // đang hiệu lực, không kết thúc
          { dayOfWeek: 3, period: 1, from: '2025-12-01', to: '2026-01-11' }, // kết thúc đúng trước weekStart -> loại
          { dayOfWeek: 4, period: 1, from: '2025-12-01', to: '2026-01-12' }, // kết thúc đúng ngày weekStart -> có
          { dayOfWeek: 5, period: 1, from: '2026-01-15' }, // bắt đầu giữa tuần -> có
          { dayOfWeek: 6, period: 1, from: '2026-01-19' }, // bắt đầu ngay sau weekEnd -> loại
          { dayOfWeek: 7, period: 1, from: '2026-01-18' }, // bắt đầu đúng ngày weekEnd -> có
        ],
      });

      const res = await getWeekGrid(teacherX, '2026-01-12');

      expect(res.status).toBe(200);
      expect(res.body.slots.map((slot: { _id: string }) => slot._id)).toEqual([
        slotIds[0],
        slotIds[2],
        slotIds[3],
        slotIds[5],
      ]);
    });

    it('lessonLogs của lưới trùng với /lesson-logs/week cùng tuần', async () => {
      await seedScenario();

      const grid = await getWeekGrid(teacherX, '2026-01-05');
      const logs = await getWeekLogs(teacherX, '2026-01-05');

      expect(grid.body.lessonLogs).toEqual(logs.body);
      expect(summarize(grid.body.lessonLogs)).toEqual(WEEK_OF_05_JAN);
    });

    it('GVCN chỉ giữ HOMEROOM nhận 200 với slots/lessonLogs rỗng, không thấy slot của GVBM trong lớp mình', async () => {
      gvcnCounter += 1;
      const gvcn = await ctx.createClass(`gvcn.week.${gvcnCounter}`, '11A9');
      const positionId = await ctx.joinSubject(gvcn.code, teacherX.token, 'Toán');
      await seedSlots(ctx.models, positionId, MON_THU_SLOTS);
      await seedPpct(ctx.models, positionId, 5);
      await engine.recalculate(positionId, d('2025-09-05'));

      const gvcnRes = await getWeekGrid(gvcn, '2026-01-12');
      const gvbmRes = await getWeekGrid(teacherX, '2026-01-12');

      expect(gvcnRes.status).toBe(200);
      expect(gvcnRes.body).toEqual({ weekStart: '2026-01-12', weekEnd: '2026-01-18', slots: [], lessonLogs: [] });
      expect(gvbmRes.body.slots).toHaveLength(2);
      expect(gvbmRes.body.lessonLogs).toHaveLength(2);
    });

    it('giáo viên chưa giữ vị trí nào, hoặc giữ vị trí chưa có TKB/PPCT: 200 với mảng rỗng', async () => {
      const none = await getWeekGrid(teacherNoPosition, '2026-01-12');
      expect(none.status).toBe(200);
      expect(none.body).toEqual({ weekStart: '2026-01-12', weekEnd: '2026-01-18', slots: [], lessonLogs: [] });

      await seedSubject({ holder: teacherNoPosition, className: '11A5', subject: 'Toán' });
      const empty = await getWeekGrid(teacherNoPosition, '2026-01-12');
      expect(empty.status).toBe(200);
      expect(empty.body.slots).toEqual([]);
      expect(empty.body.lessonLogs).toEqual([]);
    });

    it('không truyền weekStart: Thứ Hai 01:00 giờ VN (UTC vẫn Chủ Nhật) ra tuần mới, không lùi tuần', async () => {
      await seedScenario();

      ctx.clock.set('2026-01-11T18:00:00Z');
      const mondayEarly = await getWeekGrid(teacherX);
      ctx.clock.set('2026-01-11T16:00:00Z');
      const sundayLate = await getWeekGrid(teacherX);

      expect(mondayEarly.status).toBe(200);
      expect(mondayEarly.body.weekStart).toBe('2026-01-12');
      expect(mondayEarly.body.weekEnd).toBe('2026-01-18');
      expect(summarize(mondayEarly.body.lessonLogs)).toEqual(WEEK_OF_12_JAN);
      expect(sundayLate.body.weekStart).toBe('2026-01-05');
      expect(sundayLate.body.weekEnd).toBe('2026-01-11');
    });

    it.each(['2026-02-30', '12/01/2026', 'abc'])('weekStart không hợp lệ (%s) -> 400 tiếng Việt', async (weekStart) => {
      const res = await getWeekGrid(teacherX, weekStart);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(INVALID_DATE);
    });

    it('gom query theo positionId (không N+1): mỗi collection chỉ query 1 lần dù giữ nhiều position', async () => {
      await seedScenario();
      const positionFind = jest.spyOn(ctx.models.position, 'find');
      const classFind = jest.spyOn(ctx.models.klass, 'find');
      const slotFind = jest.spyOn(ctx.models.timetableSlot, 'find');
      const logFind = jest.spyOn(ctx.models.lessonLog, 'find');
      const itemFind = jest.spyOn(ctx.models.ppctItem, 'find');

      const res = await getWeekGrid(teacherX, '2026-01-12');

      expect(res.status).toBe(200);
      expect(res.body.slots).toHaveLength(3);
      expect(res.body.lessonLogs).toHaveLength(3);
      for (const spy of [positionFind, classFind, slotFind, logFind, itemFind]) {
        expect(spy).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('phân quyền (chỉ TEACHER)', () => {
    it.each([
      ['GET /lesson-logs/week', WEEK_LOGS_URL],
      ['GET /timetable/me', WEEK_GRID_URL],
    ])('%s: ADMIN -> 403, STUDENT -> 403, chưa đăng nhập -> 401', async (_name, url) => {
      await seedScenario();

      expect((await as(admin, api().get(url).query({ weekStart: '2026-01-12' }))).status).toBe(403);
      expect((await as(student, api().get(url).query({ weekStart: '2026-01-12' }))).status).toBe(403);
      expect((await api().get(url).query({ weekStart: '2026-01-12' })).status).toBe(401);
    });
  });
});
