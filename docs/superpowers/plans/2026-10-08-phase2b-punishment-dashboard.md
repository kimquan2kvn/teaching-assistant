# Phase 2B — Chép phạt tự động, Cấu hình trường, Dashboard theo lớp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ghi 1 `ConductLog` đủ điều kiện sẽ tự động tạo `Punishment` (chép phạt) theo đúng 2 rule độc lập của
spec (ngưỡng vi phạm/tuần, và "Không làm BTVN" leo thang); GVCN xem/cập nhật trạng thái chép phạt của đúng lớp
mình; ADMIN cấu hình ngưỡng/hạn nộp toàn trường; dashboard gộp cả điểm danh/vi phạm/xếp loại/chép phạt thành 1
response theo lớp.

**Architecture:** Mở rộng trực tiếp `ConductLogService.create` của Phase 2A — bọc trong 1 transaction, sau khi
tạo `ConductLog` thì kiểm tra 2 điều kiện độc lập và tạo `Punishment` tương ứng nếu đạt. Rule theo tuần dùng
unique index `(studentId, weekStart)` (chỉ áp cho `kind: 'WEEKLY_THRESHOLD'`) để chống tạo trùng khi có nhiều
vi phạm cùng tuần — bắt lỗi `11000` và coi là "đã tồn tại, bỏ qua", KHÔNG dùng query-rồi-check vì không chống
được race condition. `PunishmentsService` tra `classId` trực tiếp từ chính `Punishment` (không có `classId`
trên URL để tin nhầm) rồi tự kiểm tra người gọi có phải GVCN đúng lớp đó không — cùng nguyên tắc IDOR đã áp
dụng cho `StudentsService` ở Phase 1.

**Tech Stack:** NestJS + Mongoose (đã có), zod (`packages/shared`), Jest + `mongodb-memory-server` (đã có hạ
tầng).

**Spec:** [docs/superpowers/specs/2026-10-08-phase2-attendance-conduct-design.md](../specs/2026-10-08-phase2-attendance-conduct-design.md)
— phần "Chép phạt tự động", "Cấu hình trường", "Dashboard theo lớp". Kế thừa toàn bộ
[Phase 2A](2026-10-08-phase2a-attendance-conduct.md) (đã hoàn thành — xem ledger
`.superpowers/sdd/2026-10-08-phase2a-attendance-conduct/progress.md` để biết ruling/bug đã sửa trước khi bắt
đầu plan này).

## Global Constraints

- Mọi `@Prop({ type: ... })` tham chiếu ObjectId dùng `MongooseSchema.Types.ObjectId` (xem lý do ở Global
  Constraints của Phase 2A).
- Mọi module mới tự `imports: [DatabaseModule]`.
- Lỗi nghiệp vụ trả tiếng Việt thân thiện.
- Rule theo tuần dùng `>= weeklyViolationThreshold` (không phải `===`) khi quyết định có thử tạo `Punishment`
  hay không — tính đúng-đắn thật sự đến từ unique index + bắt lỗi `11000`, điều kiện `>=` chỉ là tối ưu để
  không thử tạo ở mọi vi phạm xa ngưỡng; dùng `===` có thể bỏ sót nếu đếm bị lệch do race condition giữa 2
  request ghi gần như đồng thời.
- Số dòng chép phạt mặc định cho rule theo tuần (`WEEKLY_THRESHOLD`) lấy từ `SchoolConfig.defaultWeeklyPunishmentLines`
  (mặc định 20) — yêu cầu gốc không cho công thức tính số dòng cho rule này (chỉ có công thức cho rule "Không
  làm BTVN"), xem `docs/ASSUMPTIONS.md` mục "Phase 2". GV sửa được sau qua
  `PATCH /punishments/:id/lines`.

## Review Focus

- Nhiều vi phạm ghi gần như đồng thời (2 giáo viên khác nhau của cùng lớp cùng ghi vi phạm cho cùng 1 học sinh
  trong cùng tuần) không được tạo ra 2 `Punishment` loại `WEEKLY_THRESHOLD` cho cùng 1 tuần — nếu chỉ dựa vào
  query-đếm-rồi-check mà không có unique index, race condition sẽ tạo trùng. → test ở Task 4 (giả lập 2 request
  đồng thời, giống bài test race condition "nhận vị trí" ở Phase 1A).
- Rule "Không làm BTVN" phải tính số lần theo ĐÚNG catalog item đó (không lẫn với vi phạm khác), và phải đếm
  TOÀN THỜI GIAN (không reset theo tuần) — nếu đếm nhầm theo tuần, 1 học sinh lặp lỗi này 4 tuần liên tiếp (mỗi
  tuần 1 lần) sẽ luôn chỉ ra 20 dòng thay vì leo thang đúng 20/30/40/50. → test ở Task 4.
- GVCN lớp A không được cập nhật trạng thái/số dòng chép phạt của học sinh lớp B dù biết đúng `id` chép phạt (so
  sánh IDOR tương tự Phase 1's Students) — nếu `PunishmentsService` tin route param thay vì tự tra `classId` từ
  chính bản ghi, lỗ hổng này sẽ lộ. → test ở Task 5.
- `SchoolConfig` sửa `weeklyViolationThreshold` phải ảnh hưởng ngay lần ghi `ConductLog` tiếp theo (không cache
  giá trị cũ) — nếu đọc config 1 lần lúc khởi động thay vì mỗi lần tạo `ConductLog`, đổi cấu hình giữa chừng sẽ
  không có tác dụng cho tới khi restart server. → test ở Task 2, Task 4.
- Dashboard không được lộ dữ liệu của lớp khác khi gọi với `classId` của lớp mình nhưng cố query thêm tham số lạ
  — tất cả sub-service bên trong dashboard (`attendance`, `conduct-log`, `punishments`) đều PHẢI nhận đúng
  `classId` từ route, không có tham số nào khác có thể ghi đè. → test ở Task 6.

---

## Task 1: `packages/shared` — zod schema chép phạt + cấu hình trường

**Files:**
- Create: `packages/shared/src/schemas/punishment.schema.ts`
- Create: `packages/shared/src/schemas/punishment.schema.test.ts`
- Create: `packages/shared/src/schemas/school-config.schema.ts`
- Create: `packages/shared/src/schemas/school-config.schema.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `punishmentStatusEnum`/`PunishmentStatus`, `updatePunishmentStatusSchema`/
  `UpdatePunishmentStatusInput`, `updatePunishmentLinesSchema`/`UpdatePunishmentLinesInput`,
  `updateSchoolConfigSchema`/`UpdateSchoolConfigInput` — Task 2 (SchoolConfig) và Task 5 (Punishments) dùng qua
  `ZodValidationPipe`.

- [ ] **Step 1: Viết test trước — `packages/shared/src/schemas/punishment.schema.test.ts`**

```ts
import { updatePunishmentStatusSchema, updatePunishmentLinesSchema } from './punishment.schema';

describe('updatePunishmentStatusSchema', () => {
  it('chỉ chấp nhận đúng 3 giá trị trạng thái', () => {
    expect(updatePunishmentStatusSchema.safeParse({ status: 'SUBMITTED' }).success).toBe(true);
    expect(updatePunishmentStatusSchema.safeParse({ status: 'DONE' }).success).toBe(false);
  });
});

describe('updatePunishmentLinesSchema', () => {
  it('giới hạn 1-100 dòng', () => {
    expect(updatePunishmentLinesSchema.safeParse({ lines: 1 }).success).toBe(true);
    expect(updatePunishmentLinesSchema.safeParse({ lines: 100 }).success).toBe(true);
    expect(updatePunishmentLinesSchema.safeParse({ lines: 0 }).success).toBe(false);
    expect(updatePunishmentLinesSchema.safeParse({ lines: 101 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Implement `packages/shared/src/schemas/punishment.schema.ts`**

```ts
import { z } from 'zod';

export const punishmentStatusEnum = z.enum(['PENDING', 'SUBMITTED', 'LATE']);
export type PunishmentStatus = z.infer<typeof punishmentStatusEnum>;

export const updatePunishmentStatusSchema = z.object({ status: punishmentStatusEnum });
export type UpdatePunishmentStatusInput = z.infer<typeof updatePunishmentStatusSchema>;

export const updatePunishmentLinesSchema = z.object({ lines: z.number().int().min(1).max(100) });
export type UpdatePunishmentLinesInput = z.infer<typeof updatePunishmentLinesSchema>;
```

- [ ] **Step 4: Chạy test — xác nhận PASS**

- [ ] **Step 5: Viết test trước — `packages/shared/src/schemas/school-config.schema.test.ts`**

```ts
import { updateSchoolConfigSchema } from './school-config.schema';

describe('updateSchoolConfigSchema', () => {
  it('mọi field đều tuỳ chọn, trong giới hạn hợp lý', () => {
    expect(updateSchoolConfigSchema.safeParse({}).success).toBe(true);
    expect(updateSchoolConfigSchema.safeParse({ weeklyViolationThreshold: 3 }).success).toBe(true);
    expect(updateSchoolConfigSchema.safeParse({ weeklyViolationThreshold: 0 }).success).toBe(false);
    expect(updateSchoolConfigSchema.safeParse({ defaultPunishmentDueDays: 31 }).success).toBe(false);
  });
});
```

- [ ] **Step 6: Chạy test — xác nhận FAIL**

- [ ] **Step 7: Implement `packages/shared/src/schemas/school-config.schema.ts`**

```ts
import { z } from 'zod';

export const updateSchoolConfigSchema = z.object({
  weeklyViolationThreshold: z.number().int().min(1).max(50).optional(),
  defaultPunishmentDueDays: z.number().int().min(1).max(30).optional(),
  defaultWeeklyPunishmentLines: z.number().int().min(1).max(100).optional(),
});
export type UpdateSchoolConfigInput = z.infer<typeof updateSchoolConfigSchema>;
```

- [ ] **Step 8: Chạy test — xác nhận PASS**

- [ ] **Step 9: Export từ `packages/shared/src/index.ts`**

```ts
export * from './schemas/punishment.schema';
export * from './schemas/school-config.schema';
```

- [ ] **Step 10: Chạy toàn bộ test `packages/shared` — xác nhận PASS**

- [ ] **Step 11: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): add punishment and school-config zod DTOs"
```

---

## Task 2: `apps/api` — `SchoolConfigModule`

**Files:**
- Create: `apps/api/src/database/schemas/school-config.schema.ts`
- Create: `apps/api/src/school-config/school-config.service.ts`
- Create: `apps/api/src/school-config/school-config.controller.ts`
- Create: `apps/api/src/school-config/school-config.module.ts`
- Create: `apps/api/src/school-config/school-config.e2e.spec.ts`
- Modify: `apps/api/src/database/database.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `updateSchoolConfigSchema`/`UpdateSchoolConfigInput` (Task 1).
- Produces: `SchoolConfig` schema (`weeklyViolationThreshold, defaultPunishmentDueDays,
  defaultWeeklyPunishmentLines`), `SchoolConfigService.getConfig(): Promise<SchoolConfig>` (throw
  `NotFoundException` nếu chưa seed — nhất quán với `SchoolYearsService.getCurrent()` của Phase 1),
  `.update(input): Promise<SchoolConfig>` — Task 4 (`ConductLogService`) gọi `getConfig()` mỗi lần tạo
  `ConductLog` (KHÔNG cache) để luôn dùng giá trị mới nhất.

- [ ] **Step 1: Implement `apps/api/src/database/schemas/school-config.schema.ts`**

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class SchoolConfig extends Document {
  @Prop({ required: true, default: 2 })
  weeklyViolationThreshold: number;

  @Prop({ required: true, default: 2 })
  defaultPunishmentDueDays: number;

  @Prop({ required: true, default: 20 })
  defaultWeeklyPunishmentLines: number;
}

export const SchoolConfigSchema = SchemaFactory.createForClass(SchoolConfig);
```

- [ ] **Step 2: Đăng ký schema trong `apps/api/src/database/database.module.ts`**

- [ ] **Step 3: Viết test trước — `apps/api/src/school-config/school-config.e2e.spec.ts`**

```ts
it('TEACHER đọc được config nhưng không sửa được (403); ADMIN sửa được, giá trị áp dụng ngay', async () => {
  const { token: teacherToken } = await registerAndPromote('gv.cfg-a', 'TEACHER');
  const { token: adminToken } = await registerAndPromote('admin.cfg-a', 'ADMIN');

  const initial = await request(app.getHttpServer())
    .get('/school-config')
    .set('Authorization', `Bearer ${teacherToken}`)
    .expect(200);
  expect(initial.body.weeklyViolationThreshold).toBe(2);

  await request(app.getHttpServer())
    .patch('/school-config')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ weeklyViolationThreshold: 5 })
    .expect(403);

  await request(app.getHttpServer())
    .patch('/school-config')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ weeklyViolationThreshold: 5 })
    .expect(200);

  const after = await request(app.getHttpServer())
    .get('/school-config')
    .set('Authorization', `Bearer ${teacherToken}`)
    .expect(200);
  expect(after.body.weeklyViolationThreshold).toBe(5);
});
```

(`beforeAll` của file test này tự tạo sẵn 1 `SchoolConfig` mặc định qua
`moduleRef.get(getModelToken(SchoolConfig.name)).create({})` — mô phỏng đúng việc seed script sẽ làm ở Task 7,
vì `getConfig()` throw nếu chưa có bản ghi nào.)

- [ ] **Step 4: Chạy test — xác nhận FAIL**

- [ ] **Step 5: Implement `apps/api/src/school-config/school-config.service.ts`**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SchoolConfig } from '../database/schemas/school-config.schema';
import type { UpdateSchoolConfigInput } from '@so-chu-nhiem/shared';

@Injectable()
export class SchoolConfigService {
  constructor(@InjectModel(SchoolConfig.name) private readonly schoolConfigModel: Model<SchoolConfig>) {}

  async getConfig(): Promise<SchoolConfig> {
    const config = await this.schoolConfigModel.findOne().exec();
    if (!config) {
      throw new NotFoundException('Chưa có cấu hình trường, vui lòng chạy seed hoặc tạo cấu hình trước');
    }
    return config;
  }

  async update(input: UpdateSchoolConfigInput): Promise<SchoolConfig> {
    const config = await this.getConfig();
    if (input.weeklyViolationThreshold !== undefined) config.weeklyViolationThreshold = input.weeklyViolationThreshold;
    if (input.defaultPunishmentDueDays !== undefined) config.defaultPunishmentDueDays = input.defaultPunishmentDueDays;
    if (input.defaultWeeklyPunishmentLines !== undefined)
      config.defaultWeeklyPunishmentLines = input.defaultWeeklyPunishmentLines;
    await config.save();
    return config;
  }
}
```

- [ ] **Step 6: Implement `apps/api/src/school-config/school-config.controller.ts`**

```ts
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { updateSchoolConfigSchema } from '@so-chu-nhiem/shared';
import type { UpdateSchoolConfigInput } from '@so-chu-nhiem/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SchoolConfigService } from './school-config.service';

@Controller('school-config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TEACHER', 'ADMIN')
export class SchoolConfigController {
  constructor(private readonly schoolConfigService: SchoolConfigService) {}

  @Get()
  async get() {
    return this.schoolConfigService.getConfig();
  }

  @Patch()
  @Roles('ADMIN')
  async update(@Body(new ZodValidationPipe(updateSchoolConfigSchema)) body: UpdateSchoolConfigInput) {
    return this.schoolConfigService.update(body);
  }
}
```

- [ ] **Step 7: Implement `apps/api/src/school-config/school-config.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SchoolConfigService } from './school-config.service';
import { SchoolConfigController } from './school-config.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [SchoolConfigController],
  providers: [SchoolConfigService],
  exports: [SchoolConfigService],
})
export class SchoolConfigModule {}
```

- [ ] **Step 8: Thêm `SchoolConfigModule` vào `apps/api/src/app.module.ts`**

- [ ] **Step 9: Chạy test — xác nhận PASS**

- [ ] **Step 10: Lint + build + chạy toàn bộ test `api`**

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/database apps/api/src/school-config apps/api/src/app.module.ts
git commit -m "feat(api): add SchoolConfigModule for weekly threshold and punishment defaults"
```

---

## Task 3: `apps/api` — schema `Punishment`

**Files:**
- Create: `apps/api/src/database/schemas/punishment.schema.ts`
- Modify: `apps/api/src/database/database.module.ts`

**Interfaces:**
- Produces: `Punishment` (`studentId, classId, kind ('WEEKLY_THRESHOLD'|'HOMEWORK_REPEAT'), reason, lines,
  dueDate, status, notifyParent, triggerConductLogId, weekStart?`), `PunishmentKind` type — Task 4 (tạo tự động),
  Task 5 (`PunishmentsService`) dùng Model này.

- [ ] **Step 1: Implement `apps/api/src/database/schemas/punishment.schema.ts`**

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { PunishmentStatus } from '@so-chu-nhiem/shared';

export type PunishmentKind = 'WEEKLY_THRESHOLD' | 'HOMEWORK_REPEAT';

@Schema({ timestamps: true })
export class Punishment extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Class', required: true })
  classId: Types.ObjectId;

  @Prop({ required: true, enum: ['WEEKLY_THRESHOLD', 'HOMEWORK_REPEAT'] })
  kind: PunishmentKind;

  @Prop({ required: true })
  reason: string;

  @Prop({ required: true })
  lines: number;

  @Prop({ required: true })
  dueDate: Date;

  @Prop({ required: true, enum: ['PENDING', 'SUBMITTED', 'LATE'], default: 'PENDING' })
  status: PunishmentStatus;

  @Prop({ default: false })
  notifyParent: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ConductLog', required: true })
  triggerConductLogId: Types.ObjectId;

  @Prop({ default: null })
  weekStart: Date | null;
}

export const PunishmentSchema = SchemaFactory.createForClass(Punishment);
PunishmentSchema.index(
  { studentId: 1, weekStart: 1 },
  { unique: true, partialFilterExpression: { kind: 'WEEKLY_THRESHOLD' } },
);
```

- [ ] **Step 2: Đăng ký schema trong `apps/api/src/database/database.module.ts`**

- [ ] **Step 3: Build xác nhận không lỗi type** (`pnpm --filter api run build`)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/database
git commit -m "feat(api): add Punishment schema with race-safe weekly-threshold unique index"
```

---

## Task 4: `apps/api` — tự động tạo chép phạt trong `ConductLogService.create`

**Files:**
- Modify: `apps/api/src/conduct-log/conduct-log.service.ts` (method `create`, xem Interfaces của Phase 2A Task 7)
- Modify: `apps/api/src/conduct-log/conduct-log.module.ts` (thêm import `SchoolConfigModule`, inject
  `Punishment` model)
- Modify: `apps/api/src/common/utils/date.ts` (thêm `addDays`)
- Modify: `apps/api/src/common/utils/date.spec.ts` (test cho `addDays`)
- Create: `apps/api/src/conduct-log/conduct-log-punishment.e2e.spec.ts`

**Interfaces:**
- Consumes: `SchoolConfigService.getConfig()` (Task 2), `Punishment` model (Task 3),
  `HOMEWORK_NOT_DONE_LINES_BY_OCCURRENCE` (Phase 2A Task 1).
- Produces (signature mới của method đã có từ Phase 2A):
  `ConductLogService.create(position: Position, input: CreateConductLogInput, recordedBy: string):
  Promise<{ conductLog: ConductLog; punishments: Punishment[] }>` — Task 5 không tiêu thụ trực tiếp, nhưng
  `ConductLogController.create` (đã có từ Phase 2A) phải trả nguyên object này (không unwrap) để FE biết có
  chép phạt mới hay không.

- [ ] **Step 1: Thêm `addDays` vào `apps/api/src/common/utils/date.ts`**

```ts
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
```

Test tương ứng trong `date.spec.ts`:

```ts
it('addDays cộng đúng số ngày kể cả qua ranh giới tháng', () => {
  expect(addDays(new Date('2026-01-30T00:00:00.000Z'), 2).toISOString()).toBe('2026-02-01T00:00:00.000Z');
});
```

- [ ] **Step 2: Chạy test `date.spec.ts` — xác nhận PASS**

- [ ] **Step 3: Viết test trước — `apps/api/src/conduct-log/conduct-log-punishment.e2e.spec.ts`**

(Khuôn mẫu giống `conduct-log.e2e.spec.ts` của Phase 2A, thêm `SchoolConfigModule`/`SchoolConfigService`/
`SchoolConfig` model vào module test, tạo sẵn 1 `SchoolConfig` mặc định trong `beforeAll`.)

```ts
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
  expect(second.body.punishments[0].lines).toBe(20); // defaultWeeklyPunishmentLines

  const third = await request(app.getHttpServer())
    .post(`/positions/${homeroomId}/conduct-logs`)
    .set('Authorization', `Bearer ${token}`)
    .send({ studentId, kind: 'VIOLATION', points: 5, note: 'Lỗi 3' })
    .expect(201);
  expect(third.body.punishments).toHaveLength(0); // đã tạo rồi, không tạo thêm trong cùng tuần
});

it("rule 'Không làm BTVN' leo thang đúng 20/30/40/50 + cờ notifyParent từ lần 4", async () => {
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
  }
});

it('2 request ghi vi phạm gần như đồng thời cho cùng học sinh/tuần chỉ tạo đúng 1 Punishment WEEKLY_THRESHOLD', async () => {
  const { token, classId } = await createClassAsHomeroom('gvcn.pun-c', '10P3');
  const homeroomId = await getHomeroomPositionId(classId);
  const studentId = await createStudent(classId, token, 'Học sinh C');
  // Ghi trước 1 vi phạm để lần ghi tiếp theo (đồng thời) đều đạt ngưỡng 2.
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
});
```

- [ ] **Step 4: Chạy test — xác nhận FAIL**

- [ ] **Step 5: Modify `apps/api/src/conduct-log/conduct-log.service.ts`**

Thêm constructor params `@InjectConnection() private readonly connection: Connection`,
`@InjectModel(Punishment.name) private readonly punishmentModel: Model<Punishment>`,
`private readonly schoolConfigService: SchoolConfigService`. Viết lại `create`:

```ts
async create(
  position: Position,
  input: CreateConductLogInput,
  recordedBy: string,
): Promise<{ conductLog: ConductLog; punishments: Punishment[] }> {
  const session = await this.connection.startSession();
  try {
    let conductLog!: ConductLog;
    const punishments: Punishment[] = [];
    await session.withTransaction(async () => {
      const date = new Date();
      const weekStart = getIsoWeekStart(date);
      const doc: Partial<ConductLog> = {
        classId: position.classId,
        positionId: position._id,
        date,
        weekStart,
        recordedBy: recordedBy as unknown as ConductLog['recordedBy'],
        note: input.note,
        studentId: input.studentId as unknown as ConductLog['studentId'],
      };
      let specialRule: ConductSpecialRule | null = null;
      if ('catalogItemId' in input) {
        const item = await this.catalogService.findByIdOrThrow(input.catalogItemId);
        doc.catalogItemId = item._id as unknown as ConductLog['catalogItemId'];
        doc.points = item.kind === 'VIOLATION' ? -item.points : item.points;
        specialRule = item.specialRule;
      } else {
        doc.catalogItemId = null;
        doc.points = input.kind === 'VIOLATION' ? -input.points : input.points;
      }
      const [created] = await this.conductLogModel.create([doc], { session });
      conductLog = created;

      const config = await this.schoolConfigService.getConfig();

      if (created.points < 0) {
        const violationCount = await this.conductLogModel
          .countDocuments({ studentId: created.studentId, weekStart, points: { $lt: 0 } })
          .session(session);
        if (violationCount >= config.weeklyViolationThreshold) {
          try {
            const [p] = await this.punishmentModel.create(
              [
                {
                  studentId: created.studentId,
                  classId: created.classId,
                  kind: 'WEEKLY_THRESHOLD',
                  reason: `Đủ ${config.weeklyViolationThreshold} vi phạm trong tuần`,
                  lines: config.defaultWeeklyPunishmentLines,
                  dueDate: addDays(date, config.defaultPunishmentDueDays),
                  triggerConductLogId: created._id,
                  weekStart,
                },
              ],
              { session },
            );
            punishments.push(p);
          } catch (err) {
            if ((err as { code?: number })?.code !== 11000) throw err;
          }
        }
      }

      if (specialRule === 'HOMEWORK_NOT_DONE') {
        const occurrence = await this.conductLogModel
          .countDocuments({ studentId: created.studentId, catalogItemId: created.catalogItemId })
          .session(session);
        const idx = Math.min(occurrence, HOMEWORK_NOT_DONE_LINES_BY_OCCURRENCE.length) - 1;
        const lines = HOMEWORK_NOT_DONE_LINES_BY_OCCURRENCE[idx];
        const notifyParent = occurrence >= HOMEWORK_NOT_DONE_LINES_BY_OCCURRENCE.length;
        const [p] = await this.punishmentModel.create(
          [
            {
              studentId: created.studentId,
              classId: created.classId,
              kind: 'HOMEWORK_REPEAT',
              reason: `Không làm bài tập về nhà (lần ${occurrence})`,
              lines,
              notifyParent,
              dueDate: addDays(date, config.defaultPunishmentDueDays),
              triggerConductLogId: created._id,
            },
          ],
          { session },
        );
        punishments.push(p);
      }
    });
    return { conductLog, punishments };
  } finally {
    await session.endSession();
  }
}
```

- [ ] **Step 6: Modify `apps/api/src/conduct-log/conduct-log.module.ts`** — thêm `SchoolConfigModule` vào
  `imports`, `Punishment`/`Connection` đã sẵn có qua `DatabaseModule`/`@InjectConnection`.

- [ ] **Step 7: Chạy test — xác nhận PASS**

- [ ] **Step 8: Lint + build + chạy toàn bộ test `api`**

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/conduct-log apps/api/src/common/utils
git commit -m "feat(api): auto-generate punishments on weekly threshold and homework-repeat rules"
```

---

## Task 5: `apps/api` — `PunishmentsModule`

**Files:**
- Create: `apps/api/src/punishments/punishments.service.ts`
- Create: `apps/api/src/punishments/punishments.controller.ts`
- Create: `apps/api/src/punishments/punishments.module.ts`
- Create: `apps/api/src/punishments/punishments.e2e.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `updatePunishmentStatusSchema`/`updatePunishmentLinesSchema` (Task 1), `Punishment` model (Task 3).
- Produces: `PunishmentsService.listByClass(classId: string, filter?: { status?: PunishmentStatus }):
  Promise<Punishment[]>`, `.updateStatus(id: string, status: PunishmentStatus, user: {id:string; role:string}):
  Promise<Punishment>`, `.updateLines(id: string, lines: number, user: {id:string; role:string}):
  Promise<Punishment>` — Task 6 (`DashboardService`) gọi `.listByClass(classId, {status: 'PENDING'})`.

- [ ] **Step 1: Viết test trước — `apps/api/src/punishments/punishments.e2e.spec.ts`**

(Khuôn mẫu đầy đủ như các module trước; copy lại helper `createClassAsHomeroom`/`registerAndPromote`/
`createStudent` từ Phase 2A Task 5 (`attendance.e2e.spec.ts`). Cần tạo được `Punishment` trực tiếp qua model
trong test thay vì chờ tự động sinh, để test tập trung vào IDOR/phân quyền của chính `PunishmentsModule`, không
phụ thuộc Task 4.)

```ts
it('GVCN lớp A không cập nhật được chép phạt của học sinh lớp B dù biết đúng id', async () => {
  const classA = await createClassAsHomeroom('gvcn.pun-d1', '10P4');
  const classB = await createClassAsHomeroom('gvcn.pun-d2', '10P5');
  const studentB = await createStudent(classB.classId, classB.token, 'Học sinh B');
  const punishmentModel = app.get(getModelToken(Punishment.name)) as Model<Punishment>;
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
  const punishmentModel = app.get(getModelToken(Punishment.name)) as Model<Punishment>;
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
  const punishmentModel = app.get(getModelToken(Punishment.name)) as Model<Punishment>;
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
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Implement `apps/api/src/punishments/punishments.service.ts`**

```ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Punishment } from '../database/schemas/punishment.schema';
import { Position } from '../database/schemas/position.schema';
import type { PunishmentStatus } from '@so-chu-nhiem/shared';

@Injectable()
export class PunishmentsService {
  constructor(
    @InjectModel(Punishment.name) private readonly punishmentModel: Model<Punishment>,
    @InjectModel(Position.name) private readonly positionModel: Model<Position>,
  ) {}

  async listByClass(classId: string, filter?: { status?: PunishmentStatus }): Promise<Punishment[]> {
    const query: Record<string, unknown> = { classId };
    if (filter?.status) query.status = filter.status;
    return this.punishmentModel.find(query).sort({ dueDate: 1 }).exec();
  }

  async updateStatus(id: string, status: PunishmentStatus, user: { id: string; role: string }): Promise<Punishment> {
    const punishment = await this.findOrThrowWithAccess(id, user);
    punishment.status = status;
    await punishment.save();
    return punishment;
  }

  async updateLines(id: string, lines: number, user: { id: string; role: string }): Promise<Punishment> {
    const punishment = await this.findOrThrowWithAccess(id, user);
    punishment.lines = lines;
    await punishment.save();
    return punishment;
  }

  // Không có classId trên URL (chỉ có :id của chính Punishment) — phải tự tra classId từ bản ghi rồi kiểm tra
  // người gọi có phải GVCN đúng lớp đó không, không được tin bất kỳ tham số nào từ request.
  private async findOrThrowWithAccess(id: string, user: { id: string; role: string }): Promise<Punishment> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy chép phạt này');
    }
    const punishment = await this.punishmentModel.findById(id).exec();
    if (!punishment) {
      throw new NotFoundException('Không tìm thấy chép phạt này');
    }
    if (user.role === 'ADMIN') return punishment;

    const homeroom = await this.positionModel.findOne({ classId: punishment.classId, type: 'HOMEROOM' }).exec();
    if (!homeroom?.holderId || String(homeroom.holderId) !== user.id) {
      throw new ForbiddenException('Chỉ GVCN của lớp này mới cập nhật được chép phạt');
    }
    return punishment;
  }
}
```

- [ ] **Step 4: Implement `apps/api/src/punishments/punishments.controller.ts`**

```ts
import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { updatePunishmentStatusSchema, updatePunishmentLinesSchema } from '@so-chu-nhiem/shared';
import type { UpdatePunishmentStatusInput, UpdatePunishmentLinesInput } from '@so-chu-nhiem/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PunishmentsService } from './punishments.service';

@Controller('punishments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TEACHER', 'ADMIN')
export class PunishmentsController {
  constructor(private readonly punishmentsService: PunishmentsService) {}

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePunishmentStatusSchema)) body: UpdatePunishmentStatusInput,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.punishmentsService.updateStatus(id, body.status, user);
  }

  @Patch(':id/lines')
  async updateLines(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePunishmentLinesSchema)) body: UpdatePunishmentLinesInput,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.punishmentsService.updateLines(id, body.lines, user);
  }
}
```

- [ ] **Step 5: Implement `apps/api/src/punishments/class-punishments.controller.ts`**

```ts
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import type { PunishmentStatus } from '@so-chu-nhiem/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PositionGuard } from '../common/guards/position.guard';
import { RequirePosition } from '../common/decorators/require-position.decorator';
import { PunishmentsService } from './punishments.service';

@Controller('classes/:classId/punishments')
@UseGuards(JwtAuthGuard, RolesGuard, PositionGuard)
export class ClassPunishmentsController {
  constructor(private readonly punishmentsService: PunishmentsService) {}

  @Get()
  @RequirePosition('ANY')
  async list(@Param('classId') classId: string, @Query('status') status?: PunishmentStatus) {
    return this.punishmentsService.listByClass(classId, { status });
  }
}
```

- [ ] **Step 6: Implement `apps/api/src/punishments/punishments.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PunishmentsService } from './punishments.service';
import { PunishmentsController } from './punishments.controller';
import { ClassPunishmentsController } from './class-punishments.controller';
import { PositionGuard } from '../common/guards/position.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [PunishmentsController, ClassPunishmentsController],
  providers: [PunishmentsService, PositionGuard],
  exports: [PunishmentsService],
})
export class PunishmentsModule {}
```

- [ ] **Step 7: Thêm `PunishmentsModule` vào `apps/api/src/app.module.ts`**

- [ ] **Step 8: Chạy test — xác nhận PASS**

- [ ] **Step 9: Lint + build + chạy toàn bộ test `api`**

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/punishments apps/api/src/app.module.ts
git commit -m "feat(api): add PunishmentsModule with class-scoped list and IDOR-safe updates"
```

---

## Task 6: `apps/api` — `DashboardModule`

**Files:**
- Create: `apps/api/src/dashboard/dashboard.service.ts`
- Create: `apps/api/src/dashboard/dashboard.controller.ts`
- Create: `apps/api/src/dashboard/dashboard.module.ts`
- Create: `apps/api/src/dashboard/dashboard.e2e.spec.ts`
- Modify: `apps/api/src/attendance/attendance.module.ts` (thêm `exports: [AttendanceService]` — Phase 2A chưa
  export vì chưa module nào khác cần dùng)
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `AttendanceService.getClassSummary` (Phase 2A Task 5), `ConductLogService.listByClass`/
  `.getWeeklyRating` (Phase 2A Task 7), `PunishmentsService.listByClass` (Task 5).
- Produces: `DashboardService.getClassDashboard(classId: string, dateStr: string): Promise<{
  attendanceSummary: Record<AttendanceStatus, number>; recentConductLogs: ConductLog[]; conductRating:
  Array<{studentId:string; score:number; label:string}>; pendingPunishments: Punishment[] }>` — không task nào
  khác tiêu thụ, đây là endpoint cuối của Phase 2.

- [ ] **Step 1: Viết test trước — `apps/api/src/dashboard/dashboard.e2e.spec.ts`**

(Copy lại helper `createClassAsHomeroom`/`registerAndPromote`/`getHomeroomPositionId`/`createStudent` từ Phase
2A Task 5.)

```ts
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
```

(`todayStr()` là helper cục bộ `() => new Date().toISOString().slice(0, 10)` — dashboard test không hard-code
ngày để không phụ thuộc thời điểm chạy CI, giống ghi chú ở Phase 2A Task 7.)

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Implement `apps/api/src/dashboard/dashboard.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { AttendanceService } from '../attendance/attendance.service';
import { ConductLogService } from '../conduct-log/conduct-log.service';
import { PunishmentsService } from '../punishments/punishments.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly conductLogService: ConductLogService,
    private readonly punishmentsService: PunishmentsService,
  ) {}

  async getClassDashboard(classId: string, dateStr: string) {
    const [attendanceSummary, recentConductLogs, conductRating, pendingPunishments] = await Promise.all([
      this.attendanceService.getClassSummary(classId, dateStr),
      this.conductLogService.listByClass(classId),
      this.conductLogService.getWeeklyRating(classId, dateStr),
      this.punishmentsService.listByClass(classId, { status: 'PENDING' }),
    ]);
    return {
      attendanceSummary,
      recentConductLogs: recentConductLogs.slice(0, 20),
      conductRating,
      pendingPunishments,
    };
  }
}
```

- [ ] **Step 4: Implement `apps/api/src/dashboard/dashboard.controller.ts`**

```ts
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PositionGuard } from '../common/guards/position.guard';
import { RequirePosition } from '../common/decorators/require-position.decorator';
import { DashboardService } from './dashboard.service';

@Controller('classes/:classId/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard, PositionGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @RequirePosition('ANY')
  async get(@Param('classId') classId: string, @Query('date') date: string) {
    return this.dashboardService.getClassDashboard(classId, date);
  }
}
```

- [ ] **Step 5: Thêm `exports: [AttendanceService]` vào `apps/api/src/attendance/attendance.module.ts`**

- [ ] **Step 6: Implement `apps/api/src/dashboard/dashboard.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { ConductLogModule } from '../conduct-log/conduct-log.module';
import { PunishmentsModule } from '../punishments/punishments.module';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { PositionGuard } from '../common/guards/position.guard';

@Module({
  imports: [AttendanceModule, ConductLogModule, PunishmentsModule],
  controllers: [DashboardController],
  providers: [DashboardService, PositionGuard],
})
export class DashboardModule {}
```

- [ ] **Step 7: Thêm `DashboardModule` vào `apps/api/src/app.module.ts`**

- [ ] **Step 8: Chạy test — xác nhận PASS**

- [ ] **Step 9: Lint + build + chạy toàn bộ test `api`**

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/dashboard apps/api/src/attendance/attendance.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): add DashboardModule aggregating attendance, conduct, and punishments per class"
```

---

## Task 7: Seed script — `SchoolConfig` + danh mục vi phạm mẫu

**Files:**
- Modify: `apps/api/src/seed/seed.ts`

**Interfaces:** Không có interface nào task khác tiêu thụ.

- [ ] **Step 1: Sửa `apps/api/src/seed/seed.ts`**

Sau khi tạo lớp 11A4 + 12 học sinh (đã có từ Phase 1): tạo 1 `SchoolConfig` mặc định (`schoolConfigModel.create({})`),
và vài `ConductCatalogItem` mẫu qua `app.get(ConductCatalogService)`: 2-3 mục vi phạm thường gặp (vd "Đi học
muộn" 5đ, "Mất trật tự" 10đ), 1-2 mục điểm cộng (vd "Phát biểu xây dựng bài" 5đ), và đúng 1 mục có
`specialRule: 'HOMEWORK_NOT_DONE'` (label "Không làm bài tập về nhà", điểm 5) để demo rule leo thang.

- [ ] **Step 2: Verify thủ công — chạy seed với Mongo thật**

```bash
docker compose up -d mongo mongo-init
pnpm --filter api run seed
docker compose exec mongo mongosh so_chu_nhiem --quiet --eval "db.schoolconfigs.countDocuments({})"
docker compose exec mongo mongosh so_chu_nhiem --quiet --eval "db.conductcatalogitems.countDocuments({})"
docker compose down
```

Expected: cả 2 lệnh in ra số > 0 (lần lượt là `1` và số mục danh mục đã seed).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/seed
git commit -m "feat(api): seed default SchoolConfig and sample conduct catalog items"
```

---

## Task 8: Verify toàn bộ monorepo + báo cáo Phase 2

**Files:** không tạo/sửa file nguồn — chỉ verify.

- [ ] **Step 1: Chạy toàn bộ monorepo từ root**

```bash
nvm use 20
pnpm install --frozen-lockfile
pnpm run lint
pnpm run build
pnpm run test
```

Expected: cả 4 lệnh PASS.

- [ ] **Step 2: Không phải code — báo cáo lại cho người dùng toàn bộ Phase 2 (2A + 2B): những gì đã làm, kết
  quả test, các ruling/bug đã sửa quan trọng (xem ledger Phase 2A và 2B), rồi chờ duyệt theo đúng quy trình gốc
  trước khi sang Phase 3.**

---

## Tổng kết Self-Review

- **Spec coverage:** Cấu hình trường (Task 2), schema chép phạt (Task 3), 2 rule tự động + chống race condition
  (Task 4), quản lý trạng thái/số dòng chép phạt với IDOR check (Task 5), dashboard gộp 4 nguồn (Task 6), seed
  (Task 7). Toàn bộ mục "Phạm vi" 5-7 của spec Phase 2 đã có task tương ứng.
- **Step scan:** mỗi step pin chữ ký + nhánh rẽ nghiệp vụ (vd điều kiện `>=` thay vì `===`, công thức
  occurrence→lines) hoặc lệnh verify có output kỳ vọng.
- **Type consistency:** `ConductLogService.create` đổi return type từ `ConductLog` (Phase 2A) sang
  `{conductLog, punishments}` (Task 4) — đã ghi rõ trong Interfaces là "signature mới" để implementer biết đây
  là thay đổi có chủ đích, không phải lỗi đánh máy; `PunishmentsService`/`DashboardService` dùng nhất quán tên
  `listByClass` xuyên suốt Task 5-6.
- **Review Focus:** cả 5 mục (race condition rule tuần, đếm occurrence đúng catalog item, IDOR chép phạt, config
  áp dụng ngay không cache, dashboard không lộ chéo lớp) đều có test cụ thể ở đúng task sở hữu.
- **Proportion:** code mẫu tập trung vào đúng nhánh rẽ nghiệp vụ phức tạp (Task 4's transaction logic cần pin
  chi tiết vì đây là phần dễ sai nhất của cả plan); các CRUD đơn giản hơn (SchoolConfig, Punishments status/lines)
  chỉ pin chữ ký, không lặp lại toàn bộ thân hàm nếu không có nhánh rẽ đặc biệt.
