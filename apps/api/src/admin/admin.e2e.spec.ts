import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { Model } from 'mongoose';
import { User, UserSchema } from '../database/schemas/user.schema';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { JwtStrategy } from '../auth/jwt.strategy';
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
        MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
        JwtModule.register({}),
        PassportModule,
      ],
      controllers: [AuthController, AdminController],
      providers: [AuthService, JwtStrategy, Reflector],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    userModel = moduleRef.get(getModelToken(User.name));
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerAndPromote(username: string, role: 'TEACHER' | 'ADMIN') {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, password: 'MatKhau123', fullName: username });
    if (role === 'TEACHER') {
      return res.body.accessToken as string;
    }
    // Promoting after register changes the DB role, but the access token issued at register time
    // already has `role: 'TEACHER'` baked into its JWT payload — JWTs don't update retroactively.
    // Log in again so the returned token reflects the just-promoted role.
    await userModel.updateOne({ username }, { role: 'ADMIN' });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'MatKhau123' });
    return loginRes.body.accessToken as string;
  }

  it('TEACHER gọi GET /admin/teachers bị từ chối (403)', async () => {
    const token = await registerAndPromote('gv.thuong', 'TEACHER');
    await request(app.getHttpServer())
      .get('/admin/teachers')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('ADMIN gọi GET /admin/teachers thành công và khóa được tài khoản giáo viên', async () => {
    const teacherToken = await registerAndPromote('gv.bithoa', 'TEACHER');
    const adminToken = await registerAndPromote('admin.e2e', 'ADMIN');

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
    const teacherToken = await registerAndPromote('gv.active-validate', 'TEACHER');
    const adminToken = await registerAndPromote('admin.validate', 'ADMIN');
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
    const adminToken = await registerAndPromote('admin.notfound', 'ADMIN');
    await request(app.getHttpServer())
      .patch('/admin/teachers/64b1f9f9f9f9f9f9f9f9f9f9/active')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(404);
  });

  it('id không phải ObjectId hợp lệ trả về 400 thay vì 500', async () => {
    const adminToken = await registerAndPromote('admin.badid', 'ADMIN');
    await request(app.getHttpServer())
      .patch('/admin/teachers/khong-phai-object-id/active')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(400);
  });

  it('không khóa được một ADMIN khác qua endpoint "teachers" (lọc đúng role: TEACHER)', async () => {
    const adminToken = await registerAndPromote('admin.target-filter', 'ADMIN');
    const otherAdminToken = await registerAndPromote('admin.victim', 'ADMIN');
    const otherAdminMe = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${otherAdminToken}`);

    await request(app.getHttpServer())
      .patch(`/admin/teachers/${otherAdminMe.body.id}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(404);
  });
});
