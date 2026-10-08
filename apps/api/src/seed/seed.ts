/**
 * Script seed cho môi trường dev: xoá sạch dữ liệu User/SchoolYear/Class/Position hiện có rồi tạo
 * lại 1 admin, 3 giáo viên mẫu, 1 năm học hiện hành, và 1 lớp "11A4" (gv1 làm GVCN).
 *
 * KHÔNG chạy script này trên môi trường có dữ liệu thật — mọi thứ trong 4 collection trên sẽ bị xoá.
 *
 * Chạy: pnpm --filter api run seed
 */
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as argon2 from 'argon2';
import { AppModule } from '../app.module';
import { User } from '../database/schemas/user.schema';
import { SchoolYear } from '../database/schemas/school-year.schema';
import { Class } from '../database/schemas/class.schema';
import { Position } from '../database/schemas/position.schema';
import { AuthService } from '../auth/auth.service';
import { SchoolYearsService } from '../school-years/school-years.service';
import { ClassesService } from '../classes/classes.service';

const SEED_PASSWORD = 'Seed@123456';

async function run() {
  if (process.env.NODE_ENV === 'production') {
    console.error(
      'Seed script bị chặn: NODE_ENV=production. Script này xoá sạch User/SchoolYear/Class/Position, ' +
        'không được chạy trên môi trường production.',
    );
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  try {
    const userModel = app.get<Model<User>>(getModelToken(User.name));
    const schoolYearModel = app.get<Model<SchoolYear>>(getModelToken(SchoolYear.name));
    const classModel = app.get<Model<Class>>(getModelToken(Class.name));
    const positionModel = app.get<Model<Position>>(getModelToken(Position.name));

    await Promise.all([
      userModel.deleteMany({}),
      schoolYearModel.deleteMany({}),
      classModel.deleteMany({}),
      positionModel.deleteMany({}),
    ]);

    const schoolYearsService = app.get(SchoolYearsService);
    await schoolYearsService.create({
      name: '2025-2026',
      isCurrent: true,
      startDate: new Date('2025-09-05'),
      endDate: new Date('2026-05-31'),
    });

    const adminPasswordHash = await argon2.hash(SEED_PASSWORD);
    await userModel.create({
      username: 'admin',
      passwordHash: adminPasswordHash,
      fullName: 'Quản trị viên',
      role: 'ADMIN',
    });

    const authService = app.get(AuthService);
    const teacherUsernames = ['gv1', 'gv2', 'gv3'];
    const teacherIds: Record<string, string> = {};
    for (const username of teacherUsernames) {
      const result = await authService.register({
        username,
        password: SEED_PASSWORD,
        fullName: `Giáo viên mẫu ${username.slice(2)}`,
      });
      teacherIds[username] = result.user.id;
    }

    const classesService = app.get(ClassesService);
    const { class: createdClass } = await classesService.create(teacherIds.gv1, {
      name: '11A4',
      claimHomeroom: true,
    });

    console.log('--- Seed hoàn tất ---');
    console.log(`Mật khẩu dùng chung cho mọi tài khoản seed: ${SEED_PASSWORD}`);
    console.log('Admin: username=admin');
    teacherUsernames.forEach((u) => console.log(`Giáo viên: username=${u}`));
    console.log(`Lớp 11A4 — mã lớp: ${createdClass.code} (gv1 là GVCN)`);
  } finally {
    await app.close();
  }
}

run().catch((err: Error) => {
  console.error('Seed thất bại:', err.message);
  console.error(err.stack);
  process.exitCode = 1;
});
