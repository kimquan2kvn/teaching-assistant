import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { Model } from 'mongoose';
import * as argon2 from 'argon2';
import { User, UserSchema } from '../database/schemas/user.schema';
import { SchoolYear, SchoolYearSchema } from '../database/schemas/school-year.schema';
import { Class, ClassSchema } from '../database/schemas/class.schema';
import { Position, PositionSchema } from '../database/schemas/position.schema';
import { Student, StudentSchema } from '../database/schemas/student.schema';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import { SchoolYearsService } from '../school-years/school-years.service';
import { ClassesController } from '../classes/classes.controller';
import { ClassesService } from '../classes/classes.service';
import { PositionsController } from '../positions/positions.controller';
import { PositionsService } from '../positions/positions.service';
import { PositionGuard } from '../common/guards/position.guard';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { buildTestMongoUri } from '../../test/build-test-mongo-uri';

// Bảng ma trận phân quyền (role giữ vị trí × hành động) theo spec Phase 1, mục "Kiểm thử". 2 dòng cuối của
// bảng gốc (release/reassign chỉ-ADMIN) đã có test riêng, trùng 100%, ở Plan 1A `positions.e2e.spec.ts` —
// không lặp lại ở đây, tập trung vào các hành động mới của Plan 1B (`students`).
describe('Permission matrix (e2e)', () => {
  let app: INestApplication;
  let userModel: Model<User>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(buildTestMongoUri('permission_matrix_e2e')),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: SchoolYear.name, schema: SchoolYearSchema },
          { name: Class.name, schema: ClassSchema },
          { name: Position.name, schema: PositionSchema },
          { name: Student.name, schema: StudentSchema },
        ]),
        JwtModule.register({}),
        PassportModule,
      ],
      controllers: [AuthController, ClassesController, PositionsController, StudentsController],
      providers: [
        AuthService,
        JwtStrategy,
        SchoolYearsService,
        ClassesService,
        PositionsService,
        StudentsService,
        PositionGuard,
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
    await userModel.updateOne({ username }, { role: 'ADMIN' });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'MatKhau123' });
    return { token: loginRes.body.accessToken as string, userId: loginRes.body.user.id as string };
  }

  async function loginAsStudent(username: string) {
    const passwordHash = await argon2.hash('MatKhau123');
    await userModel.create({
      username,
      passwordHash,
      fullName: username,
      role: 'STUDENT',
      mustChangePassword: false,
    });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'MatKhau123' });
    return { token: loginRes.body.accessToken as string };
  }

  async function createClassAsHomeroom(username: string, className: string) {
    const { token } = await registerAndPromote(username, 'TEACHER');
    const classRes = await request(app.getHttpServer())
      .post('/classes')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: className, claimHomeroom: true });
    return {
      token,
      classId: classRes.body.class._id as string,
      code: classRes.body.class.code as string,
    };
  }

  it('STUDENT: POST .../students → 403', async () => {
    const { classId } = await createClassAsHomeroom('gvcn.matrix-a', 'MT-A');
    const { token: studentToken } = await loginAsStudent('student.matrix-a');
    await request(app.getHttpServer())
      .post(`/classes/${classId}/students`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ fullName: 'Học sinh' })
      .expect(403);
  });

  it('STUDENT: GET .../students → 403', async () => {
    const { classId } = await createClassAsHomeroom('gvcn.matrix-b', 'MT-B');
    const { token: studentToken } = await loginAsStudent('student.matrix-b');
    await request(app.getHttpServer())
      .get(`/classes/${classId}/students`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);
  });

  it('GVBM (SUBJECT): PATCH .../students/:id → 403', async () => {
    const { token: gvcnToken, classId, code } = await createClassAsHomeroom('gvcn.matrix-c', 'MT-C');
    const studentRes = await request(app.getHttpServer())
      .post(`/classes/${classId}/students`)
      .set('Authorization', `Bearer ${gvcnToken}`)
      .send({ fullName: 'Học sinh C' });
    const studentId = studentRes.body._id as string;

    const { token: gvbmToken } = await registerAndPromote('gvbm.matrix-c', 'TEACHER');
    await request(app.getHttpServer())
      .post('/positions/join')
      .set('Authorization', `Bearer ${gvbmToken}`)
      .send({ code, type: 'SUBJECT', subject: 'Toán' });

    await request(app.getHttpServer())
      .patch(`/classes/${classId}/students/${studentId}`)
      .set('Authorization', `Bearer ${gvbmToken}`)
      .send({ fullName: 'Đổi tên trái phép' })
      .expect(403);
  });

  it('GVBM (SUBJECT): GET .../students → 200', async () => {
    const { classId, code } = await createClassAsHomeroom('gvcn.matrix-d', 'MT-D');
    const { token: gvbmToken } = await registerAndPromote('gvbm.matrix-d', 'TEACHER');
    await request(app.getHttpServer())
      .post('/positions/join')
      .set('Authorization', `Bearer ${gvbmToken}`)
      .send({ code, type: 'SUBJECT', subject: 'Toán' });

    await request(app.getHttpServer())
      .get(`/classes/${classId}/students`)
      .set('Authorization', `Bearer ${gvbmToken}`)
      .expect(200);
  });

  it('GVCN (HOMEROOM) lớp mình: PATCH .../students/:id lớp mình → 200', async () => {
    const { token, classId } = await createClassAsHomeroom('gvcn.matrix-e', 'MT-E');
    const studentRes = await request(app.getHttpServer())
      .post(`/classes/${classId}/students`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Học sinh E' });
    const studentId = studentRes.body._id as string;

    await request(app.getHttpServer())
      .patch(`/classes/${classId}/students/${studentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Học sinh E (đã sửa)' })
      .expect(200);
  });

  it('GVCN (HOMEROOM) lớp mình: PATCH .../students/:id lớp khác → 403', async () => {
    const classF = await createClassAsHomeroom('gvcn.matrix-f1', 'MT-F1');
    const classG = await createClassAsHomeroom('gvcn.matrix-f2', 'MT-F2');
    const studentRes = await request(app.getHttpServer())
      .post(`/classes/${classG.classId}/students`)
      .set('Authorization', `Bearer ${classG.token}`)
      .send({ fullName: 'Học sinh G' });
    const studentId = studentRes.body._id as string;

    await request(app.getHttpServer())
      .patch(`/classes/${classG.classId}/students/${studentId}`)
      .set('Authorization', `Bearer ${classF.token}`)
      .send({ fullName: 'Đổi tên trái phép' })
      .expect(403);
  });

  it('Giáo viên chưa giữ vị trí nào: POST /positions/:id/release vị trí bất kỳ → 403', async () => {
    const classH = await createClassAsHomeroom('gvcn.matrix-h', 'MT-H');
    const { token: outsiderToken } = await registerAndPromote('gv.matrix-h-outsider', 'TEACHER');

    // findByCode (GET /classes/:code) không trả _id của position — lấy trực tiếp qua model để gọi release.
    const positionModel = app.get(getModelToken(Position.name)) as Model<Position>;
    const homeroomPosition = await positionModel.findOne({ classId: classH.classId, type: 'HOMEROOM' }).exec();

    await request(app.getHttpServer())
      .post(`/positions/${String(homeroomPosition?._id)}/release`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);
  });

  it('Bất kỳ TEACHER: PATCH /positions/:id/reassign → 403 (chỉ ADMIN)', async () => {
    const classI = await createClassAsHomeroom('gvcn.matrix-i', 'MT-I');
    const positionModel = app.get(getModelToken(Position.name)) as Model<Position>;
    const homeroomPosition = await positionModel.findOne({ classId: classI.classId, type: 'HOMEROOM' }).exec();
    const { token: anotherTeacherToken } = await registerAndPromote('gv.matrix-i-another', 'TEACHER');

    await request(app.getHttpServer())
      .patch(`/positions/${String(homeroomPosition?._id)}/reassign`)
      .set('Authorization', `Bearer ${anotherTeacherToken}`)
      .send({ teacherId: classI.classId })
      .expect(403);
  });

  it('ADMIN: POST/PATCH/GET .../students đều → 200/201', async () => {
    const { classId } = await createClassAsHomeroom('gvcn.matrix-j', 'MT-J');
    const { token: adminToken } = await registerAndPromote('admin.matrix-j', 'ADMIN');

    const createRes = await request(app.getHttpServer())
      .post(`/classes/${classId}/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fullName: 'Học sinh J' })
      .expect(201);
    const studentId = createRes.body._id as string;

    await request(app.getHttpServer())
      .patch(`/classes/${classId}/students/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fullName: 'Học sinh J (đã sửa)' })
      .expect(200);

    await request(app.getHttpServer())
      .get(`/classes/${classId}/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('ADMIN: PATCH /positions/:id/reassign sang user không phải TEACHER → 400', async () => {
    const classK = await createClassAsHomeroom('gvcn.matrix-k', 'MT-K');
    const positionModel = app.get(getModelToken(Position.name)) as Model<Position>;
    const homeroomPosition = await positionModel.findOne({ classId: classK.classId, type: 'HOMEROOM' }).exec();
    const { token: adminToken } = await registerAndPromote('admin.matrix-k', 'ADMIN');
    await loginAsStudent('student.matrix-k');
    const studentUser = await userModel.findOne({ username: 'student.matrix-k' }).exec();

    await request(app.getHttpServer())
      .patch(`/positions/${String(homeroomPosition?._id)}/reassign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teacherId: String(studentUser?._id) })
      .expect(400);
  });
});
