import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import { Model, Types } from 'mongoose';
import { User, UserSchema } from '../database/schemas/user.schema';
import { SchoolYear, SchoolYearSchema } from '../database/schemas/school-year.schema';
import { Class, ClassSchema } from '../database/schemas/class.schema';
import { Position, PositionSchema } from '../database/schemas/position.schema';
import { Student, StudentSchema } from '../database/schemas/student.schema';
import { Punishment, PunishmentSchema } from '../database/schemas/punishment.schema';
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
import { PunishmentsController } from './punishments.controller';
import { ClassPunishmentsController } from './class-punishments.controller';
import { PunishmentsService } from './punishments.service';
import { buildTestMongoUri } from '../../test/build-test-mongo-uri';

describe('Punishments (e2e)', () => {
  let app: INestApplication;
  let punishmentModel: Model<Punishment>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(buildTestMongoUri('punishments_e2e')),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: SchoolYear.name, schema: SchoolYearSchema },
          { name: Class.name, schema: ClassSchema },
          { name: Position.name, schema: PositionSchema },
          { name: Student.name, schema: StudentSchema },
          { name: Punishment.name, schema: PunishmentSchema },
        ]),
        JwtModule.register({}),
        PassportModule,
      ],
      controllers: [
        AuthController,
        ClassesController,
        PositionsController,
        StudentsController,
        PunishmentsController,
        ClassPunishmentsController,
      ],
      providers: [
        AuthService,
        JwtStrategy,
        SchoolYearsService,
        ClassesService,
        PositionsService,
        StudentsService,
        PunishmentsService,
        PositionGuard,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    punishmentModel = moduleRef.get(getModelToken(Punishment.name));

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
    };
  }

  async function createStudent(classId: string, token: string, fullName: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/classes/${classId}/students`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName });
    return res.body._id as string;
  }

  it('GVCN lớp A không cập nhật được chép phạt của học sinh lớp B dù biết đúng id', async () => {
    const classA = await createClassAsHomeroom('gvcn.pun-d1', '10P4');
    const classB = await createClassAsHomeroom('gvcn.pun-d2', '10P5');
    const studentB = await createStudent(classB.classId, classB.token, 'Học sinh B');
    const punishment = await punishmentModel.create({
      studentId: studentB,
      classId: classB.classId,
      kind: 'WEEKLY_THRESHOLD',
      reason: 'test',
      lines: 20,
      dueDate: new Date(),
      triggerConductLogId: new Types.ObjectId(),
    });

    await request(app.getHttpServer())
      .patch(`/punishments/${punishment._id}/status`)
      .set('Authorization', `Bearer ${classA.token}`)
      .send({ status: 'SUBMITTED' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/punishments/${punishment._id}/status`)
      .set('Authorization', `Bearer ${classB.token}`)
      .send({ status: 'SUBMITTED' })
      .expect(200);
  });

  it('GVCN đúng lớp sửa được số dòng (1-100)', async () => {
    const classA = await createClassAsHomeroom('gvcn.pun-e', '10P6');
    const studentId = await createStudent(classA.classId, classA.token, 'Học sinh E');
    const punishment = await punishmentModel.create({
      studentId,
      classId: classA.classId,
      kind: 'HOMEWORK_REPEAT',
      reason: 'test',
      lines: 20,
      dueDate: new Date(),
      triggerConductLogId: new Types.ObjectId(),
    });

    await request(app.getHttpServer())
      .patch(`/punishments/${punishment._id}/lines`)
      .set('Authorization', `Bearer ${classA.token}`)
      .send({ lines: 35 })
      .expect(200);
  });

  it('GET /classes/:classId/punishments lọc theo status', async () => {
    const classA = await createClassAsHomeroom('gvcn.pun-f', '10P7');
    const studentId = await createStudent(classA.classId, classA.token, 'Học sinh F');
    await punishmentModel.create({
      studentId,
      classId: classA.classId,
      kind: 'WEEKLY_THRESHOLD',
      reason: 'test',
      lines: 20,
      dueDate: new Date(),
      status: 'SUBMITTED',
      triggerConductLogId: new Types.ObjectId(),
    });

    const res = await request(app.getHttpServer())
      .get(`/classes/${classA.classId}/punishments?status=PENDING`)
      .set('Authorization', `Bearer ${classA.token}`)
      .expect(200);
    expect(res.body).toHaveLength(0);
  });
});
