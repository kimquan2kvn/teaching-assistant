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
import { ConductCatalogItem, ConductCatalogItemSchema } from '../database/schemas/conduct-catalog-item.schema';
import { ConductLog, ConductLogSchema } from '../database/schemas/conduct-log.schema';
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
import { PositionGuard } from '../common/guards/position.guard';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { ConductLogController } from './conduct-log.controller';
import { ClassConductController } from './class-conduct.controller';
import { ConductLogService } from './conduct-log.service';
import { buildTestMongoUri } from '../../test/build-test-mongo-uri';

describe('ConductLog (e2e)', () => {
  let app: INestApplication;
  let classModel: Model<Class>;
  let positionModel: Model<Position>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(buildTestMongoUri('conduct_log_e2e')),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: SchoolYear.name, schema: SchoolYearSchema },
          { name: Class.name, schema: ClassSchema },
          { name: Position.name, schema: PositionSchema },
          { name: Student.name, schema: StudentSchema },
          { name: ConductCatalogItem.name, schema: ConductCatalogItemSchema },
          { name: ConductLog.name, schema: ConductLogSchema },
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

  it('GVBM ghi vi phạm vào đúng vị trí môn mình (từ danh mục), GVCN xem được trong GET theo lớp', async () => {
    const { token: gvcnToken, classId, code } = await createClassAsHomeroom('gvcn.cl-a', '10B1');
    const { token: gvbmToken } = await registerAndPromote('gvbm.cl-a', 'TEACHER');
    const subjectPositionId = await joinAsSubject(code, gvbmToken, 'Toán');
    const studentId = await createStudent(classId, gvcnToken, 'Học sinh A');
    const { token: adminToken } = await registerAndPromote('admin.cl-a', 'ADMIN');
    const catalogRes = await request(app.getHttpServer())
      .post('/conduct-catalog')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Nói chuyện riêng', kind: 'VIOLATION', points: 5 })
      .expect(201);
    const catalogItemId = catalogRes.body._id as string;

    await request(app.getHttpServer())
      .post(`/positions/${subjectPositionId}/conduct-logs`)
      .set('Authorization', `Bearer ${gvbmToken}`)
      .send({ studentId, catalogItemId })
      .expect(201);

    const logsRes = await request(app.getHttpServer())
      .get(`/classes/${classId}/conduct-logs`)
      .set('Authorization', `Bearer ${gvcnToken}`)
      .expect(200);
    expect(logsRes.body).toHaveLength(1);
    expect(logsRes.body[0].points).toBe(-5);
  });

  it("nhánh 'Khác' (không catalogItemId): điểm cộng dương, vi phạm âm, tự suy ra dấu từ kind", async () => {
    const { token, classId } = await createClassAsHomeroom('gvcn.cl-b', '10B2');
    const homeroomId = await getHomeroomPositionId(classId);
    const studentId = await createStudent(classId, token, 'Học sinh B');

    await request(app.getHttpServer())
      .post(`/positions/${homeroomId}/conduct-logs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId, kind: 'MERIT', points: 10, note: 'Giúp đỡ bạn học' })
      .expect(201);

    const logsRes = await request(app.getHttpServer())
      .get(`/classes/${classId}/conduct-logs`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(logsRes.body[0].points).toBe(10);
  });

  it('GVBM ghi vào vị trí không phải của mình → 403', async () => {
    const { token: gvcnToken, classId, code } = await createClassAsHomeroom('gvcn.cl-c', '10B3');
    const homeroomId = await getHomeroomPositionId(classId);
    const { token: gvbmToken } = await registerAndPromote('gvbm.cl-c', 'TEACHER');
    await joinAsSubject(code, gvbmToken, 'Toán');
    const studentId = await createStudent(classId, gvcnToken, 'X');

    await request(app.getHttpServer())
      .post(`/positions/${homeroomId}/conduct-logs`)
      .set('Authorization', `Bearer ${gvbmToken}`)
      .send({ studentId, kind: 'MERIT', points: 5, note: 'x' })
      .expect(403);
  });

  it('xếp loại rèn luyện: base 100 + tổng điểm trong tuần, không chặn trên', async () => {
    const { token, classId } = await createClassAsHomeroom('gvcn.cl-d', '10B4');
    const homeroomId = await getHomeroomPositionId(classId);
    const studentId = await createStudent(classId, token, 'Học sinh D');

    await request(app.getHttpServer())
      .post(`/positions/${homeroomId}/conduct-logs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId, kind: 'MERIT', points: 30, note: 'Xuất sắc' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/positions/${homeroomId}/conduct-logs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId, kind: 'VIOLATION', points: 5, note: 'Trễ' })
      .expect(201);

    const today = new Date().toISOString().slice(0, 10);
    const ratingRes = await request(app.getHttpServer())
      .get(`/classes/${classId}/conduct-rating?date=${today}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const row = ratingRes.body.find((r: { studentId: string }) => r.studentId === studentId);
    expect(row.score).toBe(125);
    expect(row.label).toBe('Xuất sắc');
  });
});
