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
import { ClassesController } from '../classes/classes.controller';
import { ClassesService } from '../classes/classes.service';
import { PositionsController } from '../positions/positions.controller';
import { PositionsService } from '../positions/positions.service';
import { AdminController } from './admin.controller';
import { buildTestMongoUri } from '../../test/build-test-mongo-uri';

interface TeacherListItem {
  id: string;
  username: string;
  fullName: string;
  isActive: boolean;
}

describe('Admin (e2e)', () => {
  let app: INestApplication;
  let userModel: Model<User>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(buildTestMongoUri('admin_e2e')),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: SchoolYear.name, schema: SchoolYearSchema },
          { name: Class.name, schema: ClassSchema },
          { name: Position.name, schema: PositionSchema },
        ]),
        JwtModule.register({}),
        PassportModule,
      ],
      controllers: [AuthController, ClassesController, PositionsController, AdminController],
      providers: [
        AuthService,
        JwtStrategy,
        SchoolYearsService,
        ClassesService,
        PositionsService,
        Reflector,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    userModel = moduleRef.get(getModelToken(User.name));

    const schoolYearModel = moduleRef.get(getModelToken(SchoolYear.name));
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
    // Promoting after register changes the DB role, but the access token issued at register time
    // already has `role: 'TEACHER'` baked into its JWT payload — JWTs don't update retroactively.
    // Log in again so the returned token reflects the just-promoted role.
    await userModel.updateOne({ username }, { role: 'ADMIN' });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'MatKhau123' });
    return { token: loginRes.body.accessToken as string, userId: loginRes.body.user.id as string };
  }

  it('TEACHER gọi GET /admin/teachers bị từ chối (403)', async () => {
    const { token } = await registerAndPromote('gv.thuong', 'TEACHER');
    await request(app.getHttpServer())
      .get('/admin/teachers')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('ADMIN gọi GET /admin/teachers thành công và khóa được tài khoản giáo viên', async () => {
    const { token: teacherToken } = await registerAndPromote('gv.bithoa', 'TEACHER');
    const { token: adminToken } = await registerAndPromote('admin.e2e', 'ADMIN');

    const listRes = await request(app.getHttpServer())
      .get('/admin/teachers')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    const target = (listRes.body as TeacherListItem[]).find((t) => t.username === 'gv.bithoa');
    expect(target).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/admin/teachers/${target!.id}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'gv.bithoa', password: 'MatKhau123' });
    expect(loginRes.status).toBe(401);
    void teacherToken;
  });

  it('body thiếu isActive hoặc sai kiểu bị từ chối (400), không âm thầm thành công', async () => {
    const { token: teacherToken } = await registerAndPromote('gv.active-validate', 'TEACHER');
    const { token: adminToken } = await registerAndPromote('admin.validate', 'ADMIN');
    const listRes = await request(app.getHttpServer())
      .get('/admin/teachers')
      .set('Authorization', `Bearer ${adminToken}`);
    const target = (listRes.body as TeacherListItem[]).find((t) => t.username === 'gv.active-validate');

    await request(app.getHttpServer())
      .patch(`/admin/teachers/${target!.id}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/admin/teachers/${target!.id}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: 'yes' })
      .expect(400);
    void teacherToken;
  });

  it('id không tồn tại trả về 404 thay vì "success: true" im lặng', async () => {
    const { token: adminToken } = await registerAndPromote('admin.notfound', 'ADMIN');
    await request(app.getHttpServer())
      .patch('/admin/teachers/64b1f9f9f9f9f9f9f9f9f9f9/active')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(404);
  });

  it('id không phải ObjectId hợp lệ trả về 400 thay vì 500', async () => {
    const { token: adminToken } = await registerAndPromote('admin.badid', 'ADMIN');
    await request(app.getHttpServer())
      .patch('/admin/teachers/khong-phai-object-id/active')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(400);
  });

  it('không khóa được một ADMIN khác qua endpoint "teachers" (lọc đúng role: TEACHER)', async () => {
    const { token: adminToken } = await registerAndPromote('admin.target-filter', 'ADMIN');
    const { token: otherAdminToken } = await registerAndPromote('admin.victim', 'ADMIN');
    const otherAdminMe = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${otherAdminToken}`);

    await request(app.getHttpServer())
      .patch(`/admin/teachers/${otherAdminMe.body.id}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(404);
  });

  describe('GET /admin/teachers/:id/positions', () => {
    it('ADMIN xem vị trí của 1 giáo viên đang giữ 2 vị trí → đúng 2 phần tử', async () => {
      const { token: teacherToken, userId: teacherId } = await registerAndPromote('gv.admin-xem-vitri', 'TEACHER');

      const classRes1 = await request(app.getHttpServer())
        .post('/classes')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ name: '10C1', claimHomeroom: true });
      const code1 = classRes1.body.class.code as string;

      const classRes2 = await request(app.getHttpServer())
        .post('/classes')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ name: '10C2', claimHomeroom: false });
      const code2 = classRes2.body.class.code as string;
      await request(app.getHttpServer())
        .post('/positions/join')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ code: code2, type: 'SUBJECT', subject: 'Lịch sử' })
        .expect(201);

      const { token: adminToken } = await registerAndPromote('admin.xem-vitri', 'ADMIN');

      const res = await request(app.getHttpServer())
        .get(`/admin/teachers/${teacherId}/positions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveLength(2);
      const positions = res.body as Array<{
        type: string;
        subject?: string;
        class: { code: string; name: string };
      }>;
      const byClassCode = Object.fromEntries(positions.map((p) => [p.class.code, p]));
      expect(byClassCode[code1]).toMatchObject({
        type: 'HOMEROOM',
        class: { code: code1, name: '10C1' },
      });
      expect(byClassCode[code2]).toMatchObject({
        type: 'SUBJECT',
        subject: 'Lịch sử',
        class: { code: code2, name: '10C2' },
      });
    });

    it('TEACHER gọi endpoint này (kể cả xem vị trí của chính mình qua route admin) → 403', async () => {
      const { token: teacherToken, userId: teacherId } = await registerAndPromote('gv.tu-xem-vitri', 'TEACHER');

      await request(app.getHttpServer())
        .get(`/admin/teachers/${teacherId}/positions`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(403);
    });

    it('id không phải ObjectId hợp lệ trả về 400 thay vì 500', async () => {
      const { token: adminToken } = await registerAndPromote('admin.badid-positions', 'ADMIN');

      await request(app.getHttpServer())
        .get('/admin/teachers/khong-phai-object-id/positions')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });
});
