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
import { AttendanceRecord, AttendanceRecordSchema } from '../database/schemas/attendance-record.schema';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import { SchoolYearsService } from '../school-years/school-years.service';
import { ClassesController } from '../classes/classes.controller';
import { ClassesService } from '../classes/classes.service';
import { PositionsController } from '../positions/positions.controller';
import { PositionsService } from '../positions/positions.service';
import { StudentsController } from '../students/students.controller';
import { StudentsService } from '../students/students.service';
import { PositionGuard } from '../common/guards/position.guard';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { AttendanceController } from './attendance.controller';
import { ClassAttendanceController } from './class-attendance.controller';
import { AttendanceService } from './attendance.service';
import { buildTestMongoUri } from '../../test/build-test-mongo-uri';

describe('Attendance (e2e)', () => {
  let app: INestApplication;
  let classModel: Model<Class>;
  let positionModel: Model<Position>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(buildTestMongoUri('attendance_e2e')),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: SchoolYear.name, schema: SchoolYearSchema },
          { name: Class.name, schema: ClassSchema },
          { name: Position.name, schema: PositionSchema },
          { name: Student.name, schema: StudentSchema },
          { name: AttendanceRecord.name, schema: AttendanceRecordSchema },
        ]),
        JwtModule.register({}),
        PassportModule,
      ],
      controllers: [
        AuthController,
        ClassesController,
        PositionsController,
        StudentsController,
        AttendanceController,
        ClassAttendanceController,
      ],
      providers: [
        AuthService,
        JwtStrategy,
        SchoolYearsService,
        ClassesService,
        PositionsService,
        StudentsService,
        AttendanceService,
        PositionGuard,
        PositionOwnerGuard,
        Reflector,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    classModel = moduleRef.get(getModelToken(Class.name));
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
    const userModel = app.get(getModelToken(User.name)) as Model<User>;
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

  async function joinAsSubject(code: string, token: string, subject: string): Promise<string> {
    await request(app.getHttpServer())
      .post('/positions/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ code, type: 'SUBJECT', subject });
    const klass = await classModel.findOne({ code }).exec();
    const position = await positionModel.findOne({ classId: klass!._id, type: 'SUBJECT', subject }).exec();
    return String(position!._id);
  }

  async function getHomeroomPositionId(classId: string): Promise<string> {
    const position = await positionModel.findOne({ classId, type: 'HOMEROOM' }).exec();
    return String(position!._id);
  }

  async function createStudent(classId: string, token: string, fullName: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/classes/${classId}/students`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName });
    return res.body._id as string;
  }

  it('GVBM điểm danh đúng vị trí môn mình, GVCN xem được nhưng không sửa được', async () => {
    const { token: gvcnToken, classId, code } = await createClassAsHomeroom('gvcn.att-a', '10A1');
    const { token: gvbmToken } = await registerAndPromote('gvbm.att-a', 'TEACHER');
    const subjectPositionId = await joinAsSubject(code, gvbmToken, 'Toán');
    const studentId = await createStudent(classId, gvcnToken, 'Học sinh A');

    await request(app.getHttpServer())
      .put(`/positions/${subjectPositionId}/attendance?date=2026-01-19`)
      .set('Authorization', `Bearer ${gvbmToken}`)
      .send({ entries: [{ studentId, status: 'LATE' }] })
      .expect(200);

    const gvcnRead = await request(app.getHttpServer())
      .get(`/positions/${subjectPositionId}/attendance?date=2026-01-19`)
      .set('Authorization', `Bearer ${gvcnToken}`)
      .expect(200);
    expect(gvcnRead.body[0].status).toBe('LATE');

    await request(app.getHttpServer())
      .put(`/positions/${subjectPositionId}/attendance?date=2026-01-19`)
      .set('Authorization', `Bearer ${gvcnToken}`)
      .send({ entries: [{ studentId, status: 'PRESENT' }] })
      .expect(403);
  });

  it('ghi đè điểm danh (PUT) thay thế toàn bộ bản ghi ngoại lệ của ngày đó', async () => {
    const { token, classId } = await createClassAsHomeroom('gvcn.att-b', '10A2');
    const s1 = await createStudent(classId, token, 'HS 1');
    const s2 = await createStudent(classId, token, 'HS 2');
    const homeroomId = await getHomeroomPositionId(classId);

    await request(app.getHttpServer())
      .put(`/positions/${homeroomId}/attendance?date=2026-01-19`)
      .set('Authorization', `Bearer ${token}`)
      .send({ entries: [{ studentId: s1, status: 'LATE' }, { studentId: s2, status: 'EXCUSED' }] })
      .expect(200);

    await request(app.getHttpServer())
      .put(`/positions/${homeroomId}/attendance?date=2026-01-19`)
      .set('Authorization', `Bearer ${token}`)
      .send({ entries: [{ studentId: s1, status: 'UNEXCUSED' }] })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/positions/${homeroomId}/attendance?date=2026-01-19`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.find((r: { studentId: string }) => r.studentId === s1).status).toBe('UNEXCUSED');
    expect(res.body.some((r: { studentId: string }) => r.studentId === s2)).toBe(false);
  });

  it('giáo viên không liên quan tới lớp bị từ chối dù biết đúng positionId', async () => {
    const { classId } = await createClassAsHomeroom('gvcn.att-c', '10A3');
    const homeroomId = await getHomeroomPositionId(classId);
    const { token: outsiderToken } = await registerAndPromote('gv.att-outsider', 'TEACHER');

    await request(app.getHttpServer())
      .get(`/positions/${homeroomId}/attendance?date=2026-01-19`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);
  });

  it('không ghi được điểm danh cho học sinh KHÔNG thuộc lớp của position đó (dù biết đúng id học sinh lớp khác)', async () => {
    const classA = await createClassAsHomeroom('gvcn.att-d1', '10A4');
    const classB = await createClassAsHomeroom('gvcn.att-d2', '10A5');
    const homeroomIdA = await getHomeroomPositionId(classA.classId);
    const studentInClassB = await createStudent(classB.classId, classB.token, 'Học sinh lớp B');

    await request(app.getHttpServer())
      .put(`/positions/${homeroomIdA}/attendance?date=2026-01-19`)
      .set('Authorization', `Bearer ${classA.token}`)
      .send({ entries: [{ studentId: studentInClassB, status: 'LATE' }] })
      .expect(404);
  });

  it('tổng hợp điểm danh theo lớp (summary) chỉ tính theo vị trí HOMEROOM, học sinh không bị ghi coi là Có mặt', async () => {
    const { token: gvcnToken, classId, code } = await createClassAsHomeroom('gvcn.att-f', '10A7');
    const { token: gvbmToken } = await registerAndPromote('gvbm.att-f', 'TEACHER');
    const subjectPositionId = await joinAsSubject(code, gvbmToken, 'Toán');
    const homeroomId = await getHomeroomPositionId(classId);
    const s1 = await createStudent(classId, gvcnToken, 'HS 1');
    await createStudent(classId, gvcnToken, 'HS 2'); // không ghi gì -> mặc định Có mặt

    await request(app.getHttpServer())
      .put(`/positions/${homeroomId}/attendance?date=2026-01-19`)
      .set('Authorization', `Bearer ${gvcnToken}`)
      .send({ entries: [{ studentId: s1, status: 'LATE' }] })
      .expect(200);
    // Ghi UNEXCUSED cho s1 ở vị trí SUBJECT (môn Toán) — KHÔNG được tính vào summary của lớp (chỉ tính HOMEROOM).
    await request(app.getHttpServer())
      .put(`/positions/${subjectPositionId}/attendance?date=2026-01-19`)
      .set('Authorization', `Bearer ${gvbmToken}`)
      .send({ entries: [{ studentId: s1, status: 'UNEXCUSED' }] })
      .expect(200);

    const summaryRes = await request(app.getHttpServer())
      .get(`/classes/${classId}/attendance/summary?date=2026-01-19`)
      .set('Authorization', `Bearer ${gvcnToken}`)
      .expect(200);
    expect(summaryRes.body).toEqual({ PRESENT: 1, EXCUSED: 0, LATE: 1, UNEXCUSED: 0 });
  });

  it('không chấp nhận danh sách điểm danh có studentId trùng lặp trong cùng 1 request', async () => {
    const { token, classId } = await createClassAsHomeroom('gvcn.att-e', '10A6');
    const homeroomId = await getHomeroomPositionId(classId);
    const studentId = await createStudent(classId, token, 'Học sinh E');

    await request(app.getHttpServer())
      .put(`/positions/${homeroomId}/attendance?date=2026-01-19`)
      .set('Authorization', `Bearer ${token}`)
      .send({ entries: [{ studentId, status: 'LATE' }, { studentId, status: 'EXCUSED' }] })
      .expect(400);
  });
});
