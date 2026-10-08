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
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import { SchoolYearsController } from './school-years.controller';
import { SchoolYearsService } from './school-years.service';
import { buildTestMongoUri } from '../../test/build-test-mongo-uri';

interface SchoolYearListItem {
  name: string;
  isCurrent: boolean;
}

describe('SchoolYears (e2e)', () => {
  let app: INestApplication;
  let userModel: Model<User>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(buildTestMongoUri('school_years_e2e')),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: SchoolYear.name, schema: SchoolYearSchema },
        ]),
        JwtModule.register({}),
        PassportModule,
      ],
      controllers: [AuthController, SchoolYearsController],
      providers: [AuthService, JwtStrategy, SchoolYearsService, Reflector],
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
    await userModel.updateOne({ username }, { role: 'ADMIN' });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'MatKhau123' });
    return loginRes.body.accessToken as string;
  }

  it('TEACHER gọi POST /school-years bị từ chối (403), nhưng xem được GET /school-years', async () => {
    const token = await registerAndPromote('gv.sy', 'TEACHER');
    await request(app.getHttpServer())
      .post('/school-years')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '2025-2026', startDate: '2025-09-05', endDate: '2026-05-31', isCurrent: true })
      .expect(403);

    await request(app.getHttpServer())
      .get('/school-years')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('tạo năm học mới với isCurrent=true sẽ tự tắt isCurrent của năm học cũ', async () => {
    const adminToken = await registerAndPromote('admin.sy', 'ADMIN');
    await request(app.getHttpServer())
      .post('/school-years')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '2025-2026', startDate: '2025-09-05', endDate: '2026-05-31', isCurrent: true })
      .expect(201);

    await request(app.getHttpServer())
      .post('/school-years')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '2026-2027', startDate: '2026-09-05', endDate: '2027-05-31', isCurrent: true })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/school-years')
      .set('Authorization', `Bearer ${adminToken}`);
    const currentOnes = (list.body as SchoolYearListItem[]).filter((y) => y.isCurrent);
    expect(currentOnes).toHaveLength(1);
    expect(currentOnes[0].name).toBe('2026-2027');
  });
});
