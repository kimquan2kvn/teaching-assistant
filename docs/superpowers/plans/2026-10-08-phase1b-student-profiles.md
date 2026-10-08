# Phase 1B — Hồ sơ học sinh, Import Excel, Guard theo lớp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GVCN tạo/sửa/đánh dấu chuyển đi hồ sơ học sinh của đúng lớp mình (giữ lịch sử, không xoá cứng), GVBM chỉ xem; import Excel có bước xem trước; toàn bộ quyền theo lớp kiểm tra bằng 1 guard dùng chung (`PositionGuard`), có ma trận test phân quyền đầy đủ theo đúng yêu cầu gốc.

**Architecture:** `PositionGuard` mới đọc `classId` từ route param, tra `Position` xem `req.user.id` có đang giữ vị trí nào (chế độ `'ANY'`) hoặc đúng HOMEROOM (chế độ `'HOMEROOM'`) của lớp đó không; ADMIN luôn qua. `StudentsModule` dùng guard này cho mọi route, route nào cũng có `:classId` trong path (kể cả sửa/transfer 1 học sinh cụ thể) để guard tra cứu nhất quán. Import Excel 2 bước (preview — chỉ parse + validate, không ghi; confirm — ghi thật trong 1 transaction tất-cả-hoặc-không-gì) dùng `exceljs` đọc buffer từ `multer` (có sẵn qua `@nestjs/platform-express`).

**Tech Stack:** NestJS (đã có), `exceljs` (đọc .xlsx), `multer` (upload — transitive qua `@nestjs/platform-express`, chỉ cần `@types/multer`), zod (`packages/shared`), Jest + `mongodb-memory-server` (đã có hạ tầng từ Plan 1A).

**Spec:** [docs/superpowers/specs/2026-10-08-phase1-foundation-design.md](../specs/2026-10-08-phase1-foundation-design.md) — phần "Hồ sơ học sinh", "Guard phân quyền", "Kiểm thử" (ma trận phân quyền), "Nghiệp vụ cần cài đúng" (transfer, import). Kế thừa toàn bộ hạ tầng của [Plan 1A](2026-10-08-phase1a-auth-class-position.md) (đã hoàn thành, xem ledger tại
`.superpowers/sdd/2026-10-08-phase1a-auth-class-position/progress.md` để biết các ruling/bug đã sửa — đặc biệt: mọi module Nest PHẢI tự `imports: [DatabaseModule]` nếu cần inject Model, không được giả định AppModule import hộ).

## Global Constraints

- Mọi route của `StudentsModule` đều có `:classId` làm route param đầu path (kể cả route thao tác 1 học sinh cụ
  thể, vd `PATCH /classes/:classId/students/:studentId`) — để `PositionGuard` luôn tra được `classId` từ
  `request.params.classId` theo đúng 1 cách, không cần nhánh rẽ theo từng route.
- `@RequirePosition('HOMEROOM' | 'ANY')`: `'HOMEROOM'` yêu cầu đang giữ đúng Position loại HOMEROOM của lớp đó;
  `'ANY'` chấp nhận HOMEROOM hoặc SUBJECT. ADMIN (role) luôn được bỏ qua `PositionGuard` (kiểm tra `req.user.role
  === 'ADMIN'` trước, trả `true` ngay, không query DB).
- Route không có `@RequirePosition` thì `PositionGuard` cho qua (giống quy ước của `RolesGuard` ở Plan 1A với
  `@Roles`) — nhất quán cách 2 guard cùng hoạt động.
- Student mặc định `status: 'ACTIVE'`; `GET .../students` mặc định chỉ trả `status: ACTIVE`, query
  `?status=ALL` trả cả `TRANSFERRED`. Không bao giờ xoá cứng Student.
- Import Excel: cột bắt buộc `Họ và tên` (ứng với `fullName`), cột tuỳ chọn `Ngày sinh` (ứng với `dob`, định dạng
  `dd/mm/yyyy`). Dòng tiêu đề là dòng 1, dữ liệu từ dòng 2. `rowNumber` trong response preview là số dòng Excel
  thật (bắt đầu từ 2) để người dùng đối chiếu dễ.
- Mọi module mới (`StudentsModule`) tự `imports: [DatabaseModule]` — bài học từ Plan 1A (xem Global Constraints
  trên) — không giả định module khác import hộ.
- Lỗi nghiệp vụ trả tiếng Việt thân thiện (kế thừa quy ước Plan 1A).

## Review Focus

- GVBM (giữ Position SUBJECT, không giữ HOMEROOM) gọi sửa/tạo/transfer/import học sinh phải bị từ chối (403) dù
  đang giữ vị trí hợp lệ của đúng lớp đó — nếu `PositionGuard` chỉ kiểm tra "có giữ vị trí nào không" mà quên
  phân biệt HOMEROOM/SUBJECT cho các route ghi, GVBM sẽ sửa được hồ sơ học sinh — sai nghiêm trọng so với yêu cầu
  gốc ("GVBM chỉ XEM hồ sơ học sinh"). → test ở Task 3.
- GVCN lớp A gọi sửa học sinh của lớp B (dù vẫn đang giữ HOMEROOM của lớp A) phải bị từ chối (403) — nếu guard
  chỉ kiểm tra "role có phải giữ HOMEROOM ở đâu đó không" mà quên so đúng `classId` trong route, GVCN lớp này sẽ
  sửa được hồ sơ lớp khác. → test ở Task 3.
- Giáo viên hoàn toàn không giữ vị trí nào của lớp đó (chưa từng `join`) phải không xem được cả danh sách học
  sinh (không chỉ chặn sửa) — nếu chỉ chặn ghi mà quên chặn đọc, dữ liệu học sinh (thông tin cá nhân trẻ vị
  thành niên) sẽ lộ cho bất kỳ giáo viên nào đã đăng nhập. → test ở Task 3.
- Import "tất cả hoặc không gì": nếu 1 dòng trong `import-confirm` không hợp lệ (vd `fullName` rỗng lọt qua vì
  FE không chặn), **không được** lưu các dòng hợp lệ còn lại — phải rollback toàn bộ transaction, trả lỗi rõ
  dòng nào sai. → test ở Task 4.
- Đánh dấu chuyển đi (transfer) phải ẩn học sinh khỏi `GET .../students` mặc định nhưng **không xoá dữ liệu** —
  gọi lại với `?status=ALL` vẫn phải thấy, kèm đúng `transferDate`/`transferReason` đã lưu. → test ở Task 3.

---

## Task 1: `packages/shared` — zod schema hồ sơ học sinh

**Files:**
- Create: `packages/shared/src/schemas/student.schema.ts`
- Create: `packages/shared/src/schemas/student.schema.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `createStudentSchema`, `updateStudentSchema`, `markTransferredSchema`, `importConfirmSchema` (zod,
  kèm type `CreateStudentInput`/`UpdateStudentInput`/`MarkTransferredInput`/`ImportConfirmInput`) — Task 3 và
  Task 4 dùng các schema này qua `ZodValidationPipe` (đã có từ Plan 1A).

- [ ] **Step 1: Viết test trước — `packages/shared/src/schemas/student.schema.test.ts`**

```ts
import { createStudentSchema, markTransferredSchema, importConfirmSchema } from './student.schema';

describe('createStudentSchema', () => {
  it('yêu cầu fullName, dob tuỳ chọn', () => {
    expect(createStudentSchema.safeParse({ fullName: 'Nguyễn Văn A' }).success).toBe(true);
    expect(createStudentSchema.safeParse({ fullName: '' }).success).toBe(false);
  });
});

describe('markTransferredSchema', () => {
  it('yêu cầu transferDate và transferReason không rỗng', () => {
    expect(
      markTransferredSchema.safeParse({ transferDate: '2026-01-15', transferReason: 'Chuyển trường' }).success,
    ).toBe(true);
    expect(markTransferredSchema.safeParse({ transferDate: '2026-01-15', transferReason: '' }).success).toBe(false);
  });
});

describe('importConfirmSchema', () => {
  it('yêu cầu rows là mảng không rỗng, mỗi phần tử có fullName', () => {
    expect(importConfirmSchema.safeParse({ rows: [{ fullName: 'A' }] }).success).toBe(true);
    expect(importConfirmSchema.safeParse({ rows: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL** (`pnpm --filter @so-chu-nhiem/shared run test -- student.schema`)

- [ ] **Step 3: Implement `packages/shared/src/schemas/student.schema.ts`**

```ts
import { z } from 'zod';

export const createStudentSchema = z.object({
  fullName: z.string().min(1).max(100),
  dob: z.coerce.date().optional(),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = createStudentSchema.partial();
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const markTransferredSchema = z.object({
  transferDate: z.coerce.date(),
  transferReason: z.string().min(1).max(200),
});
export type MarkTransferredInput = z.infer<typeof markTransferredSchema>;

export const importConfirmSchema = z.object({
  rows: z
    .array(z.object({ fullName: z.string().min(1).max(100), dob: z.coerce.date().optional() }))
    .min(1),
});
export type ImportConfirmInput = z.infer<typeof importConfirmSchema>;
```

- [ ] **Step 4: Chạy test — xác nhận PASS**

- [ ] **Step 5: Sửa `packages/shared/src/index.ts`** — thêm `export * from './schemas/student.schema';`

- [ ] **Step 6: Build + lint + test `packages/shared`**

Run: `pnpm --filter @so-chu-nhiem/shared run build && pnpm --filter @so-chu-nhiem/shared run test && pnpm --filter @so-chu-nhiem/shared run lint`

- [ ] **Step 7: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): add student profile zod DTOs"
```

---

## Task 2: `apps/api` — `PositionGuard` + decorator `@RequirePosition`

**Files:**
- Create: `apps/api/src/common/decorators/require-position.decorator.ts`
- Create: `apps/api/src/common/guards/position.guard.ts`
- Create: `apps/api/src/common/guards/position.guard.spec.ts`

**Interfaces:**
- Produces: `@RequirePosition('HOMEROOM' | 'ANY')` (metadata decorator), `class PositionGuard implements
  CanActivate` — Task 3/4 dùng `@UseGuards(JwtAuthGuard, RolesGuard, PositionGuard)` +
  `@RequirePosition(...)` trên `StudentsController`.

- [ ] **Step 1: Viết test trước — `apps/api/src/common/guards/position.guard.spec.ts`** (mock
  `Reflector` + `Model<Position>`, không cần DB thật — giống phong cách `roles.guard.spec.ts` ở Plan 1A)

```ts
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PositionGuard } from './position.guard';

function buildContext(options: {
  requirement?: 'HOMEROOM' | 'ANY';
  user?: { id: string; role: string };
  classId?: string;
  foundPosition: { type: string; holderId: string } | null;
}) {
  const reflector = { getAllAndOverride: () => options.requirement } as unknown as Reflector;
  const positionModel = {
    findOne: jest.fn(() => ({ exec: async () => options.foundPosition })),
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ user: options.user, params: { classId: options.classId } }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return { guard: new PositionGuard(reflector, positionModel as any), context };
}

describe('PositionGuard', () => {
  it('cho qua nếu route không khai báo @RequirePosition', async () => {
    const { guard, context } = buildContext({ requirement: undefined, foundPosition: null });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('ADMIN luôn được bỏ qua, không query DB', async () => {
    const { guard, context } = buildContext({
      requirement: 'HOMEROOM',
      user: { id: 'admin-1', role: 'ADMIN' },
      classId: 'class-1',
      foundPosition: null,
    });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it("'ANY': cho qua nếu đang giữ SUBJECT của đúng lớp", async () => {
    const { guard, context } = buildContext({
      requirement: 'ANY',
      user: { id: 'teacher-1', role: 'TEACHER' },
      classId: 'class-1',
      foundPosition: { type: 'SUBJECT', holderId: 'teacher-1' },
    });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it("'HOMEROOM': từ chối nếu chỉ giữ SUBJECT (không phải HOMEROOM) của lớp đó", async () => {
    const { guard, context } = buildContext({
      requirement: 'HOMEROOM',
      user: { id: 'teacher-1', role: 'TEACHER' },
      classId: 'class-1',
      foundPosition: null, // query lọc type: HOMEROOM sẽ không tìm thấy vì teacher-1 chỉ giữ SUBJECT
    });
    expect(await guard.canActivate(context)).toBe(false);
  });

  it('từ chối nếu không giữ vị trí nào của đúng classId trong route', async () => {
    const { guard, context } = buildContext({
      requirement: 'ANY',
      user: { id: 'teacher-1', role: 'TEACHER' },
      classId: 'class-1',
      foundPosition: null,
    });
    expect(await guard.canActivate(context)).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Implement `apps/api/src/common/decorators/require-position.decorator.ts`**

```ts
import { SetMetadata } from '@nestjs/common';

export const REQUIRE_POSITION_KEY = 'requirePosition';
export const RequirePosition = (type: 'HOMEROOM' | 'ANY') => SetMetadata(REQUIRE_POSITION_KEY, type);
```

- [ ] **Step 4: Implement `apps/api/src/common/guards/position.guard.ts`**

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Position } from '../../database/schemas/position.schema';
import { REQUIRE_POSITION_KEY } from '../decorators/require-position.decorator';

@Injectable()
export class PositionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(Position.name) private readonly positionModel: Model<Position>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<'HOMEROOM' | 'ANY' | undefined>(
      REQUIRE_POSITION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as { id: string; role: string } | undefined;
    if (!user) return false;
    if (user.role === 'ADMIN') return true;

    const classId = request.params?.classId;
    if (!classId) return false;

    const filter: Record<string, unknown> = { classId, holderId: user.id };
    if (requirement === 'HOMEROOM') {
      filter.type = 'HOMEROOM';
    }
    const position = await this.positionModel.findOne(filter).exec();
    return !!position;
  }
}
```

(Lưu ý: filter `holderId: user.id` — Mongoose tự ép kiểu string sang `ObjectId` khi so khớp field kiểu
`Types.ObjectId`, không cần tự `new Types.ObjectId(...)`.)

- [ ] **Step 5: Chạy test — xác nhận PASS**

- [ ] **Step 6: Lint + build**

Run: `pnpm --filter api run lint && pnpm --filter api run build`

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common
git commit -m "feat(api): add PositionGuard for per-class HOMEROOM/ANY authorization"
```

---

## Task 3: `apps/api` — `StudentsModule` (CRUD + transfer) qua `PositionGuard`

**Files:**
- Create: `apps/api/src/students/students.module.ts`
- Create: `apps/api/src/students/students.service.ts`
- Create: `apps/api/src/students/students.controller.ts`
- Create: `apps/api/src/students/students.e2e.spec.ts`
- Modify: `apps/api/src/app.module.ts` — import `StudentsModule`

**Interfaces:**
- Consumes: `PositionGuard`/`@RequirePosition` (Task 2), `createStudentSchema`/`updateStudentSchema`/
  `markTransferredSchema` (Task 1).
- Produces: `StudentsService.list(classId, status?: 'ACTIVE' | 'ALL')`, `.create(classId, input)`,
  `.update(studentId, input)`, `.transfer(studentId, input)` — Task 4 (import) tái sử dụng `.create` logic
  gián tiếp qua `.bulkCreate(classId, inputs[])` mà Task 4 sẽ thêm vào cùng service này.

- [ ] **Step 1: Viết test trước — `apps/api/src/students/students.e2e.spec.ts`**

(Khuôn mẫu giống các `*.e2e.spec.ts` ở Plan 1A: dựng module tối giản gồm `AuthController` + `ClassesController`
+ `PositionsController` + `StudentsController` cùng mọi service/model liên quan, `buildTestMongoUri('students_e2e')`,
tạo sẵn 1 `SchoolYear isCurrent` trong `beforeAll`.)

```ts
it('GVCN tạo được học sinh trong lớp mình, GVBM (giữ SUBJECT) không tạo được dù cùng lớp', async () => {
  const { token: gvcnToken } = await registerAndPromote('gvcn.a', 'TEACHER');
  const classRes = await request(app.getHttpServer())
    .post('/classes').set('Authorization', `Bearer ${gvcnToken}`)
    .send({ name: '10B1', claimHomeroom: true });
  const classId = classRes.body.class._id;
  const code = classRes.body.class.code;

  await request(app.getHttpServer())
    .post(`/classes/${classId}/students`)
    .set('Authorization', `Bearer ${gvcnToken}`)
    .send({ fullName: 'Học sinh A' })
    .expect(201);

  const { token: gvbmToken } = await registerAndPromote('gvbm.a', 'TEACHER');
  await request(app.getHttpServer())
    .post('/positions/join')
    .set('Authorization', `Bearer ${gvbmToken}`)
    .send({ code, type: 'SUBJECT', subject: 'Toán' });

  await request(app.getHttpServer())
    .post(`/classes/${classId}/students`)
    .set('Authorization', `Bearer ${gvbmToken}`)
    .send({ fullName: 'Học sinh B' })
    .expect(403);

  await request(app.getHttpServer())
    .get(`/classes/${classId}/students`)
    .set('Authorization', `Bearer ${gvbmToken}`)
    .expect(200); // GVBM xem được
});

it('giáo viên không giữ vị trí nào của lớp không xem được danh sách học sinh', async () => {
  // tạo lớp, tạo học sinh bằng GVCN, rồi 1 giáo viên khác (chưa join lớp này) gọi GET → 403
});

it('GVCN lớp A không sửa được học sinh lớp B', async () => {
  // tạo 2 lớp, mỗi lớp 1 GVCN khác nhau + 1 học sinh; GVCN lớp A gọi PATCH học sinh lớp B → 403
});

it('transfer: ẩn khỏi danh sách mặc định nhưng vẫn thấy với ?status=ALL, giữ transferDate/transferReason', async () => {
  // tạo lớp + học sinh, GVCN gọi POST .../transfer, GET mặc định không thấy, GET ?status=ALL thấy kèm đúng field
});
```

(Viết đầy đủ `beforeAll`, `registerAndPromote` theo khuôn Plan 1A; `classId` lấy từ `classRes.body.class._id`
— **lưu ý**: response hiện tại của `POST /classes` trả `{ class, positions }` với `class` là document Mongoose
serialize ra JSON, có field `_id`.)

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Implement `StudentsService`**

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Student } from '../database/schemas/student.schema';
import type { CreateStudentInput, UpdateStudentInput, MarkTransferredInput } from '@so-chu-nhiem/shared';

@Injectable()
export class StudentsService {
  constructor(@InjectModel(Student.name) private readonly studentModel: Model<Student>) {}

  async list(classId: string, status: 'ACTIVE' | 'ALL' = 'ACTIVE'): Promise<Student[]> {
    const filter: Record<string, unknown> = { classId };
    if (status === 'ACTIVE') filter.status = 'ACTIVE';
    return this.studentModel.find(filter).exec();
  }

  async create(classId: string, input: CreateStudentInput): Promise<Student> {
    return this.studentModel.create({ classId, fullName: input.fullName, dob: input.dob });
  }

  async update(studentId: string, input: UpdateStudentInput): Promise<Student> {
    const student = await this.studentModel.findByIdAndUpdate(studentId, input, { new: true }).exec();
    if (!student) throw new NotFoundException('Không tìm thấy học sinh');
    return student;
  }

  async transfer(studentId: string, input: MarkTransferredInput): Promise<Student> {
    const student = await this.studentModel
      .findByIdAndUpdate(
        studentId,
        { status: 'TRANSFERRED', transferDate: input.transferDate, transferReason: input.transferReason },
        { new: true },
      )
      .exec();
    if (!student) throw new NotFoundException('Không tìm thấy học sinh');
    return student;
  }
}
```

(Task 4 sẽ mở file này thêm method `bulkCreate` — không phải viết lại từ đầu.)

- [ ] **Step 4: Implement `StudentsController`**

```ts
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { createStudentSchema, updateStudentSchema, markTransferredSchema } from '@so-chu-nhiem/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PositionGuard } from '../common/guards/position.guard';
import { RequirePosition } from '../common/decorators/require-position.decorator';
import { StudentsService } from './students.service';

@Controller('classes/:classId/students')
@UseGuards(JwtAuthGuard, RolesGuard, PositionGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @RequirePosition('ANY')
  async list(@Param('classId') classId: string, @Query('status') status?: 'ACTIVE' | 'ALL') {
    return this.studentsService.list(classId, status ?? 'ACTIVE');
  }

  @Post()
  @RequirePosition('HOMEROOM')
  async create(
    @Param('classId') classId: string,
    @Body(new ZodValidationPipe(createStudentSchema)) body: { fullName: string; dob?: Date },
  ) {
    return this.studentsService.create(classId, body);
  }

  @Patch(':studentId')
  @RequirePosition('HOMEROOM')
  async update(
    @Param('studentId') studentId: string,
    @Body(new ZodValidationPipe(updateStudentSchema)) body: { fullName?: string; dob?: Date },
  ) {
    return this.studentsService.update(studentId, body);
  }

  @Post(':studentId/transfer')
  @RequirePosition('HOMEROOM')
  async transfer(
    @Param('studentId') studentId: string,
    @Body(new ZodValidationPipe(markTransferredSchema)) body: { transferDate: Date; transferReason: string },
  ) {
    return this.studentsService.transfer(studentId, body);
  }
}
```

- [ ] **Step 5: Implement `StudentsModule`** (`imports: [DatabaseModule]` — xem Global Constraints), sửa
  `app.module.ts`.

- [ ] **Step 6: Chạy test — xác nhận PASS**

- [ ] **Step 7: Lint + build + chạy toàn bộ test `api`**

- [ ] **Step 8: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): add StudentsModule with per-class HOMEROOM/ANY authorization"
```

---

## Task 4: `apps/api` — Import Excel (preview + confirm, tất-cả-hoặc-không-gì)

**Files:**
- Modify: `apps/api/src/students/students.service.ts` — thêm `parsePreview`, `bulkCreate`
- Modify: `apps/api/src/students/students.controller.ts` — thêm 2 route
- Create: `apps/api/src/students/students-import.e2e.spec.ts`
- Modify: `apps/api/package.json` — thêm `exceljs` (dependencies), `@types/multer` (devDependencies)

**Interfaces:**
- Produces: `POST /classes/:classId/students/import-preview` (multipart, field `file`),
  `POST /classes/:classId/students/import-confirm` (JSON `{ rows: [...] }`) — không có task nào khác tiêu thụ.

- [ ] **Step 1: Viết test trước — `apps/api/src/students/students-import.e2e.spec.ts`** (dùng `exceljs` ngay
  trong test để DỰNG file .xlsx hợp lệ/không hợp lệ, upload qua `supertest`'s `.attach()`)

```ts
import ExcelJS from 'exceljs';
// ... beforeAll dựng module như Task 3 (thêm StudentsController/Service) ...

async function buildWorkbookBuffer(rows: Array<{ fullName: string; dob?: string }>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Học sinh');
  sheet.addRow(['Họ và tên', 'Ngày sinh']);
  rows.forEach((r) => sheet.addRow([r.fullName, r.dob ?? '']));
  return (await workbook.xlsx.writeBuffer()) as Buffer;
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
  expect(count).toBe(0); // preview không ghi gì
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
```

(`setupClassWithHomeroom(username)` là helper cục bộ: đăng ký giáo viên, tạo lớp `claimHomeroom: true`, trả về
`{ token, classId }` — gom logic lặp lại ở nhiều test.)

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Thêm `exceljs`/`@types/multer` vào `package.json`, `pnpm install`**

- [ ] **Step 4: Implement `StudentsService.parsePreview` và `.bulkCreate`**

```ts
export interface ImportPreviewRow {
  rowNumber: number;
  fullName: string;
  dob?: Date;
  errors: string[];
}

async parsePreview(buffer: Buffer): Promise<ImportPreviewRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  const rows: ImportPreviewRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const fullName = String(row.getCell(1).text ?? '').trim();
    const dobRaw = String(row.getCell(2).text ?? '').trim();
    const errors: string[] = [];
    if (!fullName) errors.push('Họ và tên không được để trống');
    rows.push({ rowNumber, fullName, dob: dobRaw ? new Date(dobRaw) : undefined, errors });
  });
  return rows;
}

async bulkCreate(classId: string, rows: Array<{ fullName: string; dob?: Date }>): Promise<Student[]> {
  const invalidIndex = rows.findIndex((r) => !r.fullName?.trim());
  if (invalidIndex !== -1) {
    throw new BadRequestException(`Dòng thứ ${invalidIndex + 1} thiếu họ và tên, không lưu được`);
  }
  const docs = rows.map((r) => ({ classId, fullName: r.fullName, dob: r.dob }));
  return this.studentModel.insertMany(docs, { ordered: true });
}
```

(`insertMany` với mảng docs hợp lệ validate trước ở tầng service là đủ "tất-cả-hoặc-không-gì" ở đây — vì lỗi
được chặn TRƯỚC khi gọi `insertMany`, không có dòng nào được ghi nếu có dòng sai; không cần session/transaction
vì không có thao tác ghi nào khác xen giữa.)

- [ ] **Step 5: Thêm 2 route vào `StudentsController`**

```ts
import { UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { importConfirmSchema } from '@so-chu-nhiem/shared';
// ...

@Post('import-preview')
@RequirePosition('HOMEROOM')
@UseInterceptors(FileInterceptor('file'))
async importPreview(@UploadedFile() file: Express.Multer.File) {
  const rows = await this.studentsService.parsePreview(file.buffer);
  return { rows };
}

@Post('import-confirm')
@RequirePosition('HOMEROOM')
async importConfirm(
  @Param('classId') classId: string,
  @Body(new ZodValidationPipe(importConfirmSchema)) body: { rows: Array<{ fullName: string; dob?: Date }> },
) {
  return this.studentsService.bulkCreate(classId, body.rows);
}
```

- [ ] **Step 6: Chạy test — xác nhận PASS**

- [ ] **Step 7: Lint + build + chạy toàn bộ test `api`**

- [ ] **Step 8: Commit**

```bash
git add apps/api/src apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add Excel import preview/confirm with all-or-nothing semantics"
```

---

## Task 5: `apps/api` — Ma trận test phân quyền đầy đủ (role × hành động)

**Files:**
- Create: `apps/api/src/students/permission-matrix.e2e.spec.ts`

**Interfaces:**
- Không có interface nào task khác tiêu thụ — file test độc lập, dựng lại 1 module test giống Task 3/4 nhưng
  tập trung đúng 1 việc: liệt kê đủ các cặp (role, hành động) theo đúng bảng trong spec mục "Kiểm thử".

- [ ] **Step 1: Viết test — mỗi dòng của bảng dưới đây là 1 `it()`** (STUDENT tạo qua
  `userModel.create({ username, passwordHash, fullName, role: 'STUDENT' })` trực tiếp rồi login — Phase 1 chưa
  có endpoint tự đăng ký cho STUDENT):

  | Role (giữ vị trí) | Hành động | Kỳ vọng |
  |---|---|---|
  | STUDENT | `POST .../students` (của bất kỳ lớp nào) | 403 |
  | STUDENT | `GET .../students` | 403 |
  | GVBM (SUBJECT) | `PATCH .../students/:id` | 403 |
  | GVBM (SUBJECT) | `GET .../students` | 200 |
  | GVCN (HOMEROOM) lớp mình | `PATCH .../students/:id` lớp mình | 200 |
  | GVCN (HOMEROOM) lớp mình | `PATCH .../students/:id` lớp khác | 403 |
  | Giáo viên chưa giữ vị trí nào | `POST /positions/:id/release` vị trí bất kỳ | 403 |
  | Bất kỳ TEACHER | `PATCH /positions/:id/reassign` | 403 (chỉ ADMIN) |
  | ADMIN | `POST .../students`, `PATCH .../students/:id`, `GET .../students` | 200 |
  | ADMIN | `PATCH /positions/:id/reassign` sang user không phải TEACHER | 400 |

  (2 dòng cuối cùng về `release`/`reassign` đã có test riêng ở Plan 1A Task 11 — file này chỉ lặp lại đúng 2
  dòng đó nếu cần đối chiếu bảng, KHÔNG bắt buộc viết lại nếu đã trùng 100% — tập trung vào các dòng mới của
  Plan 1B là `students`.)

- [ ] **Step 2: Chạy test — xác nhận PASS** (hầu hết các case này đã được đảm bảo đúng bởi `PositionGuard`/
  `RolesGuard` viết ở Task 2-3; đây là bước "biên soạn lại thành 1 bảng tường minh" đúng yêu cầu gốc, không
  phải code mới — nếu có case FAIL thì đó là dấu hiệu guard thiếu sót thật, quay lại Task 2/3 sửa.)

- [ ] **Step 3: Lint + build + chạy toàn bộ test `api`**

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/students/permission-matrix.e2e.spec.ts
git commit -m "test(api): add explicit role x action permission matrix for Phase 1"
```

---

## Task 6: Hoàn thiện seed script (thêm 12 học sinh) + README

**Files:**
- Modify: `apps/api/src/seed/seed.ts`

**Interfaces:**
- Không có interface nào task khác tiêu thụ.

- [ ] **Step 1: Sửa `apps/api/src/seed/seed.ts`** — sau khi tạo lớp 11A4, gọi
  `studentsService.create(createdClass._id, { fullName: ..., dob: ... })` 12 lần với tên mẫu tiếng Việt khác
  nhau (vd "Học sinh mẫu 01".."12"), lấy `StudentsService` qua `app.get(StudentsService)`.

- [ ] **Step 2: Verify thủ công — chạy seed với Mongo thật**

Run:
```bash
docker compose up -d mongo mongo-init
pnpm --filter api run seed
docker compose exec mongo mongosh so_chu_nhiem --quiet --eval "db.students.countDocuments({})"
docker compose down
```
Expected: in ra `12`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/seed
git commit -m "feat(api): seed 12 sample students into the 11A4 class"
```

---

## Task 7: Verify toàn bộ + chuẩn bị bàn giao Phase 1

**Files:** không tạo/sửa file nguồn — chỉ verify + tóm tắt.

- [ ] **Step 1: Chạy toàn bộ monorepo từ root (đúng như CI sẽ chạy)**

Run:
```bash
nvm use 20
pnpm install --frozen-lockfile
pnpm run lint
pnpm run build
pnpm run test
```
Expected: cả 4 lệnh PASS.

- [ ] **Step 2: Không phải code — báo cáo lại cho người dùng toàn bộ Phase 1 (1A + 1B): những gì đã làm, kết
  quả test, các ruling/ bug đã sửa quan trọng (xem ledger Plan 1A và 1B), rồi chờ duyệt theo đúng quy trình gốc
  trước khi sang Phase 2.**

---

## Tổng kết Self-Review

- **Spec coverage:** Hồ sơ học sinh CRUD (Task 3), transfer giữ lịch sử (Task 3), import Excel 2 bước +
  tất-cả-hoặc-không-gì (Task 4), `PositionGuard` theo `classId` (Task 2), ma trận phân quyền đầy đủ (Task 5),
  seed đủ 12 học sinh (Task 6). Toàn bộ mục "Phạm vi" còn lại của spec Phase 1 (mục 6, 7, 8) đã có task tương
  ứng.
- **Step scan:** mỗi step là 1 test cụ thể, đoạn code pin chữ ký + nhánh rẽ nghiệp vụ, hoặc 1 lệnh verify có
  output kỳ vọng.
- **Type consistency:** `CreateStudentInput`/`UpdateStudentInput`/`MarkTransferredInput`/`ImportConfirmInput`
  dùng nhất quán giữa Task 1 (định nghĩa) và Task 3-4 (tiêu thụ); `PositionGuard`/`RequirePosition` dùng đúng 1
  tên xuyên suốt Task 2-5.
- **Review Focus:** cả 5 mục (GVBM bị chặn sửa dù đúng lớp, GVCN lớp khác bị chặn, chưa giữ vị trí bị chặn cả
  đọc, import rollback toàn bộ, transfer giữ lịch sử) đều có test cụ thể ở đúng task sở hữu.
- **Proportion:** code mẫu chỉ pin chữ ký + nhánh rẽ bắt buộc (vd logic `bulkCreate` chặn trước khi insert),
  không viết sẵn toàn bộ test file cho mọi case của ma trận phân quyền ở Task 5 — chỉ liệt kê bảng, implementer
  viết từng `it()` theo đúng khuôn các task trước.
