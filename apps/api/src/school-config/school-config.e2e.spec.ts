import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import { Model } from 'mongoose';
import { updateSchoolConfigSchema } from '@so-chu-nhiem/shared';
import type { UpdateSchoolConfigInput } from '@so-chu-nhiem/shared';
import { User, UserSchema } from '../database/schemas/user.schema';
import { SchoolConfig, SchoolConfigSchema } from '../database/schemas/school-config.schema';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import { SchoolConfigController } from './school-config.controller';
import { SchoolConfigService } from './school-config.service';
import { buildTestMongoUri } from '../../test/build-test-mongo-uri';

type TestRole = 'TEACHER' | 'ADMIN' | 'STUDENT';

const DEFAULT_CONFIG = {
  weeklyViolationThreshold: 2,
  defaultPunishmentDueDays: 2,
  defaultWeeklyPunishmentLines: 20,
  saturdayIsSchoolDay: false,
};

// Mỗi field của updateSchoolConfigSchema phải có 1 giá trị KHÁC mặc định ở đây. Thêm field vào schema dùng chung mà
// quên khai báo ở đây thì test không biên dịch/không khớp; khai báo rồi mà SchoolConfigService.update quên chép
// field đó thì PATCH trả 200 nhưng giá trị không đổi và test fail (đúng lỗi saturdayIsSchoolDay từng bị bỏ qua).
const CHANGED_VALUES: Required<UpdateSchoolConfigInput> = {
  weeklyViolationThreshold: 4,
  defaultPunishmentDueDays: 5,
  defaultWeeklyPunishmentLines: 35,
  saturdayIsSchoolDay: true,
};

describe('SchoolConfig (e2e)', () => {
  let app: INestApplication;
  let schoolConfigModel: Model<SchoolConfig>;

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

    schoolConfigModel = moduleRef.get(getModelToken(SchoolConfig.name));
    await schoolConfigModel.create({});
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await schoolConfigModel.updateOne({}, DEFAULT_CONFIG);
  });

  async function registerAndPromote(username: string, role: TestRole) {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, password: 'MatKhau123', fullName: username });
    if (role === 'TEACHER') {
      return { token: res.body.accessToken as string };
    }
    const userModel = app.get(getModelToken(User.name)) as Model<User>;
    await userModel.updateOne({ username }, { role });
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

  describe('PATCH lưu đúng từng field của updateSchoolConfigSchema', () => {
    let teacherToken: string;
    let studentToken: string;
    let adminToken: string;

    beforeAll(async () => {
      teacherToken = (await registerAndPromote('gv.cfg-b', 'TEACHER')).token;
      studentToken = (await registerAndPromote('hs.cfg-b', 'STUDENT')).token;
      adminToken = (await registerAndPromote('admin.cfg-b', 'ADMIN')).token;
    });

    const patch = (token: string, body: Record<string, unknown>) =>
      request(app.getHttpServer()).patch('/school-config').set('Authorization', `Bearer ${token}`).send(body);
    const get = (token: string) =>
      request(app.getHttpServer()).get('/school-config').set('Authorization', `Bearer ${token}`);

    it('danh sách giá trị thử khớp đúng các field của schema dùng chung', () => {
      expect(Object.keys(CHANGED_VALUES).sort()).toEqual(Object.keys(updateSchoolConfigSchema.shape).sort());
    });

    it.each(Object.entries(CHANGED_VALUES))(
      'ADMIN PATCH riêng %s: response, GET và DB đều đổi, các field còn lại giữ nguyên',
      async (field, value) => {
        const expected = { ...DEFAULT_CONFIG, [field]: value };

        const res = await patch(adminToken, { [field]: value });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject(expected);
        expect((await get(teacherToken)).body).toMatchObject(expected);
        expect(await schoolConfigModel.findOne().lean()).toMatchObject(expected);
      },
    );

    it('ADMIN PATCH cả bốn field cùng lúc -> tất cả được lưu', async () => {
      const res = await patch(adminToken, { ...CHANGED_VALUES });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject(CHANGED_VALUES);
      expect((await get(teacherToken)).body).toMatchObject(CHANGED_VALUES);
      expect(await schoolConfigModel.findOne().lean()).toMatchObject(CHANGED_VALUES);
    });

    it('saturdayIsSchoolDay bật rồi tắt lại được; PATCH rỗng không đổi gì', async () => {
      expect((await patch(adminToken, { saturdayIsSchoolDay: true })).body.saturdayIsSchoolDay).toBe(true);
      expect((await patch(adminToken, {})).body).toMatchObject({ ...DEFAULT_CONFIG, saturdayIsSchoolDay: true });

      expect((await patch(adminToken, { saturdayIsSchoolDay: false })).body.saturdayIsSchoolDay).toBe(false);
      expect((await get(teacherToken)).body.saturdayIsSchoolDay).toBe(false);
      expect(await schoolConfigModel.findOne().lean()).toMatchObject(DEFAULT_CONFIG);
    });

    it('saturdayIsSchoolDay không phải boolean -> 400 và không đổi cấu hình', async () => {
      const res = await patch(adminToken, { saturdayIsSchoolDay: 'yes' });

      expect(res.status).toBe(400);
      expect(await schoolConfigModel.findOne().lean()).toMatchObject(DEFAULT_CONFIG);
    });

    it('TEACHER và STUDENT PATCH -> 403, cấu hình không đổi; chưa đăng nhập -> 401', async () => {
      expect((await patch(teacherToken, { saturdayIsSchoolDay: true })).status).toBe(403);
      expect((await patch(studentToken, { saturdayIsSchoolDay: true })).status).toBe(403);
      expect((await request(app.getHttpServer()).patch('/school-config').send({ saturdayIsSchoolDay: true })).status).toBe(401);

      expect(await schoolConfigModel.findOne().lean()).toMatchObject(DEFAULT_CONFIG);
    });
  });
});
