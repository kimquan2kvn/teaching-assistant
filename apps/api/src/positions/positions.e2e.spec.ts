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
import { PositionsController } from './positions.controller';
import { PositionsService } from './positions.service';
import { buildTestMongoUri } from '../../test/build-test-mongo-uri';

describe('Positions (e2e)', () => {
  let app: INestApplication;
  let userModel: Model<User>;
  let positionModel: Model<Position>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(buildTestMongoUri('positions_e2e')),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: SchoolYear.name, schema: SchoolYearSchema },
          { name: Class.name, schema: ClassSchema },
          { name: Position.name, schema: PositionSchema },
        ]),
        JwtModule.register({}),
        PassportModule,
      ],
      controllers: [AuthController, ClassesController, PositionsController],
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
    positionModel = moduleRef.get(getModelToken(Position.name));

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
    await userModel.updateOne({ username }, { role: 'ADMIN' });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'MatKhau123' });
    return { token: loginRes.body.accessToken as string, userId: loginRes.body.user.id as string };
  }

  it('2 giáo viên cùng nhận vị trí SUBJECT "Toán" của cùng 1 lớp cùng lúc: đúng 1 người thành công, người kia nhận 409', async () => {
    const { token: creatorToken } = await registerAndPromote('gv.lop-race', 'TEACHER');
    const classRes = await request(app.getHttpServer())
      .post('/classes')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ name: '10A1', claimHomeroom: false });
    const code = classRes.body.class.code as string;

    const { token: teacherA } = await registerAndPromote('gv.race-a', 'TEACHER');
    const { token: teacherB } = await registerAndPromote('gv.race-b', 'TEACHER');

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer())
        .post('/positions/join')
        .set('Authorization', `Bearer ${teacherA}`)
        .send({ code, type: 'SUBJECT', subject: 'Toán' }),
      request(app.getHttpServer())
        .post('/positions/join')
        .set('Authorization', `Bearer ${teacherB}`)
        .send({ code, type: 'SUBJECT', subject: 'Toán' }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it('ngừng phụ trách: người không giữ vị trí đó bị từ chối (403), người đang giữ thì thành công và holderId trở về null', async () => {
    const { token: creatorToken } = await registerAndPromote('gv.lop-release', 'TEACHER');
    const classRes = await request(app.getHttpServer())
      .post('/classes')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ name: '10A2', claimHomeroom: false });
    const code = classRes.body.class.code as string;

    const { token: holderToken } = await registerAndPromote('gv.giu-vi-tri', 'TEACHER');
    const joinRes = await request(app.getHttpServer())
      .post('/positions/join')
      .set('Authorization', `Bearer ${holderToken}`)
      .send({ code, type: 'SUBJECT', subject: 'Vật lý' });
    const positionId = joinRes.body._id as string;

    const { token: strangerToken } = await registerAndPromote('gv.khong-lien-quan', 'TEACHER');
    await request(app.getHttpServer())
      .post(`/positions/${positionId}/release`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/positions/${positionId}/release`)
      .set('Authorization', `Bearer ${holderToken}`)
      .expect(201);

    const released = await positionModel.findById(positionId).exec();
    expect(released?.holderId).toBeNull();
  });

  it('reassign: chỉ ADMIN được gọi, user không phải TEACHER bị từ chối với lỗi 400 rõ ràng', async () => {
    const { token: creatorToken } = await registerAndPromote('gv.lop-reassign', 'TEACHER');
    const classRes = await request(app.getHttpServer())
      .post('/classes')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ name: '10A3', claimHomeroom: false });
    const code = classRes.body.class.code as string;

    const { token: holderToken } = await registerAndPromote('gv.se-bi-thay', 'TEACHER');
    const joinRes = await request(app.getHttpServer())
      .post('/positions/join')
      .set('Authorization', `Bearer ${holderToken}`)
      .send({ code, type: 'SUBJECT', subject: 'Hóa học' });
    const positionId = joinRes.body._id as string;

    await request(app.getHttpServer())
      .patch(`/positions/${positionId}/reassign`)
      .set('Authorization', `Bearer ${holderToken}`)
      .send({ teacherId: 'anything' })
      .expect(403);

    const { token: adminToken, userId: adminUserId } = await registerAndPromote('admin.reassign', 'ADMIN');

    await request(app.getHttpServer())
      .patch(`/positions/${positionId}/reassign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teacherId: adminUserId })
      .expect(400);

    const { userId: newTeacherId } = await registerAndPromote('gv.nguoi-moi', 'TEACHER');
    await request(app.getHttpServer())
      .patch(`/positions/${positionId}/reassign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teacherId: newTeacherId })
      .expect(200);

    const updated = await positionModel.findById(positionId).exec();
    expect(String(updated?.holderId)).toBe(newTeacherId);
  });

  it('id không phải ObjectId hợp lệ trả về 400 thay vì 500 (release, reassign, reassign teacherId)', async () => {
    const { token } = await registerAndPromote('gv.badid-release', 'TEACHER');
    await request(app.getHttpServer())
      .post('/positions/khong-phai-id/release')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    const { token: adminToken } = await registerAndPromote('admin.badid', 'ADMIN');
    await request(app.getHttpServer())
      .patch('/positions/khong-phai-id/reassign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teacherId: 'cung-khong-phai-id' })
      .expect(400);
  });

  describe('GET /positions/mine', () => {
    it('giáo viên giữ 2 vị trí ở 2 lớp khác nhau → trả đúng 2 phần tử kèm đúng class.code/class.name', async () => {
      const { token: teacherToken } = await registerAndPromote('gv.mine-2lop', 'TEACHER');

      const classRes1 = await request(app.getHttpServer())
        .post('/classes')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ name: '10B1', claimHomeroom: true });
      const code1 = classRes1.body.class.code as string;

      const classRes2 = await request(app.getHttpServer())
        .post('/classes')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ name: '10B2', claimHomeroom: false });
      const code2 = classRes2.body.class.code as string;
      await request(app.getHttpServer())
        .post('/positions/join')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ code: code2, type: 'SUBJECT', subject: 'Sinh học' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/positions/mine')
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);

      expect(res.body).toHaveLength(2);
      const byClassCode = Object.fromEntries(res.body.map((p: any) => [p.class.code, p]));
      expect(byClassCode[code1]).toMatchObject({
        type: 'HOMEROOM',
        class: { code: code1, name: '10B1' },
      });
      expect(byClassCode[code2]).toMatchObject({
        type: 'SUBJECT',
        subject: 'Sinh học',
        class: { code: code2, name: '10B2' },
      });
    });

    it('giáo viên không giữ vị trí nào → trả mảng rỗng (không lỗi)', async () => {
      const { token } = await registerAndPromote('gv.mine-rong', 'TEACHER');

      const res = await request(app.getHttpServer())
        .get('/positions/mine')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('vị trí đã ngừng phụ trách (holderId: null) không xuất hiện trong kết quả của người vừa ngừng', async () => {
      const { token: creatorToken } = await registerAndPromote('gv.lop-mine-release', 'TEACHER');
      const classRes = await request(app.getHttpServer())
        .post('/classes')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ name: '10B3', claimHomeroom: false });
      const code = classRes.body.class.code as string;

      const { token: holderToken } = await registerAndPromote('gv.mine-se-ngung', 'TEACHER');
      const joinRes = await request(app.getHttpServer())
        .post('/positions/join')
        .set('Authorization', `Bearer ${holderToken}`)
        .send({ code, type: 'SUBJECT', subject: 'Địa lý' });
      const positionId = joinRes.body._id as string;

      await request(app.getHttpServer())
        .post(`/positions/${positionId}/release`)
        .set('Authorization', `Bearer ${holderToken}`)
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/positions/mine')
        .set('Authorization', `Bearer ${holderToken}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });
  });
});
