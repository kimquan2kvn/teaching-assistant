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
import { SchoolConfigController } from '../school-config/school-config.controller';
import { SchoolConfigService } from '../school-config/school-config.service';
import { PositionGuard } from '../common/guards/position.guard';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { ConductLogController } from './conduct-log.controller';
import { ClassConductController } from './class-conduct.controller';
import { ConductLogService } from './conduct-log.service';
import { buildTestMongoUri } from '../../test/build-test-mongo-uri';

describe('ConductLog punishment automation (e2e)', () => {
  let app: INestApplication;
  let positionModel: Model<Position>;
  let conductLogModel: Model<ConductLog>;
  let schoolConfigModel: Model<SchoolConfig>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(buildTestMongoUri('conduct_log_punishment_e2e')),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: SchoolYear.name, schema: SchoolYearSchema },
          { name: Class.name, schema: ClassSchema },
          { name: Position.name, schema: PositionSchema },
          { name: Student.name, schema: StudentSchema },
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
        SchoolConfigController,
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
        PositionGuard,
        PositionOwnerGuard,
        Reflector,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    positionModel = moduleRef.get(getModelToken(Position.name));
    conductLogModel = moduleRef.get(getModelToken(ConductLog.name));
    schoolConfigModel = moduleRef.get(getModelToken(SchoolConfig.name));

    const schoolYearModel = moduleRef.get(getModelToken(SchoolYear.name));
    await schoolYearModel.create({
      name: '2025-2026',
      isCurrent: true,
      startDate: new Date('2025-09-05'),
      endDate: new Date('2026-05-31'),
    });
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

  it('đủ ngưỡng vi phạm/tuần (mặc định 2) tự tạo đúng 1 Punishment WEEKLY_THRESHOLD, vi phạm thứ 3 không tạo thêm', async () => {
    const { token, classId } = await createClassAsHomeroom('gvcn.pun-a', '10P1');
    const homeroomId = await getHomeroomPositionId(classId);
    const studentId = await createStudent(classId, token, 'Học sinh A');

    const first = await request(app.getHttpServer())
      .post(`/positions/${homeroomId}/conduct-logs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId, kind: 'VIOLATION', points: 5, note: 'Lỗi 1' })
      .expect(201);
    expect(first.body.punishments).toHaveLength(0);

    const second = await request(app.getHttpServer())
      .post(`/positions/${homeroomId}/conduct-logs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId, kind: 'VIOLATION', points: 5, note: 'Lỗi 2' })
      .expect(201);
    expect(second.body.punishments).toHaveLength(1);
    expect(second.body.punishments[0].kind).toBe('WEEKLY_THRESHOLD');
    expect(second.body.punishments[0].lines).toBe(20);

    const third = await request(app.getHttpServer())
      .post(`/positions/${homeroomId}/conduct-logs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId, kind: 'VIOLATION', points: 5, note: 'Lỗi 3' })
      .expect(201);
    expect(third.body.punishments).toHaveLength(0);
  });

  it("rule 'Không làm BTVN' leo thang đúng 20/30/40/50 + cờ notifyParent từ lần 4, tính theo TOÀN lịch sử đúng catalogItemId (không lẫn vi phạm khác, không reset theo tuần)", async () => {
    const { token, classId } = await createClassAsHomeroom('gvcn.pun-b', '10P2');
    const homeroomId = await getHomeroomPositionId(classId);
    const studentId = await createStudent(classId, token, 'Học sinh B');
    const { token: adminToken } = await registerAndPromote('admin.pun-b', 'ADMIN');
    const catalogRes = await request(app.getHttpServer())
      .post('/conduct-catalog')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Không làm BTVN', kind: 'VIOLATION', points: 1, specialRule: 'HOMEWORK_NOT_DONE' })
      .expect(201);
    const catalogItemId = catalogRes.body._id as string;
    const decoyCatalogRes = await request(app.getHttpServer())
      .post('/conduct-catalog')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Lỗi khác (không phải BTVN)', kind: 'VIOLATION', points: 1 })
      .expect(201);
    const decoyCatalogItemId = decoyCatalogRes.body._id as string;

    // Ghi 1 vi phạm KHÁC trước — không được tính vào occurrence của rule BTVN (chứng minh đếm đúng theo
    // catalogItemId, không phải theo "bất kỳ vi phạm nào").
    await request(app.getHttpServer())
      .post(`/positions/${homeroomId}/conduct-logs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId, catalogItemId: decoyCatalogItemId })
      .expect(201);

    const expectedLines = [20, 30, 40, 50];
    for (let i = 0; i < 4; i++) {
      const res = await request(app.getHttpServer())
        .post(`/positions/${homeroomId}/conduct-logs`)
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId, catalogItemId })
        .expect(201);
      const homeworkPunishment = res.body.punishments.find((p: { kind: string }) => p.kind === 'HOMEWORK_REPEAT');
      expect(homeworkPunishment.lines).toBe(expectedLines[i]);
      expect(homeworkPunishment.notifyParent).toBe(i === 3);

      // Sau lần 1 và 2, "lùi" weekStart của 2 bản ghi BTVN vừa tạo về tuần trước — nếu sau này ai đó vô tình
      // thêm điều kiện lọc theo weekStart vào query đếm occurrence (reset theo tuần), lần 3/4 sẽ sai thành
      // 1/2 thay vì 3/4, test này sẽ bắt được ngay.
      if (i === 1) {
        const lastWeek = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        await conductLogModel.updateMany({ studentId, catalogItemId }, { weekStart: lastWeek });
      }
    }
  });

  it('2 request ghi vi phạm gần như đồng thời cho cùng học sinh/tuần chỉ tạo đúng 1 Punishment WEEKLY_THRESHOLD (xác nhận ở DB, không chỉ ở response)', async () => {
    const { token, classId } = await createClassAsHomeroom('gvcn.pun-c', '10P3');
    const homeroomId = await getHomeroomPositionId(classId);
    const studentId = await createStudent(classId, token, 'Học sinh C');
    await request(app.getHttpServer())
      .post(`/positions/${homeroomId}/conduct-logs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId, kind: 'VIOLATION', points: 5, note: 'Lỗi nền' });

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer())
        .post(`/positions/${homeroomId}/conduct-logs`)
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId, kind: 'VIOLATION', points: 5, note: 'Đồng thời A' }),
      request(app.getHttpServer())
        .post(`/positions/${homeroomId}/conduct-logs`)
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId, kind: 'VIOLATION', points: 5, note: 'Đồng thời B' }),
    ]);
    const totalCreated = resA.body.punishments.length + resB.body.punishments.length;
    expect(totalCreated).toBe(1);

    const punishmentModel = app.get(getModelToken(Punishment.name)) as Model<Punishment>;
    const countInDb = await punishmentModel.countDocuments({ studentId, kind: 'WEEKLY_THRESHOLD' });
    expect(countInDb).toBe(1);
  });

  it('thiếu SchoolConfig (vd quên chạy seed) → 404 rõ ràng, KHÔNG lưu ConductLog (tránh log mồ côi + client retry tạo trùng)', async () => {
    const { token, classId } = await createClassAsHomeroom('gvcn.pun-g', '10P8');
    const homeroomId = await getHomeroomPositionId(classId);
    const studentId = await createStudent(classId, token, 'Học sinh G');

    await schoolConfigModel.deleteMany({});
    try {
      await request(app.getHttpServer())
        .post(`/positions/${homeroomId}/conduct-logs`)
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId, kind: 'VIOLATION', points: 5, note: 'x' })
        .expect(404);

      const count = await conductLogModel.countDocuments({ studentId });
      expect(count).toBe(0);
    } finally {
      await schoolConfigModel.create({});
    }
  });

  it('ADMIN đổi weeklyViolationThreshold áp dụng ngay cho lần ghi ConductLog tiếp theo (không cache)', async () => {
    const { token, classId } = await createClassAsHomeroom('gvcn.pun-h', '10P9');
    const homeroomId = await getHomeroomPositionId(classId);
    const studentId = await createStudent(classId, token, 'Học sinh H');
    const { token: adminToken } = await registerAndPromote('admin.pun-h', 'ADMIN');

    await request(app.getHttpServer())
      .patch('/school-config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ weeklyViolationThreshold: 3 })
      .expect(200);

    try {
      const first = await request(app.getHttpServer())
        .post(`/positions/${homeroomId}/conduct-logs`)
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId, kind: 'VIOLATION', points: 5, note: 'Lỗi 1' })
        .expect(201);
      expect(first.body.punishments).toHaveLength(0);

      const second = await request(app.getHttpServer())
        .post(`/positions/${homeroomId}/conduct-logs`)
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId, kind: 'VIOLATION', points: 5, note: 'Lỗi 2' })
        .expect(201);
      expect(second.body.punishments).toHaveLength(0);

      const third = await request(app.getHttpServer())
        .post(`/positions/${homeroomId}/conduct-logs`)
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId, kind: 'VIOLATION', points: 5, note: 'Lỗi 3' })
        .expect(201);
      expect(third.body.punishments).toHaveLength(1);
    } finally {
      await request(app.getHttpServer())
        .patch('/school-config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ weeklyViolationThreshold: 2 });
    }
  });
});
