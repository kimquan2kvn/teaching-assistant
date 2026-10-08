import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import { User, UserSchema } from '../database/schemas/user.schema';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { buildTestMongoUri } from '../../test/build-test-mongo-uri';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(buildTestMongoUri('auth_e2e')),
        MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
        JwtModule.register({}),
        PassportModule,
      ],
      controllers: [AuthController],
      providers: [AuthService, JwtStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('đăng ký → đăng nhập → gọi /auth/me bằng access token → đổi mật khẩu → đăng nhập lại bằng mật khẩu mới', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'gv.e2e', password: 'MatKhau123', fullName: 'GV E2E' });
    expect(registerRes.status).toBe(201);
    const { accessToken } = registerRes.body;

    const meRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.username).toBe('gv.e2e');

    await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ oldPassword: 'MatKhau123', newPassword: 'MatKhauMoi456' })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'gv.e2e', password: 'MatKhauMoi456' });
    expect(loginRes.status).toBe(201);
  });

  it('refresh token xoay vòng: dùng refresh token cũ lần 2 phải bị từ chối', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'gv.rotate', password: 'MatKhau123', fullName: 'GV Rotate' });
    const oldRefreshToken = registerRes.body.refreshToken;

    const firstRefresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefreshToken });
    expect(firstRefresh.status).toBe(201);

    const secondRefresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefreshToken });
    expect(secondRefresh.status).toBe(401);
  });

  it('GET /auth/me không có token trả về 401', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });
});
