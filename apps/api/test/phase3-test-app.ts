import { INestApplication, Provider, Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { ClassesController } from '../src/classes/classes.controller';
import { ClassesService } from '../src/classes/classes.service';
import { PositionGuard } from '../src/common/guards/position.guard';
import { PositionOwnerGuard } from '../src/common/guards/position-owner.guard';
import { Clock } from '../src/common/utils/clock';
import { APP_OPTIONS, configureApp } from '../src/configure-app';
import { PositionsController } from '../src/positions/positions.controller';
import { PositionsService } from '../src/positions/positions.service';
import { SchoolConfigService } from '../src/school-config/school-config.service';
import { SchoolYearsService } from '../src/school-years/school-years.service';
import { StudentsController } from '../src/students/students.controller';
import { StudentsService } from '../src/students/students.service';
import { buildTestMongoUri } from './build-test-mongo-uri';
import {
  FixedClock,
  PHASE3_SCHEMAS,
  Phase3Models,
  createFixedClock,
  getPhase3Models,
  initPhase3Models,
  seedSchoolYear,
} from './phase3-fixtures';

const DEFAULT_NOW = '2026-01-04T03:00:00Z';
const TEST_PASSWORD = 'MatKhau123';

export type Phase3Role = 'TEACHER' | 'ADMIN' | 'STUDENT';

export interface Phase3Session {
  token: string;
  userId: string;
}

export interface Phase3App {
  app: INestApplication;
  models: Phase3Models;
  clock: FixedClock;
  // Năm học `2025-2026` (2025-09-05..2026-05-31, isCurrent) đã seed sẵn; lớp tạo qua createClass thuộc năm này.
  schoolYearId: string;
  register(username: string, role?: Phase3Role): Promise<Phase3Session>;
  createClass(
    username: string,
    className: string,
  ): Promise<Phase3Session & { classId: string; code: string; homeroomPositionId: string }>;
  joinSubject(code: string, token: string, subject: string): Promise<string>;
  close(): Promise<void>;
}

export interface Phase3AppOptions {
  dbName: string;
  controllers: Type<unknown>[];
  providers: Provider[];
  // Mặc định Chủ Nhật 2026-01-04 (trước mọi ô 2026-01-05 của fixture); test cần giờ khác gọi `clock.set(iso)`.
  now?: string;
}

// Dựng app Nest RÚT GỌN (không phải AppModule thật) gồm phần nền xác thực/lớp/vị trí/học sinh + controller/provider
// của module đang test. AppModule thật được `app.module.e2e.spec.ts` kiểm riêng.
export async function createPhase3App(options: Phase3AppOptions): Promise<Phase3App> {
  const clock = createFixedClock(options.now ?? DEFAULT_NOW);

  const moduleRef = await Test.createTestingModule({
    imports: [
      MongooseModule.forRoot(buildTestMongoUri(options.dbName)),
      MongooseModule.forFeature(PHASE3_SCHEMAS),
      JwtModule.register({}),
      PassportModule,
    ],
    controllers: [AuthController, ClassesController, PositionsController, StudentsController, ...options.controllers],
    providers: [
      AuthService,
      JwtStrategy,
      SchoolYearsService,
      ClassesService,
      PositionsService,
      StudentsService,
      SchoolConfigService,
      PositionGuard,
      PositionOwnerGuard,
      Reflector,
      { provide: Clock, useValue: clock },
      ...options.providers,
    ],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS);
  // Đúng cấu hình của main.ts (CORS, cookie, giới hạn body, MongoExceptionFilter): lỗi Mongo lọt ra được map thành
  // 409/400, body quá lớn thành 413 thay vì 500 mặc định.
  configureApp(app);
  await app.init();

  const models = getPhase3Models(moduleRef);
  // Đợi collection + unique index build xong trước khi test chạy transaction.
  await initPhase3Models(models);
  const schoolYearId = await seedSchoolYear(models, {
    name: '2025-2026',
    start: '2025-09-05',
    end: '2026-05-31',
    isCurrent: true,
  });
  await models.schoolConfig.create({});

  const http = () => request(app.getHttpServer());

  async function register(username: string, role: Phase3Role = 'TEACHER'): Promise<Phase3Session> {
    const registerRes = await http()
      .post('/auth/register')
      .send({ username, password: TEST_PASSWORD, fullName: username });
    if (registerRes.status !== 201) {
      throw new Error(`register ${username} thất bại: ${registerRes.status} ${JSON.stringify(registerRes.body)}`);
    }
    if (role === 'TEACHER') {
      return { token: registerRes.body.accessToken as string, userId: registerRes.body.user.id as string };
    }
    // Đăng ký luôn ra TEACHER nên đổi role trực tiếp trong DB rồi đăng nhập lại để token mang role mới.
    await models.user.updateOne({ username }, { role });
    const loginRes = await http().post('/auth/login').send({ username, password: TEST_PASSWORD });
    if (loginRes.status !== 201) {
      throw new Error(`login ${username} thất bại: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
    }
    return { token: loginRes.body.accessToken as string, userId: loginRes.body.user.id as string };
  }

  async function createClass(username: string, className: string) {
    const session = await register(username);
    const classRes = await http()
      .post('/classes')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ name: className, claimHomeroom: true });
    if (classRes.status !== 201) {
      throw new Error(`tạo lớp ${className} thất bại: ${classRes.status} ${JSON.stringify(classRes.body)}`);
    }
    const classId = classRes.body.class._id as string;
    const homeroom = await models.position.findOne({ classId, type: 'HOMEROOM' });
    return {
      ...session,
      classId,
      code: classRes.body.class.code as string,
      homeroomPositionId: String(homeroom!._id),
    };
  }

  async function joinSubject(code: string, token: string, subject: string): Promise<string> {
    const joinRes = await http()
      .post('/positions/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ code, type: 'SUBJECT', subject });
    if (joinRes.status !== 201) {
      throw new Error(`nhận môn ${subject} của lớp ${code} thất bại: ${joinRes.status} ${JSON.stringify(joinRes.body)}`);
    }
    const klass = await models.klass.findOne({ code });
    const position = await models.position.findOne({ classId: klass!._id, type: 'SUBJECT', subject });
    return String(position!._id);
  }

  return {
    app,
    models,
    clock,
    schoolYearId,
    register,
    createClass,
    joinSubject,
    close: () => app.close(),
  };
}
