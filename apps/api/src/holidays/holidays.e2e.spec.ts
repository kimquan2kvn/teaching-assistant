import request from 'supertest';
import { Types } from 'mongoose';
import { formatDateOnly } from '../common/utils/date';
import { LessonLogEngineService } from '../lesson-logs/lesson-log-engine.service';
import { SchoolConfigController } from '../school-config/school-config.controller';
import { HolidaysController } from './holidays.controller';
import { HolidaysService } from './holidays.service';
import { Phase3App, createPhase3App } from '../../test/phase3-test-app';
import { d, seedPpct, seedSchoolYear, seedSlots, seedSubjectPosition } from '../../test/phase3-fixtures';

const MON_THU = [
  { dayOfWeek: 2, period: 1 }, // Thứ Hai tiết 1 (2026-01-05 là Thứ Hai)
  { dayOfWeek: 5, period: 3 }, // Thứ Năm tiết 3
];
const END_BEFORE_START = 'Ngày kết thúc không được trước ngày bắt đầu';
const YEAR_NOT_FOUND = 'Không tìm thấy năm học';
const HOLIDAY_NOT_FOUND = 'Không tìm thấy ngày nghỉ';
const BAD_DATE = 'Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd';
const INITIAL_DATES = ['2026-01-05', '2026-01-08', '2026-01-12', '2026-01-15', '2026-01-19'];

describe('Holidays (e2e)', () => {
  let ctx: Phase3App;
  let engine: LessonLogEngineService;
  let adminToken: string;
  let teacherToken: string;
  let studentToken: string;

  beforeAll(async () => {
    ctx = await createPhase3App({
      dbName: 'holidays_e2e',
      controllers: [HolidaysController, SchoolConfigController],
      providers: [HolidaysService, LessonLogEngineService],
    });
    engine = ctx.app.get(LessonLogEngineService);
    adminToken = (await ctx.register('admin.holidays', 'ADMIN')).token;
    teacherToken = (await ctx.register('teacher.holidays')).token;
    studentToken = (await ctx.register('student.holidays', 'STUDENT')).token;
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    ctx.clock.set('2026-01-04T03:00:00Z');
    const { models } = ctx;
    await models.holiday.deleteMany({});
    await models.timetableSlot.deleteMany({});
    await models.ppctItem.deleteMany({});
    await models.lessonLog.deleteMany({});
    await models.position.deleteMany({});
    await models.klass.deleteMany({});
    await models.schoolYear.deleteMany({ name: { $ne: '2025-2026' } });
    await models.schoolConfig.updateOne({}, { saturdayIsSchoolDay: false });
  });

  const api = () => request(ctx.app.getHttpServer());
  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);

  function createHoliday(body: Record<string, unknown>) {
    return asAdmin(api().post('/holidays')).send({
      schoolYearId: ctx.schoolYearId,
      type: 'LE',
      name: 'Nghỉ lễ',
      startDate: '2026-01-08',
      endDate: '2026-01-08',
      ...body,
    });
  }

  // 5 mục PPCT, Thứ Hai + Thứ Năm, đã xếp lần đầu: 01-05, 01-08, 01-12, 01-15, 01-19.
  async function arrangePpct(schoolYearId = ctx.schoolYearId) {
    const { positionId } = await seedSubjectPosition(ctx.models, { schoolYearId, className: '11A4', subject: 'Toán' });
    await seedSlots(ctx.models, positionId, MON_THU);
    const itemIds = await seedPpct(ctx.models, positionId, 5);
    await engine.recalculate(positionId, d('2025-09-05'));
    return { positionId, itemIds };
  }

  async function datesOf(itemIds: string[]): Promise<Array<string | null>> {
    const logs = await ctx.models.lessonLog.find({ ppctItemId: { $in: itemIds } });
    const byItem = new Map(logs.map((log) => [String(log.ppctItemId), formatDateOnly(log.date)]));
    return itemIds.map((id) => byItem.get(id) ?? null);
  }

  describe('CRUD + validation', () => {
    it('ADMIN tạo ngày nghỉ (201) và danh sách trả về sắp theo startDate', async () => {
      const created = await createHoliday({ startDate: '2026-01-20', endDate: '2026-01-21', name: 'Nghỉ B' });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ type: 'LE', name: 'Nghỉ B', schoolYearId: ctx.schoolYearId });
      await createHoliday({ startDate: '2026-01-08', endDate: '2026-01-08', name: 'Nghỉ A' });

      const list = await asAdmin(api().get(`/school-years/${ctx.schoolYearId}/holidays`));
      expect(list.status).toBe(200);
      expect(list.body.map((h: { name: string }) => h.name)).toEqual(['Nghỉ A', 'Nghỉ B']);
      expect(list.body[0].startDate).toBe('2026-01-08T00:00:00.000Z');
    });

    it('endDate < startDate -> 400 kèm thông báo tiếng Việt, không lưu gì', async () => {
      const res = await createHoliday({ startDate: '2026-01-10', endDate: '2026-01-09' });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain(END_BEFORE_START);
      expect(await ctx.models.holiday.countDocuments()).toBe(0);
    });

    it('ngày sai định dạng / loại không hợp lệ -> 400', async () => {
      expect((await createHoliday({ startDate: '2026-02-30', endDate: '2026-03-01' })).status).toBe(400);
      expect((await createHoliday({ type: 'NGHI_LUNG_TUNG' })).status).toBe(400);
    });

    it('schoolYearId không tồn tại hoặc không phải ObjectId -> 404 Không tìm thấy năm học', async () => {
      for (const schoolYearId of [new Types.ObjectId().toHexString(), 'khong-phai-objectid']) {
        const res = await createHoliday({ schoolYearId });
        expect(res.status).toBe(404);
        expect(res.body.message).toBe(YEAR_NOT_FOUND);
      }
      expect(await ctx.models.holiday.countDocuments()).toBe(0);
    });

    it('GET holidays / calendar-stats của năm học không tồn tại -> 404', async () => {
      for (const path of ['holidays', 'calendar-stats']) {
        for (const id of [new Types.ObjectId().toHexString(), 'khong-phai-objectid']) {
          const res = await asAdmin(api().get(`/school-years/${id}/${path}`));
          expect(res.status).toBe(404);
          expect(res.body.message).toBe(YEAR_NOT_FOUND);
        }
      }
    });

    it('PATCH chỉ gửi 1 ngày được so với giá trị đã lưu: endDate mới < startDate cũ -> 400', async () => {
      const created = await createHoliday({ startDate: '2026-01-08', endDate: '2026-01-10' });
      const endOnly = await asAdmin(api().patch(`/holidays/${created.body._id}`)).send({ endDate: '2026-01-07' });
      expect(endOnly.status).toBe(400);
      expect(endOnly.body.message).toBe(END_BEFORE_START);

      const startOnly = await asAdmin(api().patch(`/holidays/${created.body._id}`)).send({ startDate: '2026-01-11' });
      expect(startOnly.status).toBe(400);
      expect(startOnly.body.message).toBe(END_BEFORE_START);

      const stored = await ctx.models.holiday.findById(created.body._id);
      expect([formatDateOnly(stored!.startDate), formatDateOnly(stored!.endDate)]).toEqual(['2026-01-08', '2026-01-10']);
    });

    it('PATCH chỉ gửi 1 ngày hợp lệ -> cập nhật đúng ngày đó, giữ ngày kia', async () => {
      const created = await createHoliday({ startDate: '2026-01-08', endDate: '2026-01-10' });
      const res = await asAdmin(api().patch(`/holidays/${created.body._id}`)).send({ endDate: '2026-01-12', name: 'Đổi tên' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Đổi tên', startDate: '2026-01-08T00:00:00.000Z', endDate: '2026-01-12T00:00:00.000Z' });
    });

    it('PATCH / DELETE id lạ hoặc không phải ObjectId -> 404 Không tìm thấy ngày nghỉ', async () => {
      for (const id of [new Types.ObjectId().toHexString(), 'khong-phai-objectid']) {
        const patch = await asAdmin(api().patch(`/holidays/${id}`)).send({ name: 'X' });
        expect(patch.status).toBe(404);
        expect(patch.body.message).toBe(HOLIDAY_NOT_FOUND);
        const del = await asAdmin(api().delete(`/holidays/${id}`));
        expect(del.status).toBe(404);
        expect(del.body.message).toBe(HOLIDAY_NOT_FOUND);
      }
    });

    it('DELETE trả { deleted: true } và xóa thật', async () => {
      const created = await createHoliday({});
      const res = await asAdmin(api().delete(`/holidays/${created.body._id}`));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ deleted: true });
      expect(await ctx.models.holiday.countDocuments()).toBe(0);
    });
  });

  describe('phân quyền', () => {
    it('TEACHER xem được danh sách + thống kê nhưng KHÔNG ghi được (403, dữ liệu không đổi)', async () => {
      const created = await createHoliday({});
      const teacher = (req: request.Test) => req.set('Authorization', `Bearer ${teacherToken}`);

      expect((await teacher(api().get(`/school-years/${ctx.schoolYearId}/holidays`))).status).toBe(200);
      expect((await teacher(api().get(`/school-years/${ctx.schoolYearId}/calendar-stats`))).status).toBe(200);

      const body = { schoolYearId: ctx.schoolYearId, type: 'LE', name: 'X', startDate: '2026-02-01', endDate: '2026-02-01' };
      expect((await teacher(api().post('/holidays')).send(body)).status).toBe(403);
      expect((await teacher(api().patch(`/holidays/${created.body._id}`)).send({ name: 'Hack' })).status).toBe(403);
      expect((await teacher(api().delete(`/holidays/${created.body._id}`))).status).toBe(403);

      const stored = await ctx.models.holiday.find();
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe('Nghỉ lễ');
    });

    it('STUDENT bị 403 ở mọi route; không có token -> 401', async () => {
      const created = await createHoliday({});
      const student = (req: request.Test) => req.set('Authorization', `Bearer ${studentToken}`);

      expect((await student(api().get(`/school-years/${ctx.schoolYearId}/holidays`))).status).toBe(403);
      expect((await student(api().get(`/school-years/${ctx.schoolYearId}/calendar-stats`))).status).toBe(403);
      expect((await student(api().post('/holidays')).send({})).status).toBe(403);
      expect((await student(api().patch(`/holidays/${created.body._id}`)).send({ name: 'Hack' })).status).toBe(403);
      expect((await student(api().delete(`/holidays/${created.body._id}`))).status).toBe(403);

      expect((await api().get(`/school-years/${ctx.schoolYearId}/holidays`)).status).toBe(401);
      expect((await api().post('/holidays').send({})).status).toBe(401);
    });
  });

  describe('tính lại sổ báo giảng theo thao tác ghi', () => {
    it('POST -> PATCH -> DELETE ngày nghỉ làm lịch các buổi dời đúng rồi trở lại như cũ', async () => {
      const { itemIds } = await arrangePpct();
      expect(await datesOf(itemIds)).toEqual(INITIAL_DATES);

      const created = await createHoliday({ startDate: '2026-01-08', endDate: '2026-01-08' });
      expect(created.status).toBe(201);
      expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-12', '2026-01-15', '2026-01-19', '2026-01-22']);

      const moved = await asAdmin(api().patch(`/holidays/${created.body._id}`)).send({
        startDate: '2026-01-12',
        endDate: '2026-01-12',
      });
      expect(moved.status).toBe(200);
      expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-08', '2026-01-15', '2026-01-19', '2026-01-22']);

      const removed = await asAdmin(api().delete(`/holidays/${created.body._id}`));
      expect(removed.status).toBe(200);
      expect(await datesOf(itemIds)).toEqual(INITIAL_DATES);
    });

    it('ngày nghỉ rơi vào ô thứ 2 của bài nhiều tiết: bài đó lấy ô kế tiếp còn lại, các bài sau lùi đúng', async () => {
      const { positionId } = await seedSubjectPosition(ctx.models, {
        schoolYearId: ctx.schoolYearId,
        className: '11A4',
        subject: 'Toán',
      });
      await seedSlots(ctx.models, positionId, MON_THU);
      const itemIds = await seedPpct(ctx.models, positionId, 4);
      await ctx.models.ppctItem.updateOne({ _id: itemIds[1] }, { periodCount: 2 });
      await engine.recalculate(positionId, d('2025-09-05'));
      // Bài 2 chiếm 01-08 và 01-12.
      expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-08', '2026-01-15', '2026-01-19']);

      const created = await createHoliday({ startDate: '2026-01-12', endDate: '2026-01-12' });

      expect(created.status).toBe(201);
      expect(await datesOf(itemIds)).toEqual(['2026-01-05', '2026-01-08', '2026-01-19', '2026-01-22']);
    });

    it('ngày nghỉ của năm học này không làm đổi position của năm học khác', async () => {
      const other = await seedSchoolYear(ctx.models, { name: 'KHAC', start: '2026-01-01', end: '2026-06-30' });
      const mine = await arrangePpct();
      const theirs = await arrangePpct(other);
      expect(await datesOf(theirs.itemIds)).toEqual(INITIAL_DATES);

      const created = await createHoliday({ startDate: '2026-01-08', endDate: '2026-01-08' });
      expect(created.status).toBe(201);

      expect(await datesOf(mine.itemIds)).toEqual(['2026-01-05', '2026-01-12', '2026-01-15', '2026-01-19', '2026-01-22']);
      expect(await datesOf(theirs.itemIds)).toEqual(INITIAL_DATES);
    });

    it('ngày nghỉ rơi đúng ngày của log đã done thì log đó KHÔNG bị dời', async () => {
      const { itemIds } = await arrangePpct();
      await ctx.models.lessonLog.updateOne({ ppctItemId: itemIds[1] }, { done: true });

      const created = await createHoliday({ startDate: '2026-01-08', endDate: '2026-01-08' });
      expect(created.status).toBe(201);

      const dates = await datesOf(itemIds);
      expect(dates[0]).toBe('2026-01-05');
      expect(dates[1]).toBe('2026-01-08');
      // Log đã done chiếm ô tự do đầu tiên sau ngày nghỉ (01-12) nên các mục sau xếp từ 01-15.
      expect(dates.slice(2)).toEqual(['2026-01-15', '2026-01-19', '2026-01-22']);
    });

    it('tạo ngày nghỉ khi chưa có position nào có PPCT -> 201, không lỗi', async () => {
      const res = await createHoliday({});
      expect(res.status).toBe(201);
    });
  });

  describe('rollback', () => {
    let consoleError: jest.SpyInstance;

    beforeEach(() => {
      // MongoExceptionFilter log lỗi lạ ra console.error; ở đây lỗi 'boom' là chủ đích.
      consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      consoleError.mockRestore();
    });

    function failNextRecalculation() {
      return jest
        .spyOn(ctx.app.get(LessonLogEngineService), 'recalculateSchoolYear')
        .mockRejectedValueOnce(new Error('boom'));
    }

    it('POST: tính lại lỗi -> 500 và ngày nghỉ không được lưu', async () => {
      failNextRecalculation();
      const res = await createHoliday({});
      expect(res.status).toBe(500);
      expect(await ctx.models.holiday.countDocuments()).toBe(0);
    });

    it('PATCH: tính lại lỗi -> 500 và ngày nghỉ giữ nguyên giá trị cũ', async () => {
      const created = await createHoliday({ startDate: '2026-01-08', endDate: '2026-01-08' });
      failNextRecalculation();
      const res = await asAdmin(api().patch(`/holidays/${created.body._id}`)).send({
        startDate: '2026-01-12',
        endDate: '2026-01-12',
        name: 'Đổi',
      });
      expect(res.status).toBe(500);
      const stored = await ctx.models.holiday.findById(created.body._id);
      expect(stored).toMatchObject({ name: 'Nghỉ lễ' });
      expect(formatDateOnly(stored!.startDate)).toBe('2026-01-08');
    });

    it('DELETE: tính lại lỗi -> 500 và ngày nghỉ vẫn còn', async () => {
      const created = await createHoliday({});
      failNextRecalculation();
      const res = await asAdmin(api().delete(`/holidays/${created.body._id}`));
      expect(res.status).toBe(500);
      expect(await ctx.models.holiday.countDocuments()).toBe(1);
    });
  });

  describe('thẻ thống kê lịch năm học', () => {
    // 2026-01-05 (T2) .. 2026-01-18 (CN): 10 ngày T2-T6, 2 Thứ Bảy, 2 Chủ Nhật.
    async function arrangeStatsYear(): Promise<string> {
      return seedSchoolYear(ctx.models, { name: 'TEST-STATS', start: '2026-01-05', end: '2026-01-18' });
    }

    async function addStatsHolidays(schoolYearId: string) {
      await createHoliday({ schoolYearId, type: 'LE', name: 'Lễ', startDate: '2026-01-08', endDate: '2026-01-09' });
      await createHoliday({ schoolYearId, type: 'DOT_XUAT', name: 'Bão', startDate: '2026-01-12', endDate: '2026-01-13' });
    }

    it('đếm đúng tổng / lễ / đột xuất / ngày dạy còn lại tính từ asOf', async () => {
      const yearId = await arrangeStatsYear();
      await addStatsHolidays(yearId);

      const res = await asAdmin(api().get(`/school-years/${yearId}/calendar-stats?asOf=2026-01-05`));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ totalHolidayDays: 4, leHolidayDays: 2, dotXuatHolidayDays: 2, remainingTeachingDays: 6 });
    });

    // Bật/tắt cờ bằng đúng endpoint thật (không ghi thẳng model) để cả đường ghi của PATCH /school-config được kiểm.
    it('ADMIN bật saturdayIsSchoolDay qua PATCH /school-config thì Thứ Bảy được tính là ngày dạy, tắt lại thì trở về như cũ', async () => {
      const yearId = await arrangeStatsYear();
      await addStatsHolidays(yearId);
      const statsUrl = `/school-years/${yearId}/calendar-stats?asOf=2026-01-05`;
      const remainingTeachingDays = async () => (await asAdmin(api().get(statsUrl))).body.remainingTeachingDays;
      expect(await remainingTeachingDays()).toBe(6);

      const turnOn = await asAdmin(api().patch('/school-config')).send({ saturdayIsSchoolDay: true });
      expect(turnOn.status).toBe(200);
      expect(turnOn.body.saturdayIsSchoolDay).toBe(true);
      expect(await remainingTeachingDays()).toBe(8);

      const turnOff = await asAdmin(api().patch('/school-config')).send({ saturdayIsSchoolDay: false });
      expect(turnOff.status).toBe(200);
      expect(turnOff.body.saturdayIsSchoolDay).toBe(false);
      expect(await remainingTeachingDays()).toBe(6);
    });

    it('asOf sai định dạng hoặc ngày không có thật -> 400', async () => {
      const yearId = await arrangeStatsYear();
      for (const asOf of ['2026-02-30', '19/01/2026', '']) {
        const res = await asAdmin(api().get(`/school-years/${yearId}/calendar-stats?asOf=${asOf}`));
        expect(res.status).toBe(400);
        expect(res.body.message).toBe(BAD_DATE);
      }
    });

    it('năm học chưa có ngày nghỉ -> các số ngày nghỉ bằng 0, ngày dạy còn lại vẫn tính', async () => {
      const yearId = await arrangeStatsYear();
      const res = await asAdmin(api().get(`/school-years/${yearId}/calendar-stats?asOf=2026-01-05`));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ totalHolidayDays: 0, leHolidayDays: 0, dotXuatHolidayDays: 0, remainingTeachingDays: 10 });
    });

    it('không truyền asOf: dùng "hôm nay" theo giờ Việt Nam (UTC 18:00 CN đã là Thứ Hai VN)', async () => {
      const yearId = await arrangeStatsYear();
      await addStatsHolidays(yearId);
      ctx.clock.set('2026-01-11T18:00:00Z'); // 2026-01-12 01:00 giờ VN

      const res = await asAdmin(api().get(`/school-years/${yearId}/calendar-stats`));
      expect(res.status).toBe(200);
      // Còn 01-14, 01-15, 01-16 (01-12, 01-13 nghỉ; Thứ Bảy tắt; Chủ Nhật không tính).
      expect(res.body.remainingTeachingDays).toBe(3);
    });
  });
});
