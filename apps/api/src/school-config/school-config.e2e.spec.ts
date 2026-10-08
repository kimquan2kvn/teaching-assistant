import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import { Model } from 'mongoose';
import { User, UserSchema } from '../database/schemas/user.schema';
import { SchoolConfig, SchoolConfigSchema } from '../database/schemas/school-config.schema';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import { SchoolConfigController } from './school-config.controller';
import { SchoolConfigService } from './school-config.service';
import { buildTestMongoUri } from '../../test/build-test-mongo-uri';

describe('SchoolConfig (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(buildTestMongoUri('school_config_e2e')),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: SchoolConfig.name, schema: SchoolConfigSchema },
        ]),
        JwtModule.register({}),
        PassportModule,
      ],
      controllers: [AuthController, SchoolConfigController],
      providers: [AuthService, JwtStrategy, SchoolConfigService],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const schoolConfigModel = moduleRef.get(getModelToken(SchoolConfig.name));
    await schoolConfigModel.create({});
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerAndPromote(username: string, role: 'TEACHER' | 'ADMIN') {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, password: 'MatKhau123', fullName: username });
    if (role === 'TEACHER') {
      return { token: res.body.accessToken as string };
    }
    const userModel = app.get(getModelToken(User.name)) as Model<User>;
    await userModel.updateOne({ username }, { role: 'ADMIN' });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'MatKhau123' });
    return { token: loginRes.body.accessToken as string };
  }

  it('TEACHER đọc được config nhưng không sửa được (403); ADMIN sửa được, giá trị áp dụng ngay', async () => {
    const { token: teacherToken } = await registerAndPromote('gv.cfg-a', 'TEACHER');
    const { token: adminToken } = await registerAndPromote('admin.cfg-a', 'ADMIN');

    const initial = await request(app.getHttpServer())
      .get('/school-config')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    expect(initial.body.weeklyViolationThreshold).toBe(2);

    await request(app.getHttpServer())
      .patch('/school-config')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ weeklyViolationThreshold: 5 })
      .expect(403);

    await request(app.getHttpServer())
      .patch('/school-config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ weeklyViolationThreshold: 5 })
      .expect(200);

    const after = await request(app.getHttpServer())
      .get('/school-config')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    expect(after.body.weeklyViolationThreshold).toBe(5);
  });
});
