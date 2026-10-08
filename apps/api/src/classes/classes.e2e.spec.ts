import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { Model } from 'mongoose';
import { User, UserSchema } from '../database/schemas/user.schema';
import { SchoolYear, SchoolYearSchema } from '../database/schemas/school-year.schema';
import { Class, ClassSchema } from '../database/schemas/class.schema';
import { Position, PositionSchema } from '../database/schemas/position.schema';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import { SchoolYearsService } from '../school-years/school-years.service';
import { PositionGuard } from '../common/guards/position.guard';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';
import { buildTestMongoUri } from '../../test/build-test-mongo-uri';

interface PositionView {
  type: 'HOMEROOM' | 'SUBJECT';
  subject?: string;
  holderId: string | null;
}

describe('Classes (e2e)', () => {
  let app: INestApplication;
  let classModel: Model<Class>;
  let schoolYearModel: Model<SchoolYear>;
  let userModel: Model<User>;
  let positionModel: Model<Position>;
  let classesService: ClassesService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(buildTestMongoUri('classes_e2e')),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: SchoolYear.name, schema: SchoolYearSchema },
          { name: Class.name, schema: ClassSchema },
          { name: Position.name, schema: PositionSchema },
        ]),
        JwtModule.register({}),
        PassportModule,
      ],
      controllers: [AuthController, ClassesController],
      providers: [AuthService, JwtStrategy, SchoolYearsService, ClassesService, Reflector, PositionGuard],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    classModel = moduleRef.get(getModelToken(Class.name));
    schoolYearModel = moduleRef.get(getModelToken(SchoolYear.name));
    userModel = moduleRef.get(getModelToken(User.name));
    positionModel = moduleRef.get(getModelToken(Position.name));
    classesService = moduleRef.get(ClassesService);

    await schoolYearModel.create({
      name: '2025-2026',
      isCurrent: true,
      startDate: new Date('2025-09-05'),
      endDate: new Date('2026-05-31'),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerAndPromote(username: string, role: 'TEACHER' | 'ADMIN') {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, password: 'MatKhau123', fullName: username });
    if (role === 'TEACHER') {
      return { token: res.body.accessToken as string, userId: res.body.user.id as string };
    }
    await userModel.updateOne({ username }, { role: 'ADMIN' });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'MatKhau123' });
    return { token: loginRes.body.accessToken as string, userId: loginRes.body.user.id as string };
  }

  async function registerStudent(username: string) {
    const argon2 = await import('argon2');
    await userModel.create({
      username,
      passwordHash: await argon2.hash('MatKhau123'),
      fullName: username,
      role: 'STUDENT',
    });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'MatKhau123' });
    return loginRes.body.accessToken as string;
  }

  it('STUDENT gọi POST /classes bị từ chối (403) — chưa có route tự đăng ký cho STUDENT ở Phase 1 nên tạo trực tiếp qua model', async () => {
    const token = await registerStudent('hs.tao-lop');
    await request(app.getHttpServer())
      .post('/classes')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '11A9', claimHomeroom: false })
      .expect(403);
  });

  it('tạo lớp sinh đúng mã dạng <tên>-<5 ký tự>, tạo đủ 1 HOMEROOM + 13 SUBJECT position, đều holderId=null trừ khi claimHomeroom', async () => {
    const { token, userId } = await registerAndPromote('gv.tao-lop', 'TEACHER');
    const res = await request(app.getHttpServer())
      .post('/classes')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '11A4', claimHomeroom: true })
      .expect(201);

    expect(res.body.class.code).toMatch(/^11A4-[A-Z0-9]{5}$/);
    const positions = res.body.positions as PositionView[];
    const homeroom = positions.find((p) => p.type === 'HOMEROOM');
    expect(homeroom?.holderId).toBe(userId);
    const subjectPositions = positions.filter((p) => p.type === 'SUBJECT');
    expect(subjectPositions).toHaveLength(13);
    subjectPositions.forEach((p) => expect(p.holderId).toBeNull());
  });

  it('tạo lớp với claimHomeroom=false thì HOMEROOM position vẫn được tạo nhưng holderId=null', async () => {
    const { token } = await registerAndPromote('gv.khong-nhan', 'TEACHER');
    const res = await request(app.getHttpServer())
      .post('/classes')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '11A5', claimHomeroom: false })
      .expect(201);

    const positions = res.body.positions as PositionView[];
    const homeroom = positions.find((p) => p.type === 'HOMEROOM');
    expect(homeroom).toBeDefined();
    expect(homeroom?.holderId).toBeNull();
  });

  it('GET /classes/:code trả về thông tin lớp + trạng thái từng vị trí (đã có người giữ hay chưa) cho giáo viên khác xem trước khi nhận', async () => {
    const { token } = await registerAndPromote('gv.tao-lop-2', 'TEACHER');
    const createRes = await request(app.getHttpServer())
      .post('/classes')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '11A6', claimHomeroom: true });
    const code = createRes.body.class.code as string;

    const { token: viewerToken } = await registerAndPromote('gv.xem-lop', 'TEACHER');
    const viewRes = await request(app.getHttpServer())
      .get(`/classes/${code}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);

    expect(viewRes.body.class.code).toBe(code);
    const positions = viewRes.body.positions as Array<{ type: string; taken: boolean }>;
    const homeroom = positions.find((p) => p.type === 'HOMEROOM');
    expect(homeroom?.taken).toBe(true);
    const subjectPositions = positions.filter((p) => p.type === 'SUBJECT');
    subjectPositions.forEach((p) => expect(p.taken).toBe(false));
    // Không được lộ holderId thật ra response public
    expect(positions.every((p) => !('holderId' in p))).toBe(true);
  });

  it('nếu request thiếu field bắt buộc thì bị chặn trước khi ghi DB, không để lại Class mồ côi', async () => {
    const { token } = await registerAndPromote('gv.rollback', 'TEACHER');
    const before = await classModel.countDocuments({});
    await request(app.getHttpServer())
      .post('/classes')
      .set('Authorization', `Bearer ${token}`)
      .send({ claimHomeroom: true })
      .expect(400);
    const after = await classModel.countDocuments({});
    expect(after).toBe(before);
  });

  it('nếu insertMany Position thất bại GIỮA transaction thì Class vừa tạo cũng bị rollback thật (không chỉ chặn ở tầng validate HTTP)', async () => {
    const { userId } = await registerAndPromote('gv.rollback-that', 'TEACHER');
    const classesBefore = await classModel.countDocuments({});
    const positionsBefore = await positionModel.countDocuments({});

    const spy = jest.spyOn(positionModel, 'insertMany').mockRejectedValueOnce(new Error('Lỗi giả lập giữa transaction'));

    await expect(
      classesService.create(userId, { name: 'RollbackThat', claimHomeroom: false }),
    ).rejects.toThrow('Lỗi giả lập giữa transaction');

    spy.mockRestore();

    const classesAfter = await classModel.countDocuments({});
    const positionsAfter = await positionModel.countDocuments({});
    expect(classesAfter).toBe(classesBefore);
    expect(positionsAfter).toBe(positionsBefore);
  });

  describe('GET /classes/:classId/detail', () => {
    it('giáo viên đang giữ 1 vị trí của lớp xem được chi tiết, thấy đúng tên người giữ từng vị trí (kể cả vị trí trống trả holder: null)', async () => {
      const { token: tokenA, userId: userIdA } = await registerAndPromote('gv.chitiet-a', 'TEACHER');
      const createRes = await request(app.getHttpServer())
        .post('/classes')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: '11B1', claimHomeroom: true });
      const classId = createRes.body.class._id as string;

      const { userId: userIdC } = await registerAndPromote('gv.chitiet-c', 'TEACHER');
      await positionModel.updateOne(
        { classId, type: 'SUBJECT', subject: 'Toán' },
        { holderId: userIdC },
      );

      const detailRes = await request(app.getHttpServer())
        .get(`/classes/${classId}/detail`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(detailRes.body.class).toEqual({
        id: classId,
        code: createRes.body.class.code,
        name: '11B1',
      });

      const positions = detailRes.body.positions as Array<{
        type: string;
        subject?: string;
        holder: { id: string; fullName: string } | null;
      }>;
      const homeroom = positions.find((p) => p.type === 'HOMEROOM');
      expect(homeroom?.holder).toEqual({ id: userIdA, fullName: 'gv.chitiet-a' });

      const toan = positions.find((p) => p.subject === 'Toán');
      expect(toan?.holder).toEqual({ id: userIdC, fullName: 'gv.chitiet-c' });

      const vacant = positions.find((p) => p.subject === 'Ngữ văn');
      expect(vacant?.holder).toBeNull();
    });

    it('giáo viên KHÔNG giữ vị trí nào của lớp đó bị từ chối (403)', async () => {
      const { token: tokenA } = await registerAndPromote('gv.chitiet-khac-a', 'TEACHER');
      const createRes = await request(app.getHttpServer())
        .post('/classes')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: '11B2', claimHomeroom: true });
      const classId = createRes.body.class._id as string;

      const { token: tokenOutsider } = await registerAndPromote('gv.chitiet-ngoai', 'TEACHER');
      await request(app.getHttpServer())
        .get(`/classes/${classId}/detail`)
        .set('Authorization', `Bearer ${tokenOutsider}`)
        .expect(403);
    });

    it('ADMIN luôn xem được chi tiết lớp dù không giữ vị trí nào', async () => {
      const { token: tokenA } = await registerAndPromote('gv.chitiet-admin-chu', 'TEACHER');
      const createRes = await request(app.getHttpServer())
        .post('/classes')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: '11B3', claimHomeroom: true });
      const classId = createRes.body.class._id as string;

      const { token: tokenAdmin } = await registerAndPromote('gv.chitiet-admin', 'ADMIN');
      await request(app.getHttpServer())
        .get(`/classes/${classId}/detail`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);
    });

    it('classId không tồn tại trả về 404 rõ ràng, không phải 500', async () => {
      const { token: tokenAdmin } = await registerAndPromote('gv.chitiet-404', 'ADMIN');
      const res = await request(app.getHttpServer())
        .get('/classes/000000000000000000000000/detail')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(404);
      // Khẳng định đúng message của NotFoundException trong findDetail — không chỉ trùng mã 404 với
      // handler mặc định của Nest khi route không khớp (2 trường hợp có cùng status nhưng khác message).
      expect(res.body.message).toBe('Không tìm thấy lớp');
    });
  });
});
