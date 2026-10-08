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

interface StudentView {
  _id: string;
  fullName: string;
  status: 'ACTIVE' | 'TRANSFERRED';
  transferDate?: string;
  transferReason?: string;
}

describe('Students (e2e)', () => {
  let app: INestApplication;
  let userModel: Model<User>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(buildTestMongoUri('students_e2e')),
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

  it('GVCN tạo được học sinh trong lớp mình, GVBM (giữ SUBJECT) không tạo được dù cùng lớp nhưng vẫn xem được', async () => {
    const { token: gvcnToken, classId, code } = await createClassAsHomeroom('gvcn.a', '10B1');

    await request(app.getHttpServer())
      .post(`/classes/${classId}/students`)
      .set('Authorization', `Bearer ${gvcnToken}`)
      .send({ fullName: 'Học sinh A' })
      .expect(201);

    const { token: gvbmToken } = await registerAndPromote('gvbm.a', 'TEACHER');
    await request(app.getHttpServer())
      .post('/positions/join')
      .set('Authorization', `Bearer ${gvbmToken}`)
      .send({ code, type: 'SUBJECT', subject: 'Toán' });

    await request(app.getHttpServer())
      .post(`/classes/${classId}/students`)
      .set('Authorization', `Bearer ${gvbmToken}`)
      .send({ fullName: 'Học sinh B' })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/classes/${classId}/students`)
      .set('Authorization', `Bearer ${gvbmToken}`)
      .expect(200);
  });

  it('giáo viên không giữ vị trí nào của lớp không xem được danh sách học sinh', async () => {
    const { token: gvcnToken, classId } = await createClassAsHomeroom('gvcn.b', '10B2');
    await request(app.getHttpServer())
      .post(`/classes/${classId}/students`)
      .set('Authorization', `Bearer ${gvcnToken}`)
      .send({ fullName: 'Học sinh C' });

    const { token: outsiderToken } = await registerAndPromote('gv.ngoai-cuoc', 'TEACHER');
    await request(app.getHttpServer())
      .get(`/classes/${classId}/students`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);
  });

  it('GVCN lớp A không sửa được học sinh lớp B (dù biết đúng id học sinh lớp B)', async () => {
    const classA = await createClassAsHomeroom('gvcn.c', '10C1');
    const classB = await createClassAsHomeroom('gvcn.d', '10C2');

    const studentBRes = await request(app.getHttpServer())
      .post(`/classes/${classB.classId}/students`)
      .set('Authorization', `Bearer ${classB.token}`)
      .send({ fullName: 'Học sinh lớp B' });
    const studentBId = studentBRes.body._id as string;

    // Thử dùng đúng classId của lớp B nhưng token của GVCN lớp A — PositionGuard phải chặn vì GVCN A không
    // giữ HOMEROOM của lớp B.
    await request(app.getHttpServer())
      .patch(`/classes/${classB.classId}/students/${studentBId}`)
      .set('Authorization', `Bearer ${classA.token}`)
      .send({ fullName: 'Bị đổi tên trái phép' })
      .expect(403);

    // Thử trộn: dùng classId của LỚP MÌNH (A) trong URL (để PositionGuard cho qua) nhưng studentId thật sự
    // thuộc lớp B — service phải tự phát hiện mismatch và từ chối, không được tin tưởng classId trên URL.
    await request(app.getHttpServer())
      .patch(`/classes/${classA.classId}/students/${studentBId}`)
      .set('Authorization', `Bearer ${classA.token}`)
      .send({ fullName: 'Bị đổi tên trái phép 2' })
      .expect(404);
  });

  it('transfer: ẩn khỏi danh sách mặc định nhưng vẫn thấy với ?status=ALL, giữ transferDate/transferReason', async () => {
    const { token, classId } = await createClassAsHomeroom('gvcn.e', '10D1');
    const studentRes = await request(app.getHttpServer())
      .post(`/classes/${classId}/students`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Học sinh chuyển đi' });
    const studentId = studentRes.body._id as string;

    await request(app.getHttpServer())
      .post(`/classes/${classId}/students/${studentId}/transfer`)
      .set('Authorization', `Bearer ${token}`)
      .send({ transferDate: '2026-01-15', transferReason: 'Chuyển trường' })
      .expect(201);

    const defaultList = await request(app.getHttpServer())
      .get(`/classes/${classId}/students`)
      .set('Authorization', `Bearer ${token}`);
    expect((defaultList.body as StudentView[]).some((s) => s._id === studentId)).toBe(false);

    const allList = await request(app.getHttpServer())
      .get(`/classes/${classId}/students?status=ALL`)
      .set('Authorization', `Bearer ${token}`);
    const transferred = (allList.body as StudentView[]).find((s) => s._id === studentId);
    expect(transferred).toBeDefined();
    expect(transferred?.status).toBe('TRANSFERRED');
    expect(transferred?.transferReason).toBe('Chuyển trường');
  });
});
