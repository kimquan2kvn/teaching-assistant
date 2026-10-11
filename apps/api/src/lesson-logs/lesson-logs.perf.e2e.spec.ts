import { performance } from 'node:perf_hooks';
import request from 'supertest';
import { formatDateOnly } from '../common/utils/date';
import { HolidaysController } from '../holidays/holidays.controller';
import { HolidaysService } from '../holidays/holidays.service';
import { TimetableSlotsController } from '../timetable-slots/timetable-slots.controller';
import { TimetableSlotsService } from '../timetable-slots/timetable-slots.service';
import { LessonLogEngineService } from './lesson-log-engine.service';
import { LessonLogsController } from './lesson-logs.controller';
import { LessonLogsService } from './lesson-logs.service';
import { Phase3App, Phase3Session, createPhase3App } from '../../test/phase3-test-app';
import { d } from '../../test/phase3-fixtures';

// Ngưỡng của spec (yêu cầu phi chức năng): tính lại < 5 giây, mở sổ báo giảng cả học kỳ < 2 giây. Không được nới.
const RECALCULATE_LIMIT_MS = 5000;
const SEMESTER_READ_LIMIT_MS = 2000;
const SEEDING_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;

const CLASS_COUNT = 30;
const PPCT_PER_POSITION = 140;
// Thứ Hai tiết 1, Thứ Ba tiết 2, Thứ Năm tiết 3, Thứ Sáu tiết 4 (4 tiết/tuần), hiệu lực từ đầu tuần học đầu tiên.
const BASE_SLOTS = [
  { dayOfWeek: 2, period: 1 },
  { dayOfWeek: 3, period: 2 },
  { dayOfWeek: 5, period: 3 },
  { dayOfWeek: 6, period: 4 },
];
const TIMETABLE_START = '2025-09-08';
const HOLIDAY_START = '2026-01-12';
const HOLIDAY_END = '2026-01-18';

interface Timing {
  name: string;
  ms: number;
  limitMs: number;
}

describe('Lesson logs performance (e2e)', () => {
  let ctx: Phase3App;
  let engine: LessonLogEngineService;
  let teacher: Phase3Session;
  let admin: Phase3Session;
  let positionIds: string[];
  const timings: Timing[] = [];

  beforeAll(async () => {
    ctx = await createPhase3App({
      dbName: 'lesson_logs_perf_e2e',
      controllers: [HolidaysController, TimetableSlotsController, LessonLogsController],
      providers: [HolidaysService, TimetableSlotsService, LessonLogsService, LessonLogEngineService],
    });
    engine = ctx.app.get(LessonLogEngineService);
    teacher = await ctx.register('gvbm.perf');
    admin = await ctx.register('admin.perf', 'ADMIN');

    // Dựng thẳng vào DB (insertMany), không qua HTTP: 30 lớp, mỗi lớp 1 position SUBJECT cùng do 1 giáo viên giữ.
    const classes = await ctx.models.klass.insertMany(
      Array.from({ length: CLASS_COUNT }, (_, i) => ({
        code: `PERF${i + 1}-${String(i + 1).padStart(4, '0')}`,
        name: `Lớp perf ${i + 1}`,
        schoolYearId: ctx.schoolYearId,
      })),
    );
    const positions = await ctx.models.position.insertMany(
      classes.map((klass) => ({
        classId: klass._id,
        type: 'SUBJECT',
        subject: 'Toán',
        holderId: teacher.userId,
      })),
    );
    positionIds = positions.map((position) => String(position._id));

    await ctx.models.timetableSlot.insertMany(
      positionIds.flatMap((positionId) =>
        BASE_SLOTS.map((slot) => ({
          positionId,
          dayOfWeek: slot.dayOfWeek,
          period: slot.period,
          effectiveFrom: d(TIMETABLE_START),
          effectiveTo: null,
        })),
      ),
    );
    await ctx.models.ppctItem.insertMany(
      positionIds.flatMap((positionId) =>
        Array.from({ length: PPCT_PER_POSITION }, (_, i) => ({
          positionId,
          order: i + 1,
          week: Math.floor(i / BASE_SLOTS.length) + 1,
          periodLabel: String(i + 1),
          title: `Bài ${i + 1}`,
          periodCount: 1,
        })),
      ),
    );

    // Xếp lần đầu để mỗi position có đủ 140 log (khớp tiết thật chạy qua engine, không bơm log giả).
    for (const positionId of positionIds) {
      const { scheduled } = await engine.recalculate(positionId, d('2025-09-05'));
      if (scheduled !== PPCT_PER_POSITION) {
        throw new Error(`Dữ liệu perf sai: position ${positionId} chỉ xếp được ${scheduled}/${PPCT_PER_POSITION} mục`);
      }
    }
  }, SEEDING_TIMEOUT_MS);

  afterAll(async () => {
    if (timings.length > 0) {
      const report = timings.map((t) => `${t.name}: ${t.ms.toFixed(0)} ms (ngưỡng ${t.limitMs} ms)`).join(' | ');
      console.info(`[perf] ${report}`);
    }
    // Xóa cả database để 4200 mục PPCT + log không nằm lại trong mongod dùng chung với các spec khác.
    await ctx.models.lessonLog.db.dropDatabase();
    await ctx.close();
  });

  const api = () => request(ctx.app.getHttpServer());
  const as = (session: Phase3Session, req: request.Test) => req.set('Authorization', `Bearer ${session.token}`);

  async function measure(name: string, limitMs: number, run: () => Promise<request.Response>) {
    const startedAt = performance.now();
    const res = await run();
    const ms = performance.now() - startedAt;
    timings.push({ name, ms, limitMs });
    return { res, ms };
  }

  async function datesByItem(positionId: string): Promise<Map<string, string>> {
    const logs = await ctx.models.lessonLog.find({ positionId });
    return new Map(logs.map((log) => [String(log.ppctItemId), formatDateOnly(log.date)]));
  }

  it('dữ liệu lớn dựng đúng: 30 position × 140 mục PPCT, mỗi mục 1 log', async () => {
    expect(await ctx.models.position.countDocuments({ holderId: teacher.userId })).toBe(CLASS_COUNT);
    expect(await ctx.models.ppctItem.countDocuments({})).toBe(CLASS_COUNT * PPCT_PER_POSITION);
    expect(await ctx.models.lessonLog.countDocuments({})).toBe(CLASS_COUNT * PPCT_PER_POSITION);
  });

  it(
    `POST /holidays tính lại cả ${CLASS_COUNT} position trong 1 transaction dưới ${RECALCULATE_LIMIT_MS} ms`,
    async () => {
      const before = await datesByItem(positionIds[0]);

      const { res, ms } = await measure('POST /holidays (30 position)', RECALCULATE_LIMIT_MS, () =>
        as(
          admin,
          api().post('/holidays').send({
            schoolYearId: ctx.schoolYearId,
            type: 'DOT_XUAT',
            name: 'Nghỉ bão lũ',
            startDate: HOLIDAY_START,
            endDate: HOLIDAY_END,
          }),
        ),
      );

      expect(res.status).toBe(201);
      expect(ms).toBeLessThan(RECALCULATE_LIMIT_MS);

      // Kết quả đúng chứ không chỉ nhanh: không log nào rơi vào tuần nghỉ, mọi mục vẫn còn log (năm học còn đủ ô),
      // phần trước ngày nghỉ giữ nguyên, phần từ ngày nghỉ trở đi bị dồn lùi.
      expect(
        await ctx.models.lessonLog.countDocuments({ date: { $gte: d(HOLIDAY_START), $lte: d(HOLIDAY_END) } }),
      ).toBe(0);
      expect(await ctx.models.lessonLog.countDocuments({})).toBe(CLASS_COUNT * PPCT_PER_POSITION);

      const after = await datesByItem(positionIds[0]);
      const changed = [...before].filter(([itemId, date]) => after.get(itemId) !== date);
      expect(changed.length).toBeGreaterThan(0);
      expect(changed.every(([, date]) => date >= HOLIDAY_START)).toBe(true);
      expect([...before].filter(([, date]) => date < HOLIDAY_START).every(([id, date]) => after.get(id) === date)).toBe(
        true,
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    `POST /positions/:p/timetable-slots tính lại 1 position (toàn bộ ${PPCT_PER_POSITION} log) dưới ${RECALCULATE_LIMIT_MS} ms`,
    async () => {
      const positionId = positionIds[1];
      const before = await datesByItem(positionId);

      // Hiệu lực từ đầu TKB nên cả 140 log của position bị xếp lại (trường hợp nặng nhất của 1 position).
      const { res, ms } = await measure('POST timetable-slots (1 position)', RECALCULATE_LIMIT_MS, () =>
        as(
          teacher,
          api().post(`/positions/${positionId}/timetable-slots`).send({
            dayOfWeek: 4,
            period: 5,
            effectiveFrom: TIMETABLE_START,
            effectiveTo: null,
          }),
        ),
      );

      expect(res.status).toBe(201);
      expect(ms).toBeLessThan(RECALCULATE_LIMIT_MS);

      // Thêm tiết Thứ Tư → 5 tiết/tuần nên các mục dồn sớm hơn; vẫn đủ 140 log.
      const after = await datesByItem(positionId);
      expect(after.size).toBe(PPCT_PER_POSITION);
      expect([...before].some(([itemId, date]) => after.get(itemId) !== date)).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    `GET /positions/:p/lesson-logs cả học kỳ I dưới ${SEMESTER_READ_LIMIT_MS} ms`,
    async () => {
      const positionId = positionIds[0];

      const { res, ms } = await measure('GET lesson-logs (học kỳ I)', SEMESTER_READ_LIMIT_MS, () =>
        as(teacher, api().get(`/positions/${positionId}/lesson-logs?from=2025-09-05&to=2026-01-18`)),
      );

      expect(res.status).toBe(200);
      expect(ms).toBeLessThan(SEMESTER_READ_LIMIT_MS);

      const days = (res.body as Array<{ date: string }>).map((log) => log.date.slice(0, 10));
      expect(days.length).toBeGreaterThanOrEqual(60);
      expect(days).toEqual([...days].sort());
      expect(days[0] >= '2025-09-05').toBe(true);
      expect(days[days.length - 1] <= '2026-01-18').toBe(true);
    },
    TEST_TIMEOUT_MS,
  );
});
