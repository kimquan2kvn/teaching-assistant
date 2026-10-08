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
import { ConductCatalogItem, ConductCatalogItemSchema } from '../database/schemas/conduct-catalog-item.schema';
import { ConductLog, ConductLogSchema } from '../database/schemas/conduct-log.schema';
import { Punishment, PunishmentSchema } from '../database/schemas/punishment.schema';
import { SchoolConfig, SchoolConfigSchema } from '../database/schemas/school-config.schema';
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
import { ConductCatalogController } from '../conduct-catalog/conduct-catalog.controller';
import { ConductCatalogService } from '../conduct-catalog/conduct-catalog.service';
import { ConductLogController } from '../conduct-log/conduct-log.controller';
import { ClassConductController } from '../conduct-log/class-conduct.controller';
import { ConductLogService } from '../conduct-log/conduct-log.service';
import { SchoolConfigService } from '../school-config/school-config.service';
import { PositionGuard } from '../common/guards/position.guard';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { AttendanceController } from './attendance.controller';
import { ClassAttendanceController } from './class-attendance.controller';
import { AttendanceService } from './attendance.service';
import { buildTestMongoUri } from '../../test/build-test-mongo-uri';

describe('Permission matrix — attendance & conduct (e2e)', () => {
  let app: INestApplication;
  let classModel: Model<Class>;
  let positionModel: Model<Position>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(buildTestMongoUri('attendance_conduct_matrix_e2e')),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: SchoolYear.name, schema: SchoolYearSchema },
          { name: Class.name, schema: ClassSchema },
          { name: Position.name, schema: PositionSchema },
          { name: Student.name, schema: StudentSchema },
          { name: AttendanceRecord.name, schema: AttendanceRecordSchema },
          { name: ConductCatalogItem.name, schema: ConductCatalogItemSchema },
          { name: ConductLog.name, schema: ConductLogSchema },
          { name: Punishment.name, schema: PunishmentSchema },
          { name: SchoolConfig.name, schema: SchoolConfigSchema },
        ]),
        JwtModule.register({}),
        PassportModule,
      ],
      controllers: [
        AuthController,
        ClassesController,
        PositionsController,
        StudentsController,
        ConductCatalogController,
        ConductLogController,
        ClassConductController,
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
        ConductCatalogService,
        ConductLogService,
        SchoolConfigService,
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

  it('GVBM: PUT .../attendance đúng position của mình → 200', async () => {
    const { token: gvcnToken, classId, code } = await createClassAsHomeroom('gvcn.pm-a', 'MTA');
    const { token: gvbmToken } = await registerAndPromote('gvbm.pm-a', 'TEACHER');
    const positionId = await joinAsSubject(code, gvbmToken, 'Toán');
    const studentId = await createStudent(classId, gvcnToken, 'X');

    await request(app.getHttpServer())
      .put(`/positions/${positionId}/attendance?date=2026-02-02`)
      .set('Authorization', `Bearer ${gvbmToken}`)
      .send({ entries: [{ studentId, status: 'LATE' }] })
      .expect(200);
  });

  it('GVBM: PUT .../attendance vào position môn KHÁC cùng lớp → 403', async () => {
    const { code } = await createClassAsHomeroom('gvcn.pm-b', 'MTB');
    const { token: gvbmToken } = await registerAndPromote('gvbm.pm-b1', 'TEACHER');
    await joinAsSubject(code, gvbmToken, 'Toán');
    const { token: otherGvbmToken } = await registerAndPromote('gvbm.pm-b2', 'TEACHER');
    const otherPositionId = await joinAsSubject(code, otherGvbmToken, 'Ngữ văn');

    await request(app.getHttpServer())
      .put(`/positions/${otherPositionId}/attendance?date=2026-02-02`)
      .set('Authorization', `Bearer ${gvbmToken}`)
      .send({ entries: [] })
      .expect(403);
  });

  it('GVBM: POST .../conduct-logs đúng position của mình → 201', async () => {
    const { token: gvcnToken, classId, code } = await createClassAsHomeroom('gvcn.pm-c', 'MTC');
    const { token: gvbmToken } = await registerAndPromote('gvbm.pm-c', 'TEACHER');
    const positionId = await joinAsSubject(code, gvbmToken, 'Toán');
    const studentId = await createStudent(classId, gvcnToken, 'X');

    await request(app.getHttpServer())
      .post(`/positions/${positionId}/conduct-logs`)
      .set('Authorization', `Bearer ${gvbmToken}`)
      .send({ studentId, kind: 'MERIT', points: 5, note: 'x' })
      .expect(201);
  });

  it('GVCN (HOMEROOM): GET .../attendance vị trí SUBJECT bất kỳ cùng lớp → 200', async () => {
    const { token: gvcnToken, code } = await createClassAsHomeroom('gvcn.pm-d', 'MTD');
    const { token: gvbmToken } = await registerAndPromote('gvbm.pm-d', 'TEACHER');
    const positionId = await joinAsSubject(code, gvbmToken, 'Toán');

    await request(app.getHttpServer())
      .get(`/positions/${positionId}/attendance?date=2026-02-02`)
      .set('Authorization', `Bearer ${gvcnToken}`)
      .expect(200);
  });

  it('GVCN (HOMEROOM): PUT .../attendance vị trí SUBJECT (không phải mình) → 403', async () => {
    const { token: gvcnToken, code } = await createClassAsHomeroom('gvcn.pm-e', 'MTE');
    const { token: gvbmToken } = await registerAndPromote('gvbm.pm-e', 'TEACHER');
    const positionId = await joinAsSubject(code, gvbmToken, 'Toán');

    await request(app.getHttpServer())
      .put(`/positions/${positionId}/attendance?date=2026-02-02`)
      .set('Authorization', `Bearer ${gvcnToken}`)
      .send({ entries: [] })
      .expect(403);
  });

  it('Giáo viên không giữ vị trí nào của lớp: GET .../attendance bất kỳ position nào của lớp đó → 403', async () => {
    const { classId } = await createClassAsHomeroom('gvcn.pm-f', 'MTF');
    const homeroomId = await getHomeroomPositionId(classId);
    const { token: outsiderToken } = await registerAndPromote('gv.pm-f-outsider', 'TEACHER');

    await request(app.getHttpServer())
      .get(`/positions/${homeroomId}/attendance?date=2026-02-02`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);
  });

  it('ADMIN: PUT .../attendance, POST .../conduct-logs bất kỳ position nào → 200/201', async () => {
    const { classId, code } = await createClassAsHomeroom('gvcn.pm-g', 'MTG');
    const { token: gvbmToken } = await registerAndPromote('gvbm.pm-g', 'TEACHER');
    const positionId = await joinAsSubject(code, gvbmToken, 'Toán');
    const { token: adminToken } = await registerAndPromote('admin.pm-g', 'ADMIN');
    const studentId = await createStudent(classId, adminToken, 'X');

    await request(app.getHttpServer())
      .put(`/positions/${positionId}/attendance?date=2026-02-02`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ entries: [{ studentId, status: 'LATE' }] })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/positions/${positionId}/conduct-logs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId, kind: 'MERIT', points: 5, note: 'x' })
      .expect(201);
  });

  it('TEACHER (bất kỳ): POST /conduct-catalog → 403', async () => {
    const { token } = await registerAndPromote('gv.pm-h', 'TEACHER');
    await request(app.getHttpServer())
      .post('/conduct-catalog')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'x', kind: 'VIOLATION', points: 5 })
      .expect(403);
  });

  it('ADMIN: POST /conduct-catalog, PATCH /conduct-catalog/:id → 201/200', async () => {
    const { token } = await registerAndPromote('admin.pm-i', 'ADMIN');
    const createRes = await request(app.getHttpServer())
      .post('/conduct-catalog')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'x', kind: 'VIOLATION', points: 5 })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/conduct-catalog/${createRes.body._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'y' })
      .expect(200);
  });
});
