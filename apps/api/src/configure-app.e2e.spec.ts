import request from 'supertest';
import { LessonLogEngineService } from './lesson-logs/lesson-log-engine.service';
import { PpctController } from './ppct/ppct.controller';
import { PpctService } from './ppct/ppct.service';
import { Phase3App, Phase3Session, createPhase3App } from '../test/phase3-test-app';
import { seedSubjectPosition } from '../test/phase3-fixtures';

const KB = 1024;
const MB = 1024 * KB;
const TOO_LARGE_MESSAGE = 'Dữ liệu gửi lên quá lớn, vui lòng giảm bớt rồi thử lại';
// configureApp đọc CORS_ORIGINS, mặc định http://localhost:3000.
const WEB_ORIGIN = process.env.CORS_ORIGINS?.split(',')[0] ?? 'http://localhost:3000';

// createPhase3App dựng app qua đúng configureApp mà main.ts dùng, nên các test dưới đây kiểm cấu hình production.
describe('configureApp: giới hạn kích thước body (e2e)', () => {
  let ctx: Phase3App;
  let teacher: Phase3Session;
  let consoleError: jest.SpyInstance;

  beforeAll(async () => {
    ctx = await createPhase3App({
      dbName: 'configure_app_e2e',
      controllers: [PpctController],
      providers: [PpctService, LessonLogEngineService],
    });
    teacher = await ctx.register('gvbm.body-limit');
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    // Body quá lớn là lỗi của client, không được log như lỗi máy chủ (MongoExceptionFilter chỉ console.error ở nhánh 500).
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { models } = ctx;
    await models.ppctItem.deleteMany({});
    await models.lessonLog.deleteMany({});
    await models.position.deleteMany({});
    await models.klass.deleteMany({});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  const api = () => request(ctx.app.getHttpServer());
  const asTeacher = (req: request.Test) => req.set('Authorization', `Bearer ${teacher.token}`);

  function seedPosition() {
    return seedSubjectPosition(ctx.models, {
      schoolYearId: ctx.schoolYearId,
      className: '11A4',
      subject: 'Toán',
      holderId: teacher.userId,
    });
  }

  // 150 dòng × requirement 1000 ký tự ≈ 165kb: hợp lệ theo schema nhưng vượt giới hạn mặc định 100kb.
  const largeValidRows = () =>
    Array.from({ length: 150 }, (_, i) => ({
      week: (i % 60) + 1,
      periodLabel: String(i + 1),
      title: `Bài ${i + 1}`,
      periodCount: 1,
      requirement: 'a'.repeat(1000),
    }));

  describe('mọi route khác giữ giới hạn mặc định 100kb', () => {
    it('body JSON vượt 100kb -> 413 tiếng Việt thân thiện, không lộ chi tiết kỹ thuật, không log như lỗi máy chủ', async () => {
      const res = await api().post('/auth/login').send({ username: 'x', password: 'a'.repeat(150 * KB) });

      expect(res.status).toBe(413);
      expect(res.body).toEqual({ statusCode: 413, error: 'Payload Too Large', message: TOO_LARGE_MESSAGE });
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('body JSON ngay dưới 100kb vẫn được parse và tới handler (sai tài khoản -> 401, không phải 413)', async () => {
      const res = await api().post('/auth/login').send({ username: 'khong.ton.tai', password: 'a'.repeat(90 * KB) });

      expect(res.status).toBe(401);
    });

    it('body form-urlencoded vẫn được parse như parser mặc định của Nest; vượt 100kb -> 413', async () => {
      const parsed = await api().post('/auth/login').type('form').send({ username: 'khong.ton.tai', password: 'MatKhau123' });
      expect(parsed.status).toBe(401);

      const tooLarge = await api().post('/auth/login').type('form').send({ username: 'x', password: 'a'.repeat(150 * KB) });
      expect(tooLarge.status).toBe(413);
      expect(tooLarge.body.message).toBe(TOO_LARGE_MESSAGE);
    });

    it('route cùng controller với import commit (POST /positions/:positionId/ppct) vẫn chỉ nhận tối đa 100kb', async () => {
      const { positionId } = await seedPosition();

      const res = await asTeacher(api().post(`/positions/${positionId}/ppct`)).send({
        week: 1,
        periodLabel: '1',
        title: 'Bài 1',
        periodCount: 1,
        requirement: 'a'.repeat(150 * KB),
      });

      expect(res.status).toBe(413);
      expect(res.body.message).toBe(TOO_LARGE_MESSAGE);
      expect(await ctx.models.ppctItem.countDocuments()).toBe(0);
    });

    it('phản hồi 413 vẫn có header CORS của web app để trình duyệt đọc được thông báo lỗi', async () => {
      const res = await api()
        .post('/auth/login')
        .set('Origin', WEB_ORIGIN)
        .send({ username: 'x', password: 'a'.repeat(150 * KB) });

      expect(res.status).toBe(413);
      expect(res.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    });
  });

  describe('POST /positions/:positionId/ppct/import/commit được nâng giới hạn riêng', () => {
    it.each<[string, (positionId: string) => string]>([
      ['đường dẫn chuẩn', (id) => `/positions/${id}/ppct/import/commit`],
      ['có dấu / ở cuối', (id) => `/positions/${id}/ppct/import/commit/`],
      ['có query string', (id) => `/positions/${id}/ppct/import/commit?lan=1`],
      ['viết hoa/thường khác (express không phân biệt)', (id) => `/Positions/${id}/PPCT/Import/Commit`],
    ])('body hợp lệ ~165kb (vượt 100kb mặc định) -> 201, lưu đủ các dòng (%s)', async (_label, buildUrl) => {
      const { positionId } = await seedPosition();

      const res = await asTeacher(api().post(buildUrl(positionId))).send({ rows: largeValidRows() });

      expect(res.status).toBe(201);
      expect(await ctx.models.ppctItem.countDocuments({ positionId })).toBe(150);
    });

    it('body vượt giới hạn riêng của route (hơn 3MB) -> 413 tiếng Việt thân thiện, không lưu mục nào', async () => {
      const { positionId } = await seedPosition();
      const rows = [{ ...largeValidRows()[0], requirement: 'a'.repeat(3 * MB + KB) }];

      const res = await asTeacher(api().post(`/positions/${positionId}/ppct/import/commit`)).send({ rows });

      expect(res.status).toBe(413);
      expect(res.body).toEqual({ statusCode: 413, error: 'Payload Too Large', message: TOO_LARGE_MESSAGE });
      expect(await ctx.models.ppctItem.countDocuments()).toBe(0);
      expect(consoleError).not.toHaveBeenCalled();
    });
  });
});
