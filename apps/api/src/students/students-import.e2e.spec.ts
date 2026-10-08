import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { Model } from 'mongoose';
import ExcelJS from 'exceljs';
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

describe('Students import (e2e)', () => {
  let app: INestApplication;
  let studentModel: Model<Student>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(buildTestMongoUri('students_import_e2e')),
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
    studentModel = moduleRef.get(getModelToken(Student.name));

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

  async function setupClassWithHomeroom(username: string) {
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, password: 'MatKhau123', fullName: username });
    const token = registerRes.body.accessToken as string;
    const classRes = await request(app.getHttpServer())
      .post('/classes')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Lớp ${username}`, claimHomeroom: true });
    return { token, classId: classRes.body.class._id as string };
  }

  async function buildWorkbookBuffer(rows: Array<{ fullName: string; dob?: string }>): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Học sinh');
    sheet.addRow(['Họ và tên', 'Ngày sinh']);
    rows.forEach((r) => sheet.addRow([r.fullName, r.dob ?? '']));
    return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
  }

  it('preview: trả về danh sách dòng đã parse kèm lỗi, KHÔNG lưu vào DB', async () => {
    const { token, classId } = await setupClassWithHomeroom('gvcn.import');
    const buffer = await buildWorkbookBuffer([{ fullName: 'Học sinh 1' }, { fullName: '' }]);

    const res = await request(app.getHttpServer())
      .post(`/classes/${classId}/students/import-preview`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'hoc-sinh.xlsx')
      .expect(201);

    expect(res.body.rows).toHaveLength(2);
    expect(res.body.rows[0]).toMatchObject({ rowNumber: 2, fullName: 'Học sinh 1', errors: [] });
    expect(res.body.rows[1].errors.length).toBeGreaterThan(0);

    const count = await studentModel.countDocuments({ classId });
    expect(count).toBe(0);
  });

  it('confirm: nếu 1 dòng không hợp lệ thì KHÔNG lưu dòng nào (rollback toàn bộ)', async () => {
    const { token, classId } = await setupClassWithHomeroom('gvcn.import2');

    await request(app.getHttpServer())
      .post(`/classes/${classId}/students/import-confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ fullName: 'Hợp lệ' }, { fullName: '' }] })
      .expect(400);

    const count = await studentModel.countDocuments({ classId });
    expect(count).toBe(0);
  });

  it('confirm: toàn bộ dòng hợp lệ thì lưu hết trong 1 lần', async () => {
    const { token, classId } = await setupClassWithHomeroom('gvcn.import3');

    await request(app.getHttpServer())
      .post(`/classes/${classId}/students/import-confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ fullName: 'A' }, { fullName: 'B' }, { fullName: 'C' }] })
      .expect(201);

    const count = await studentModel.countDocuments({ classId });
    expect(count).toBe(3);
  });
});
