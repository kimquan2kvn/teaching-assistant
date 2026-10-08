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
import { AttendanceController } from '../attendance/attendance.controller';
import { ClassAttendanceController } from '../attendance/class-attendance.controller';
import { AttendanceService } from '../attendance/attendance.service';
import { PunishmentsService } from '../punishments/punishments.service';
import { PositionGuard } from '../common/guards/position.guard';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { buildTestMongoUri } from '../../test/build-test-mongo-uri';

describe('Dashboard (e2e)', () => {
  let app: INestApplication;
  let positionModel: Model<Position>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(buildTestMongoUri('dashboard_e2e')),
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
        DashboardController,
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
        PunishmentsService,
        DashboardService,
        PositionGuard,
        PositionOwnerGuard,
        Reflector,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
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

  function todayStr(): string {
    return new Date().toISOString().slice(0, 10);
  }

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
    };
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

  it('dashboard gộp đủ 4 phần cho đúng lớp, giáo viên không giữ vị trí nào của lớp bị từ chối', async () => {
    const { token, classId } = await createClassAsHomeroom('gvcn.dash-a', '10D1');
    const homeroomId = await getHomeroomPositionId(classId);
    const studentId = await createStudent(classId, token, 'Học sinh A');

    await request(app.getHttpServer())
      .put(`/positions/${homeroomId}/attendance?date=${todayStr()}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ entries: [{ studentId, status: 'LATE' }] });
    await request(app.getHttpServer())
      .post(`/positions/${homeroomId}/conduct-logs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId, kind: 'VIOLATION', points: 5, note: 'Trễ' });

    const res = await request(app.getHttpServer())
      .get(`/classes/${classId}/dashboard?date=${todayStr()}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.attendanceSummary.LATE).toBe(1);
    expect(res.body.recentConductLogs).toHaveLength(1);
    expect(res.body.conductRating[0].score).toBe(95);
    expect(Array.isArray(res.body.pendingPunishments)).toBe(true);

    const { token: outsiderToken } = await registerAndPromote('gv.dash-outsider', 'TEACHER');
    await request(app.getHttpServer())
      .get(`/classes/${classId}/dashboard?date=${todayStr()}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);
  });
});
