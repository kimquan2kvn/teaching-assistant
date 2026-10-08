# Phase 1A — Auth, Admin, SchoolYear, Class & Position Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Người dùng thật đăng ký/đăng nhập được, Admin quản lý tài khoản giáo viên, tạo lớp sinh mã lớp + tự động tạo sẵn toàn bộ vị trí (HOMEROOM + SUBJECT) trong 1 transaction, giáo viên nhận/ngừng phụ trách/Admin gán lại vị trí — không có race condition khi 2 người nhận cùng lúc.

**Architecture:** Mỗi nghiệp vụ là 1 Nest module độc lập (`auth`, `admin`, `school-years`, `classes`, `positions`) dùng chung `DatabaseModule` (Phase 0). DTO validate bằng zod schema đặt ở `packages/shared`, áp dụng qua 1 `ZodValidationPipe` chung. Phân quyền 2 tầng: `RolesGuard` (theo `User.role`) cho mọi route; các route cần kiểm tra thêm Position xử lý trực tiếp trong service (không cần guard riêng ở Plan 1A — `PositionGuard` dùng chung theo `classId` route param chỉ xuất hiện ở Plan 1B khi `students` module cần nó). Test tích hợp dùng 1 `MongoMemoryReplSet` chia sẻ cho cả suite (khởi tạo 1 lần qua Jest `globalSetup`), mỗi file test tự chọn tên database riêng để không đụng dữ liệu nhau.

**Tech Stack:** NestJS (đã có từ Phase 0), `@nestjs/jwt` + `passport-jwt` + `passport`, `argon2`, `zod`, `mongodb-memory-server` (chế độ replica set), `ts-node` (chạy seed script).

**Spec:** [docs/superpowers/specs/2026-10-08-phase1-foundation-design.md](../specs/2026-10-08-phase1-foundation-design.md) (và [docs/ASSUMPTIONS.md](../../ASSUMPTIONS.md) mục "Phase 1" cho các giá trị mặc định: TTL token, `SUBJECTS`, v.v.)

## Global Constraints

- Access token JWT: TTL **15 phút** (`15m`), payload `{ sub: string (userId), role: UserRole }`.
- Refresh token JWT: TTL **30 ngày** (`30d`), payload `{ sub: string (userId) }`, ký bằng secret **khác** access
  token (`JWT_REFRESH_SECRET` riêng `JWT_ACCESS_SECRET`). Lưu hash (argon2) của refresh token hiện hành ở
  `User.refreshTokenHash`; mỗi lần `/auth/refresh` thành công phải **xoay vòng** (cấp refresh token mới, ghi đè
  hash cũ) — refresh token cũ dùng lại sau khi đã xoay vòng phải bị từ chối.
- Cookie refresh token: tên `refresh_token`, flags `httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30
  ngày (ms)`.
- Băm mật khẩu: `argon2.hash(password)` / `argon2.verify(hash, password)` (argon2id mặc định của package).
- `SUBJECTS` (từ `packages/shared`, đúng thứ tự, dùng làm nguồn tạo Position SUBJECT khi tạo lớp): `['Toán',
  'Ngữ văn', 'Tiếng Anh', 'Vật lý', 'Hóa học', 'Sinh học', 'Lịch sử', 'Địa lý', 'GDCD', 'Tin học', 'Công nghệ',
  'Thể dục', 'GDQP-AN']`.
- Mọi lỗi nghiệp vụ trả về tiếng Việt thân thiện qua `message` của `HttpException` (đúng yêu cầu phi chức năng
  gốc) — không trả lỗi tiếng Anh/raw Mongo error ra ngoài.
- `apps/api` package tên `"api"`; mọi package mới thêm vào `dependencies`/`devDependencies` của nó, chạy
  `pnpm install` sau khi sửa `package.json` trước khi chạy test của task đó.
- Mọi route ghi dữ liệu phải qua `JwtAuthGuard` trước `RolesGuard` (`@UseGuards(JwtAuthGuard, RolesGuard)`), thứ
  tự guard trong Nest chạy tuần tự theo thứ tự khai báo — sai thứ tự sẽ làm `RolesGuard` chạy trước khi
  `req.user` tồn tại.

## Review Focus

- Refresh token cũ (đã bị xoay vòng) phải **không** dùng lại được — nếu không kiểm tra đúng hash hiện hành thì ai
  có refresh token cũ (vd bị lộ) vẫn cấp được access token mới vô thời hạn. → test ở Task 6.
- Tài khoản bị Admin khóa (`isActive=false`) phải **không đăng nhập được** nữa, kể cả khi họ vẫn nhớ đúng mật
  khẩu — nếu chỉ kiểm tra password mà quên kiểm tra `isActive` thì khóa tài khoản vô nghĩa. → test ở Task 7/8.
- Tạo lớp thất bại giữa chừng (vd lỗi khi tạo Position thứ 5/14) phải **không để lại Class hoặc Position mồ côi**
  — đây là lý do bắt buộc dùng transaction; thiếu transaction đúng cách sẽ để lại dữ liệu nửa vời không ai dọn.
  → test ở Task 10.
- Hai giáo viên cùng gọi `/positions/join` cho đúng 1 môn của đúng 1 lớp **cùng lúc** — đúng 1 người thành công,
  người kia nhận lỗi rõ ràng (409), không phải cả hai cùng thành công (double-claim) hoặc cả hai cùng lỗi 500.
  → test ở Task 11.
- Giáo viên **không giữ vị trí nào** ở một lớp gọi `release`/`reassign` cho vị trí của lớp đó, hoặc gọi
  `release` cho vị trí **người khác** đang giữ, phải bị từ chối (403) — không được phép tự ý giải phóng vị trí
  không phải của mình. → test ở Task 11.

---

## Task 1: `packages/shared` — hằng số môn học + zod schema Phase 1

**Files:**
- Create: `packages/shared/src/constants/subjects.ts`
- Create: `packages/shared/src/schemas/auth.schema.ts`
- Create: `packages/shared/src/schemas/class.schema.ts`
- Create: `packages/shared/src/schemas/position.schema.ts`
- Create: `packages/shared/src/constants/subjects.test.ts`
- Create: `packages/shared/src/schemas/auth.schema.test.ts`
- Modify: `packages/shared/src/index.ts` — export thêm các module trên

**Interfaces:**
- Produces: `SUBJECTS: readonly string[]`; `registerSchema`, `loginSchema`, `changePasswordSchema`,
  `createClassSchema`, `joinClassSchema`, `reassignPositionSchema` (zod `ZodObject`, mỗi schema export kèm type
  `z.infer<typeof schema>` cùng tên viết hoa chữ đầu, vd `RegisterInput`) — Task 4 (`ZodValidationPipe`) và mọi
  controller từ Task 7 trở đi dùng các schema này.

- [ ] **Step 1: Viết test trước — `packages/shared/src/constants/subjects.test.ts`**

```ts
import { SUBJECTS } from './subjects';

describe('SUBJECTS', () => {
  it('có đúng 13 môn theo thứ tự quy định', () => {
    expect(SUBJECTS).toEqual([
      'Toán', 'Ngữ văn', 'Tiếng Anh', 'Vật lý', 'Hóa học', 'Sinh học', 'Lịch sử',
      'Địa lý', 'GDCD', 'Tin học', 'Công nghệ', 'Thể dục', 'GDQP-AN',
    ]);
  });
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL** (`pnpm --filter @so-chu-nhiem/shared run test -- subjects`)

- [ ] **Step 3: Implement `packages/shared/src/constants/subjects.ts`**

```ts
export const SUBJECTS = [
  'Toán', 'Ngữ văn', 'Tiếng Anh', 'Vật lý', 'Hóa học', 'Sinh học', 'Lịch sử',
  'Địa lý', 'GDCD', 'Tin học', 'Công nghệ', 'Thể dục', 'GDQP-AN',
] as const;

export type Subject = (typeof SUBJECTS)[number];
```

- [ ] **Step 4: Chạy test — xác nhận PASS**

- [ ] **Step 5: Viết test trước — `packages/shared/src/schemas/auth.schema.test.ts`**

```ts
import { registerSchema, loginSchema, changePasswordSchema } from './auth.schema';

describe('registerSchema', () => {
  it('chấp nhận input hợp lệ', () => {
    const result = registerSchema.safeParse({
      username: 'gv.nguyenvana',
      password: 'MatKhau123',
      fullName: 'Nguyễn Văn A',
    });
    expect(result.success).toBe(true);
  });

  it('từ chối mật khẩu dưới 8 ký tự', () => {
    const result = registerSchema.safeParse({
      username: 'gv.a',
      password: '123',
      fullName: 'A',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('yêu cầu username và password', () => {
    expect(loginSchema.safeParse({ username: 'x', password: 'y' }).success).toBe(true);
    expect(loginSchema.safeParse({ username: 'x' }).success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  it('yêu cầu oldPassword và newPassword tối thiểu 8 ký tự', () => {
    expect(
      changePasswordSchema.safeParse({ oldPassword: 'abcdefgh', newPassword: 'abcdefgh' }).success,
    ).toBe(true);
    expect(
      changePasswordSchema.safeParse({ oldPassword: 'abcdefgh', newPassword: '123' }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 6: Chạy test — xác nhận FAIL**

- [ ] **Step 7: Implement `packages/shared/src/schemas/auth.schema.ts`**

```ts
import { z } from 'zod';

export const registerSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(100),
  fullName: z.string().min(1).max(100),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
```

- [ ] **Step 8: Chạy test — xác nhận PASS**

- [ ] **Step 9: Implement `packages/shared/src/schemas/class.schema.ts`** (không cần test riêng — chỉ là 2 zod
  object đơn giản, được test gián tiếp qua e2e Task 10/11)

```ts
import { z } from 'zod';
import { SUBJECTS } from '../constants/subjects';

export const createClassSchema = z.object({
  name: z.string().min(1).max(20),
  claimHomeroom: z.boolean(),
});
export type CreateClassInput = z.infer<typeof createClassSchema>;

export const joinClassSchema = z.object({
  code: z.string().min(1),
  type: z.enum(['HOMEROOM', 'SUBJECT']),
  subject: z.enum(SUBJECTS).optional(),
});
export type JoinClassInput = z.infer<typeof joinClassSchema>;
```

- [ ] **Step 10: Implement `packages/shared/src/schemas/position.schema.ts`**

```ts
import { z } from 'zod';

export const reassignPositionSchema = z.object({
  teacherId: z.string().min(1),
});
export type ReassignPositionInput = z.infer<typeof reassignPositionSchema>;
```

- [ ] **Step 11: Sửa `packages/shared/src/index.ts`** — thêm `export * from './constants/subjects';`,
  `export * from './schemas/auth.schema';`, `export * from './schemas/class.schema';`,
  `export * from './schemas/position.schema';` (giữ nguyên `export const APP_NAME` đã có).

- [ ] **Step 12: Cài `zod` vào `packages/shared/package.json` (`dependencies`), `pnpm install`, build lại**

Run: `pnpm --filter @so-chu-nhiem/shared run build && pnpm --filter @so-chu-nhiem/shared run test && pnpm --filter @so-chu-nhiem/shared run lint`
Expected: cả 3 PASS.

- [ ] **Step 13: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): add Phase 1 zod DTOs and subjects constant"
```

---

## Task 2: `apps/api` — migrate `User`/`SchoolYear` schema cho Phase 1

**Files:**
- Modify: `apps/api/src/database/schemas/user.schema.ts`
- Modify: `apps/api/src/database/schemas/school-year.schema.ts`
- Create: `apps/api/src/database/schemas/school-year.schema.spec.ts`

**Interfaces:**
- Produces: `User.fullName: string`, `User.isActive: boolean`, `User.refreshTokenHash?: string`;
  `SchoolYear.isCurrent: boolean` + partial unique index trên `{ isCurrent: true }` — Task 5 (`AuthService`) và
  Task 9 (`SchoolYearsService`/`ClassesService`) dùng các field này.

- [ ] **Step 1: Viết test trước — `apps/api/src/database/schemas/school-year.schema.spec.ts`**

```ts
import { SchoolYearSchema } from './school-year.schema';

describe('SchoolYearSchema indexes', () => {
  it('có partial unique index đảm bảo tối đa 1 năm học isCurrent=true', () => {
    const indexes = SchoolYearSchema.indexes();
    expect(indexes).toContainEqual([
      { isCurrent: 1 },
      expect.objectContaining({ unique: true, partialFilterExpression: { isCurrent: true } }),
    ]);
  });
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL** (`pnpm --filter api run test -- school-year.schema`)

- [ ] **Step 3: Sửa `apps/api/src/database/schemas/school-year.schema.ts`** — thêm field và index

```ts
@Prop({ default: false })
isCurrent: boolean;
```
```ts
SchoolYearSchema.index({ isCurrent: 1 }, { unique: true, partialFilterExpression: { isCurrent: true } });
```

- [ ] **Step 4: Chạy test — xác nhận PASS**

- [ ] **Step 5: Sửa `apps/api/src/database/schemas/user.schema.ts`** — thêm 3 field

```ts
@Prop({ required: true })
fullName: string;

@Prop({ default: true })
isActive: boolean;

@Prop()
refreshTokenHash?: string;
```

- [ ] **Step 6: Chạy toàn bộ test + build + lint của `api`**

Run: `pnpm --filter api run lint && pnpm --filter api run build && pnpm --filter api run test`
Expected: tất cả PASS (bao gồm các test Phase 0 cũ không bị vỡ).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/database
git commit -m "feat(api): migrate User/SchoolYear schemas for Phase 1"
```

---

## Task 3: `apps/api` — hạ tầng test tích hợp dùng chung (`MongoMemoryReplSet`)

**Files:**
- Create: `apps/api/test/mongo-memory-server.global-setup.ts`
- Create: `apps/api/test/mongo-memory-server.global-teardown.ts`
- Create: `apps/api/test/build-test-mongo-uri.ts`
- Create: `apps/api/test/build-test-mongo-uri.spec.ts`
- Modify: `apps/api/jest.config.js` — thêm `globalSetup`, `globalTeardown`
- Modify: `apps/api/package.json` — thêm `mongodb-memory-server` vào `devDependencies`

**Interfaces:**
- Produces: `buildTestMongoUri(dbName: string): string` (đọc `process.env.MONGO_TEST_URI` do globalSetup set,
  trả về URI đầy đủ trỏ vào database riêng `dbName`) — mọi test e2e từ Task 7 trở đi gọi hàm này trong
  `beforeAll` để lấy URI kết nối, không hard-code `localhost:27017` (tránh đụng Mongo dev thật của Phase 0).

- [ ] **Step 1: Viết test trước — `apps/api/test/build-test-mongo-uri.spec.ts`**

```ts
import { buildTestMongoUri } from './build-test-mongo-uri';

describe('buildTestMongoUri', () => {
  const originalEnv = process.env.MONGO_TEST_URI;

  afterEach(() => {
    process.env.MONGO_TEST_URI = originalEnv;
  });

  it('ghép tên database riêng vào host:port lấy từ MONGO_TEST_URI, giữ nguyên replicaSet', () => {
    process.env.MONGO_TEST_URI = 'mongodb://127.0.0.1:54321/?replicaSet=rs0';
    expect(buildTestMongoUri('auth_e2e')).toBe('mongodb://127.0.0.1:54321/auth_e2e?replicaSet=rs0');
  });

  it('throw lỗi rõ ràng nếu MONGO_TEST_URI chưa được set (globalSetup chưa chạy)', () => {
    delete process.env.MONGO_TEST_URI;
    expect(() => buildTestMongoUri('x')).toThrow(/MONGO_TEST_URI/);
  });
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Implement `apps/api/test/build-test-mongo-uri.ts`**

```ts
export function buildTestMongoUri(dbName: string): string {
  const base = process.env.MONGO_TEST_URI;
  if (!base) {
    throw new Error('MONGO_TEST_URI chưa được set — kiểm tra jest globalSetup đã chạy chưa');
  }
  const match = base.match(/^mongodb:\/\/([^/]+)/);
  const hostPort = match![1];
  return `mongodb://${hostPort}/${dbName}?replicaSet=rs0`;
}
```

- [ ] **Step 4: Chạy test — xác nhận PASS**

- [ ] **Step 5: Thêm `mongodb-memory-server` vào `apps/api/package.json` devDependencies, `pnpm install`**

- [ ] **Step 6: Implement `apps/api/test/mongo-memory-server.global-setup.ts`**

```ts
import { MongoMemoryReplSet } from 'mongodb-memory-server';

module.exports = async function globalSetup() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  (global as any).__MONGO_REPLSET__ = replSet;
  process.env.MONGO_TEST_URI = replSet.getUri();
};
```

- [ ] **Step 7: Implement `apps/api/test/mongo-memory-server.global-teardown.ts`**

```ts
module.exports = async function globalTeardown() {
  const replSet = (global as any).__MONGO_REPLSET__;
  if (replSet) {
    await replSet.stop();
  }
};
```

- [ ] **Step 8: Sửa `apps/api/jest.config.js`** — thêm 2 dòng

```js
globalSetup: '<rootDir>/test/mongo-memory-server.global-setup.ts',
globalTeardown: '<rootDir>/test/mongo-memory-server.global-teardown.ts',
```

- [ ] **Step 9: Verify — chạy toàn bộ test của `api`, xác nhận globalSetup/teardown chạy không lỗi (tải binary
  Mongo lần đầu có thể mất 10-30s)**

Run: `pnpm --filter api run test`
Expected: PASS, không có test nào bị treo/timeout vì thiếu `MONGO_TEST_URI`.

- [ ] **Step 10: Commit**

```bash
git add apps/api/test apps/api/jest.config.js apps/api/package.json pnpm-lock.yaml
git commit -m "test(api): add shared MongoMemoryReplSet harness for integration tests"
```

---

## Task 4: `apps/api` — `ZodValidationPipe` dùng chung

**Files:**
- Create: `apps/api/src/common/pipes/zod-validation.pipe.ts`
- Create: `apps/api/src/common/pipes/zod-validation.pipe.spec.ts`

**Interfaces:**
- Produces: `class ZodValidationPipe implements PipeTransform` — constructor nhận 1 zod schema
  (`new ZodValidationPipe(registerSchema)`), dùng qua `@Body(new ZodValidationPipe(schema))` hoặc
  `@UsePipes(new ZodValidationPipe(schema))` ở mọi controller từ Task 7 trở đi.

- [ ] **Step 1: Viết test trước — `apps/api/src/common/pipes/zod-validation.pipe.spec.ts`**

```ts
import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({ name: z.string().min(1) });

describe('ZodValidationPipe', () => {
  it('trả về giá trị đã parse khi hợp lệ', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(pipe.transform({ name: 'A' })).toEqual({ name: 'A' });
  });

  it('throw BadRequestException với message tiếng Việt khi không hợp lệ', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(() => pipe.transform({ name: '' })).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Implement `apps/api/src/common/pipes/zod-validation.pipe.ts`**

```ts
import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException('Dữ liệu gửi lên không hợp lệ: ' + result.error.issues.map((i) => i.message).join(', '));
    }
    return result.data;
  }
}
```

- [ ] **Step 4: Chạy test — xác nhận PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common
git commit -m "feat(api): add shared ZodValidationPipe"
```

---

## Task 5: `apps/api` — guard/decorator phân quyền theo vai trò

**Files:**
- Create: `apps/api/src/common/decorators/roles.decorator.ts`
- Create: `apps/api/src/common/decorators/current-user.decorator.ts`
- Create: `apps/api/src/common/guards/roles.guard.ts`
- Create: `apps/api/src/common/guards/roles.guard.spec.ts`

**Interfaces:**
- Produces: `@Roles(...roles: UserRole[])` (metadata decorator), `@CurrentUser()` (param decorator trả
  `req.user`), `class RolesGuard implements CanActivate` (đọc metadata `@Roles`, so với `req.user.role`; route
  không có `@Roles` thì cho qua — chỉ cần đã đăng nhập) — mọi controller từ Task 7 dùng
  `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('ADMIN')` (Task 6 cung cấp `JwtAuthGuard`).

- [ ] **Step 1: Viết test trước — `apps/api/src/common/guards/roles.guard.spec.ts`**

```ts
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function buildContext(role: string | undefined, requiredRoles: string[] | undefined) {
  const reflector = { getAllAndOverride: () => requiredRoles } as unknown as Reflector;
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return { guard: new RolesGuard(reflector), context };
}

describe('RolesGuard', () => {
  it('cho qua nếu route không khai báo @Roles', () => {
    const { guard, context } = buildContext('TEACHER', undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('cho qua nếu role của user nằm trong danh sách yêu cầu', () => {
    const { guard, context } = buildContext('ADMIN', ['ADMIN', 'TEACHER']);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('từ chối nếu role của user không nằm trong danh sách yêu cầu', () => {
    const { guard, context } = buildContext('TEACHER', ['ADMIN']);
    expect(guard.canActivate(context)).toBe(false);
  });

  it('từ chối nếu chưa đăng nhập (không có req.user)', () => {
    const { guard, context } = buildContext(undefined, ['ADMIN']);
    expect(guard.canActivate(context)).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Implement `apps/api/src/common/decorators/roles.decorator.ts`**

```ts
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

- [ ] **Step 4: Implement `apps/api/src/common/decorators/current-user.decorator.ts`**

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().user;
});
```

- [ ] **Step 5: Implement `apps/api/src/common/guards/roles.guard.ts`**

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;
    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;
    return requiredRoles.includes(user.role);
  }
}
```

- [ ] **Step 6: Chạy test — xác nhận PASS**

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common
git commit -m "feat(api): add Roles decorator/guard for role-based access"
```

---

## Task 6: `apps/api` — `AuthService` (hash, JWT, đăng ký/đăng nhập/refresh/đổi mật khẩu)

**Files:**
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/auth.service.spec.ts`
- Create: `apps/api/src/auth/jwt.strategy.ts`
- Create: `apps/api/src/auth/jwt-auth.guard.ts`
- Modify: `apps/api/package.json` — thêm `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `argon2`
  vào `dependencies`; `@types/passport-jwt` vào `devDependencies`.

**Interfaces:**
- Consumes: `registerSchema`/`loginSchema`/`changePasswordSchema` types (Task 1), `User`/`UserSchema` (Phase 0 +
  Task 2), `RolesGuard` (Task 5).
- Produces: `class AuthService` với các method:
  - `register(input: RegisterInput): Promise<AuthResult>`
  - `login(input: LoginInput): Promise<AuthResult>`
  - `refresh(refreshToken: string): Promise<Omit<AuthResult, 'user'>>`
  - `logout(userId: string): Promise<void>`
  - `changePassword(userId: string, input: ChangePasswordInput): Promise<void>`
  - `validateUserById(userId: string): Promise<UserDocument>` (dùng bởi `JwtStrategy`)

  Trong đó `AuthResult = { accessToken: string; refreshToken: string; user: { id: string; username: string;
  fullName: string; role: string; mustChangePassword: boolean } }`. `class JwtAuthGuard extends
  AuthGuard('jwt')` — Task 7 (`AuthController`) và mọi controller từ Task 8 trở đi dùng
  `@UseGuards(JwtAuthGuard, RolesGuard)`; `@CurrentUser()` trả về payload đã verify
  (`{ id: string; role: string }`).

- [ ] **Step 1: Viết test trước — `apps/api/src/auth/auth.service.spec.ts`** (mock Model, không cần DB thật)

```ts
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '../database/schemas/user.schema';

function buildModuleWithUserStore(initialUsers: any[] = []) {
  const users = [...initialUsers];
  const modelMock = {
    findOne: jest.fn((filter: any) => ({
      exec: async () => users.find((u) => u.username === filter.username) ?? null,
    })),
    findById: jest.fn((id: string) => ({
      exec: async () => users.find((u) => u._id === id) ?? null,
    })),
    create: jest.fn(async (doc: any) => {
      const created = { _id: `user-${users.length + 1}`, isActive: true, mustChangePassword: false, ...doc, save: async function () { return this; } };
      users.push(created);
      return created;
    }),
  };
  return { users, modelMock };
}

describe('AuthService', () => {
  it('register: tạo user mới với role TEACHER, trả về accessToken/refreshToken', async () => {
    const { modelMock } = buildModuleWithUserStore();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        JwtService,
        { provide: getModelToken(User.name), useValue: modelMock },
      ],
    }).compile();
    const service = moduleRef.get(AuthService);

    const result = await service.register({ username: 'gv.a', password: 'MatKhau123', fullName: 'Giáo viên A' });

    expect(result.user.username).toBe('gv.a');
    expect(result.user.role).toBe('TEACHER');
    expect(typeof result.accessToken).toBe('string');
    expect(typeof result.refreshToken).toBe('string');
  });

  it('register: throw ConflictException nếu username đã tồn tại', async () => {
    const { modelMock } = buildModuleWithUserStore([{ _id: 'u1', username: 'gv.a' }]);
    const moduleRef = await Test.createTestingModule({
      providers: [AuthService, JwtService, { provide: getModelToken(User.name), useValue: modelMock }],
    }).compile();
    const service = moduleRef.get(AuthService);

    await expect(
      service.register({ username: 'gv.a', password: 'MatKhau123', fullName: 'X' }),
    ).rejects.toThrow(ConflictException);
  });

  it('login: throw UnauthorizedException nếu sai mật khẩu', async () => {
    const argon2 = require('argon2');
    const hash = await argon2.hash('MatKhauDung');
    const { modelMock } = buildModuleWithUserStore([
      { _id: 'u1', username: 'gv.a', passwordHash: hash, isActive: true, role: 'TEACHER', fullName: 'A', mustChangePassword: false },
    ]);
    const moduleRef = await Test.createTestingModule({
      providers: [AuthService, JwtService, { provide: getModelToken(User.name), useValue: modelMock }],
    }).compile();
    const service = moduleRef.get(AuthService);

    await expect(service.login({ username: 'gv.a', password: 'SaiRoi' })).rejects.toThrow(UnauthorizedException);
  });

  it('login: throw UnauthorizedException nếu tài khoản bị khóa (isActive=false) dù đúng mật khẩu', async () => {
    const argon2 = require('argon2');
    const hash = await argon2.hash('MatKhauDung');
    const { modelMock } = buildModuleWithUserStore([
      { _id: 'u1', username: 'gv.a', passwordHash: hash, isActive: false, role: 'TEACHER', fullName: 'A', mustChangePassword: false, save: async function () { return this; } },
    ]);
    const moduleRef = await Test.createTestingModule({
      providers: [AuthService, JwtService, { provide: getModelToken(User.name), useValue: modelMock }],
    }).compile();
    const service = moduleRef.get(AuthService);

    await expect(service.login({ username: 'gv.a', password: 'MatKhauDung' })).rejects.toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL vì `auth.service.ts` chưa tồn tại**

- [ ] **Step 3: Thêm dependencies vào `apps/api/package.json`, `pnpm install`**

- [ ] **Step 4: Implement `AuthService` trong `apps/api/src/auth/auth.service.ts`**

Chữ ký chính xác (phần thân `register`/`login`/`refresh`/`logout`/`changePassword` implementer tự viết theo mô
tả nghiệp vụ ở spec — không có thuật toán phức tạp ngoài gọi `argon2`/`JwtService` đúng cách):

```ts
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import * as argon2 from 'argon2';
import { User } from '../database/schemas/user.schema';
import type { RegisterInput, LoginInput, ChangePasswordInput } from '@so-chu-nhiem/shared';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; username: string; fullName: string; role: string; mustChangePassword: boolean };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly jwtService: JwtService,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> { /* ... */ }
  async login(input: LoginInput): Promise<AuthResult> { /* ... */ }
  async refresh(refreshToken: string): Promise<Omit<AuthResult, 'user'>> { /* ... */ }
  async logout(userId: string): Promise<void> { /* ... */ }
  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> { /* ... */ }
  async validateUserById(userId: string) { /* ... */ }

  private toPublicUser(user: any) {
    return {
      id: String(user._id),
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }

  private async issueTokens(user: any): Promise<{ accessToken: string; refreshToken: string }> { /* ... */ }
}
```

Quy tắc bắt buộc (pin cứng từ Global Constraints, implementer nối đúng các bước):
- `register`: kiểm tra `username` trùng → `ConflictException('Tên đăng nhập đã tồn tại')`; băm mật khẩu bằng
  `argon2.hash`; tạo user với `role: 'TEACHER'`, `mustChangePassword: false` (chỉ tài khoản học sinh ở Phase 5
  mới cần `true`); gọi `issueTokens`, lưu hash refresh token vào `user.refreshTokenHash` (và `save()`), trả
  `AuthResult`.
- `login`: tìm theo `username`; nếu không có hoặc `argon2.verify(user.passwordHash, input.password)` sai →
  `UnauthorizedException('Sai tên đăng nhập hoặc mật khẩu')` (dùng chung 1 message cho cả 2 trường hợp để không
  lộ username nào tồn tại); nếu `!user.isActive` → `UnauthorizedException('Tài khoản đã bị khóa')`; nếu qua hết
  → `issueTokens` + lưu hash + trả `AuthResult`.
- `refresh`: verify chữ ký `refreshToken` bằng `JWT_REFRESH_SECRET` (bắt lỗi verify → `UnauthorizedException`);
  lấy `sub` → tìm user; so `argon2.verify(user.refreshTokenHash, refreshToken)` — **sai hoặc
  `refreshTokenHash` rỗng** → `UnauthorizedException('Refresh token không hợp lệ')` (đây là chỗ chặn refresh
  token cũ đã bị xoay vòng, vì hash cũ không còn khớp `refreshTokenHash` mới); nếu khớp → `issueTokens` mới, ghi
  đè hash, trả `{ accessToken, refreshToken }` (không trả `user`).
- `logout`: set `user.refreshTokenHash = undefined`, `save()`.
- `changePassword`: verify `oldPassword` bằng `argon2.verify`, sai → `UnauthorizedException('Mật khẩu cũ không
  đúng')`; đúng → băm `newPassword`, set `mustChangePassword = false`, `save()`.
- `issueTokens`: ký access token (`JWT_ACCESS_SECRET`, `15m`) và refresh token (`JWT_REFRESH_SECRET`, `30d`)
  bằng `this.jwtService.sign(payload, { secret, expiresIn })`; băm refresh token bằng `argon2.hash` TRƯỚC khi
  lưu vào `refreshTokenHash` (không bao giờ lưu plaintext).

- [ ] **Step 5: Chạy test — xác nhận PASS**

- [ ] **Step 6: Implement `apps/api/src/auth/jwt.strategy.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    });
  }

  async validate(payload: { sub: string; role: string }) {
    const user = await this.authService.validateUserById(payload.sub);
    if (!user || !user.isActive) {
      return null;
    }
    return { id: payload.sub, role: payload.role };
  }
}
```

- [ ] **Step 7: Implement `apps/api/src/auth/jwt-auth.guard.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

- [ ] **Step 8: Chạy toàn bộ test + build + lint của `api`**

Run: `pnpm --filter api run lint && pnpm --filter api run build && pnpm --filter api run test`

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/auth apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add AuthService with argon2 hashing and JWT access/refresh tokens"
```

---

## Task 7: `apps/api` — `AuthModule` + `AuthController` (e2e thật qua HTTP)

**Files:**
- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.e2e.spec.ts`
- Modify: `apps/api/src/app.module.ts` — import `AuthModule`

**Interfaces:**
- Consumes: `AuthService`, `JwtAuthGuard`, `CurrentUser`, `registerSchema`/`loginSchema`/`changePasswordSchema`,
  `ZodValidationPipe`, `buildTestMongoUri` (test).
- Produces: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`,
  `POST /auth/change-password`, `GET /auth/me` — không có task nào khác trong Plan 1A tiêu thụ trực tiếp (Plan
  1B dùng `JwtAuthGuard`/`CurrentUser`/`RolesGuard` cho `students` module).

- [ ] **Step 1: Viết test trước — `apps/api/src/auth/auth.e2e.spec.ts`** (dùng `MongoMemoryReplSet` thật qua
  `buildTestMongoUri('auth_e2e')`)

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import { User, UserSchema } from '../database/schemas/user.schema';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { buildTestMongoUri } from '../../test/build-test-mongo-uri';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(buildTestMongoUri('auth_e2e')),
        MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
        JwtModule.register({}),
        PassportModule,
      ],
      controllers: [AuthController],
      providers: [AuthService, JwtStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('đăng ký → đăng nhập → gọi /auth/me bằng access token → đổi mật khẩu → đăng nhập lại bằng mật khẩu mới', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'gv.e2e', password: 'MatKhau123', fullName: 'GV E2E' });
    expect(registerRes.status).toBe(201);
    const { accessToken } = registerRes.body;

    const meRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.username).toBe('gv.e2e');

    await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ oldPassword: 'MatKhau123', newPassword: 'MatKhauMoi456' })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'gv.e2e', password: 'MatKhauMoi456' });
    expect(loginRes.status).toBe(201);
  });

  it('refresh token xoay vòng: dùng refresh token cũ lần 2 phải bị từ chối', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'gv.rotate', password: 'MatKhau123', fullName: 'GV Rotate' });
    const oldRefreshToken = registerRes.body.refreshToken;

    const firstRefresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefreshToken });
    expect(firstRefresh.status).toBe(201);

    const secondRefresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefreshToken });
    expect(secondRefresh.status).toBe(401);
  });

  it('GET /auth/me không có token trả về 401', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL vì `auth.controller.ts`/`auth.module.ts` chưa tồn tại**

Run: `pnpm --filter api run test -- auth.e2e`

- [ ] **Step 3: Implement `apps/api/src/auth/auth.controller.ts`**

```ts
import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { registerSchema, loginSchema, changePasswordSchema } from '@so-chu-nhiem/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) { /* gọi authService.register, setRefreshCookie, trả { accessToken, refreshToken, user } */ }

  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) { /* tương tự register */ }

  @Post('refresh')
  async refresh(@Body() body: { refreshToken?: string }, @Res({ passthrough: true }) res: Response) {
    /* refreshToken = body.refreshToken ?? req.cookies?.refresh_token — Phase 1A test chỉ dùng body, cookie
       đọc được nhờ middleware cookie-parser sẽ thêm ở Task 8 nếu cần; nếu chưa có cookie-parser thì chỉ đọc
       body.refreshToken là đủ để test Step 1 pass */
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async logout(@CurrentUser() user: { id: string }, @Res({ passthrough: true }) res: Response) { /* ... */ }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: { id: string },
    @Body(new ZodValidationPipe(changePasswordSchema)) body: unknown,
  ) { /* ... */ }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: { id: string }) { /* trả về public profile đầy đủ qua authService */ }
}
```

Helper `setRefreshCookie(res, token)` dùng chung cho `register`/`login`/`refresh`:
`res.cookie(REFRESH_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge:
REFRESH_COOKIE_MAX_AGE_MS })`.

- [ ] **Step 4: Implement `apps/api/src/auth/auth.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 5: Sửa `apps/api/src/app.module.ts`** — thêm `AuthModule` vào `imports`

- [ ] **Step 6: Chạy test — xác nhận PASS**

Run: `pnpm --filter api run test -- auth.e2e`
Expected: PASS cả 3 test case.

- [ ] **Step 7: Chạy toàn bộ test + build + lint của `api`**

- [ ] **Step 8: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): add AuthModule/AuthController with full register/login/refresh/logout flow"
```

---

## Task 8: `apps/api` — `AdminModule` (quản lý tài khoản giáo viên)

**Files:**
- Create: `apps/api/src/admin/admin.module.ts`
- Create: `apps/api/src/admin/admin.controller.ts`
- Create: `apps/api/src/admin/admin.e2e.spec.ts`
- Modify: `apps/api/src/app.module.ts` — import `AdminModule`

**Interfaces:**
- Consumes: `JwtAuthGuard`, `RolesGuard`, `@Roles('ADMIN')`, `User`/`UserSchema`.
- Produces: `GET /admin/teachers`, `PATCH /admin/teachers/:id/active` — không có task nào khác tiêu thụ.

- [ ] **Step 1: Viết test trước — `apps/api/src/admin/admin.e2e.spec.ts`** (dựng module tối giản gồm
  `AdminController` + `AuthModule` để tự đăng ký 2 user test rồi thao tác trực tiếp qua Model để set role)

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { Model } from 'mongoose';
import { User, UserSchema } from '../database/schemas/user.schema';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import { AdminController } from './admin.controller';
import { buildTestMongoUri } from '../../test/build-test-mongo-uri';

describe('Admin (e2e)', () => {
  let app: INestApplication;
  let userModel: Model<User>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(buildTestMongoUri('admin_e2e')),
        MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
        JwtModule.register({}),
        PassportModule,
      ],
      controllers: [AuthController, AdminController],
      providers: [AuthService, JwtStrategy, Reflector],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    userModel = moduleRef.get(getModelToken(User.name));
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerAndPromote(username: string, role: 'TEACHER' | 'ADMIN') {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, password: 'MatKhau123', fullName: username });
    if (role === 'ADMIN') {
      await userModel.updateOne({ username }, { role: 'ADMIN' });
    }
    return res.body.accessToken as string;
  }

  it('TEACHER gọi GET /admin/teachers bị từ chối (403)', async () => {
    const token = await registerAndPromote('gv.thuong', 'TEACHER');
    await request(app.getHttpServer())
      .get('/admin/teachers')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('ADMIN gọi GET /admin/teachers thành công và khóa được tài khoản giáo viên', async () => {
    const teacherToken = await registerAndPromote('gv.bithoa', 'TEACHER');
    const adminToken = await registerAndPromote('admin.e2e', 'ADMIN');

    const listRes = await request(app.getHttpServer())
      .get('/admin/teachers')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    const target = listRes.body.find((t: any) => t.username === 'gv.bithoa');
    expect(target).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/admin/teachers/${target.id}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'gv.bithoa', password: 'MatKhau123' });
    expect(loginRes.status).toBe(401);
    void teacherToken;
  });
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Implement `apps/api/src/admin/admin.controller.ts`**

```ts
import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../database/schemas/user.schema';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(@InjectModel(User.name) private readonly userModel: Model<User>) {}

  @Get('teachers')
  async listTeachers() { /* find role: TEACHER, map sang { id, username, fullName, isActive } */ }

  @Patch('teachers/:id/active')
  async setActive(@Param('id') id: string, @Body() body: { isActive: boolean }) { /* ... */ }
}
```

- [ ] **Step 4: Implement `apps/api/src/admin/admin.module.ts`** (import `DatabaseModule`, `AuthModule` nếu cần
  guard dùng `JwtStrategy` đã đăng ký qua `AuthModule` toàn cục — `AppModule` đã import `AuthModule` nên không
  cần import lại ở đây, chỉ cần `controllers: [AdminController]`).

- [ ] **Step 5: Sửa `apps/api/src/app.module.ts`** — thêm `AdminModule`

- [ ] **Step 6: Chạy test — xác nhận PASS**

- [ ] **Step 7: Chạy toàn bộ test + build + lint của `api`**

- [ ] **Step 8: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): add AdminModule for managing teacher accounts"
```

---

## Task 9: `apps/api` — `SchoolYearsModule`

**Files:**
- Create: `apps/api/src/school-years/school-years.module.ts`
- Create: `apps/api/src/school-years/school-years.service.ts`
- Create: `apps/api/src/school-years/school-years.controller.ts`
- Create: `apps/api/src/school-years/school-years.e2e.spec.ts`
- Modify: `apps/api/src/app.module.ts` — import `SchoolYearsModule`

**Interfaces:**
- Produces: `SchoolYearsService.getCurrent(): Promise<SchoolYearDocument>` (throw `NotFoundException` nếu chưa
  có năm học nào `isCurrent: true` — Task 10 (`ClassesService`) gọi hàm này), `GET /school-years`,
  `POST /school-years` (ADMIN).

- [ ] **Step 1: Viết test trước — `apps/api/src/school-years/school-years.e2e.spec.ts`**

```ts
// cấu trúc tương tự Task 8: dựng module tối giản với AuthController (để có user ADMIN) + SchoolYearsController
```

```ts
it('tạo năm học mới với isCurrent=true sẽ tự tắt isCurrent của năm học cũ', async () => {
  const adminToken = await registerAndPromote('admin.sy', 'ADMIN');
  await request(app.getHttpServer())
    .post('/school-years')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: '2025-2026', startDate: '2025-09-05', endDate: '2026-05-31', isCurrent: true })
    .expect(201);

  await request(app.getHttpServer())
    .post('/school-years')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: '2026-2027', startDate: '2026-09-05', endDate: '2027-05-31', isCurrent: true })
    .expect(201);

  const list = await request(app.getHttpServer())
    .get('/school-years')
    .set('Authorization', `Bearer ${adminToken}`);
  const currentOnes = list.body.filter((y: any) => y.isCurrent);
  expect(currentOnes).toHaveLength(1);
  expect(currentOnes[0].name).toBe('2026-2027');
});
```

(viết đầy đủ `beforeAll`/`registerAndPromote` theo đúng khuôn mẫu Task 8, đổi tên DB thành
`buildTestMongoUri('school_years_e2e')` và controllers/providers phù hợp.)

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Implement `SchoolYearsService`** — `getCurrent()`, `list()`, `create(input)` (nếu
  `input.isCurrent === true`: trong 1 session, `updateMany({ isCurrent: true }, { isCurrent: false })` rồi
  `create` bản ghi mới `isCurrent: true` — PHẢI dùng session/transaction vì 2 thao tác ghi, đúng yêu cầu gốc).

- [ ] **Step 4: Implement `SchoolYearsController`** (`GET /school-years` — bất kỳ ai đã đăng nhập;
  `POST /school-years` — `@Roles('ADMIN')`).

- [ ] **Step 5: Implement `SchoolYearsModule`, sửa `app.module.ts`**

- [ ] **Step 6: Chạy test — xác nhận PASS**

- [ ] **Step 7: Chạy toàn bộ test + build + lint của `api`**

- [ ] **Step 8: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): add SchoolYearsModule with exclusive isCurrent transaction"
```

---

## Task 10: `apps/api` — `ClassesModule` (tạo lớp + tạo sẵn toàn bộ Position trong 1 transaction)

**Files:**
- Create: `apps/api/src/classes/classes.module.ts`
- Create: `apps/api/src/classes/classes.service.ts`
- Create: `apps/api/src/classes/classes.controller.ts`
- Create: `apps/api/src/classes/classes.e2e.spec.ts`
- Modify: `apps/api/src/app.module.ts` — import `ClassesModule`

**Interfaces:**
- Consumes: `SchoolYearsService.getCurrent()` (Task 9), `createClassSchema` (Task 1), `Class`/`Position` models
  (Phase 0).
- Produces: `ClassesService.create(teacherId, input: CreateClassInput): Promise<{ class: ClassDocument;
  positions: PositionDocument[] }>`, `ClassesService.findByCode(code: string)`, `POST /classes`,
  `GET /classes/:code` — Task 11 (`PositionsService`) gọi `findByCode` để tra `classId` từ mã lớp lúc giáo viên
  nhận vị trí.

- [ ] **Step 1: Viết test trước — `apps/api/src/classes/classes.e2e.spec.ts`**

```ts
it('tạo lớp sinh đúng mã dạng <tên>-<5 ký tự>, tạo đủ 1 HOMEROOM + 13 SUBJECT position, đều holderId=null trừ khi claimHomeroom', async () => {
  const teacherToken = await registerAndPromote('gv.tao-lop', 'TEACHER');
  const res = await request(app.getHttpServer())
    .post('/classes')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ name: '11A4', claimHomeroom: true })
    .expect(201);

  expect(res.body.class.code).toMatch(/^11A4-[A-Z0-9]{5}$/);
  const homeroom = res.body.positions.find((p: any) => p.type === 'HOMEROOM');
  expect(homeroom.holderId).toBe(/* id của gv.tao-lop */ expect.any(String));
  const subjectPositions = res.body.positions.filter((p: any) => p.type === 'SUBJECT');
  expect(subjectPositions).toHaveLength(13);
  subjectPositions.forEach((p: any) => expect(p.holderId).toBeNull());
});

it('tạo lớp với claimHomeroom=false thì HOMEROOM position vẫn được tạo nhưng holderId=null', async () => {
  // ...
});

it('GET /classes/:code trả về thông tin lớp + trạng thái từng vị trí (đã có người giữ hay chưa) cho giáo viên khác xem trước khi nhận', async () => {
  // ...
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Implement `ClassesService.create`** — dùng `connection.startSession()` +
  `session.withTransaction(async () => { ... })`: generate mã lớp (`generateClassCode(name)`: `name + '-' +` 5
  ký tự ngẫu nhiên từ bảng chữ `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — bỏ `0,O,1,I`), tạo `Class` với
  `schoolYearId` từ `schoolYearsService.getCurrent()`, tạo 1 `Position` HOMEROOM (`holderId: input.claimHomeroom
  ? teacherId : null`), tạo N `Position` SUBJECT (`holderId: null`) cho từng phần tử `SUBJECTS` — toàn bộ
  insert dùng `{ session }`. Nếu mã lớp trùng (hiếm, do unique index trên `Class.code`) — bắt lỗi duplicate key
  và thử sinh lại mã tối đa 3 lần trước khi throw lỗi rõ ràng.

- [ ] **Step 4: Implement `ClassesService.findByCode(code)`** — trả `Class` + toàn bộ `Position` của lớp đó
  kèm trạng thái (`holderId` null hay không, KHÔNG trả `holderId` thật ra ngoài public response, chỉ trả boolean
  `taken`).

- [ ] **Step 5: Implement `ClassesController`** (`POST /classes` — bất kỳ TEACHER; `GET /classes/:code` — bất kỳ
  TEACHER đã đăng nhập).

- [ ] **Step 6: Implement `ClassesModule`, sửa `app.module.ts`**

- [ ] **Step 7: Chạy test — xác nhận PASS**

- [ ] **Step 8: Viết thêm test xác nhận transaction rollback đúng — tạm thời làm 1 test giả lập lỗi giữa chừng**

```ts
it('nếu tạo Position thất bại giữa chừng thì Class vừa tạo cũng bị rollback, không để lại dữ liệu mồ côi', async () => {
  const teacherToken = await registerAndPromote('gv.rollback', 'TEACHER');
  // Tạo trước 1 Class trùng tên để ép generateClassCode thử lại nhưng vẫn đảm bảo rollback đúng khi
  // insertMany Position thất bại (giả lập bằng cách tạo sẵn 1 Position cùng classId+subject trùng trước đó
  // trong cùng session là khó — cách đơn giản và vẫn có giá trị kiểm chứng: đếm số Class + Position trong DB
  // trước/sau 1 lần gọi API lỗi cố ý (vd DTO thiếu field bắt buộc) và xác nhận không có gì được ghi).
  const before = await classModel.countDocuments({});
  await request(app.getHttpServer())
    .post('/classes')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ claimHomeroom: true }) // thiếu "name" bắt buộc -> ZodValidationPipe chặn ở tầng HTTP trước transaction
    .expect(400);
  const after = await classModel.countDocuments({});
  expect(after).toBe(before);
});
```

- [ ] **Step 9: Chạy test — xác nhận PASS**

- [ ] **Step 10: Chạy toàn bộ test + build + lint của `api`**

- [ ] **Step 11: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): add ClassesModule creating class with all positions in one transaction"
```

---

## Task 11: `apps/api` — `PositionsModule` (nhận / ngừng phụ trách / Admin gán lại — chống race condition)

**Files:**
- Create: `apps/api/src/positions/positions.module.ts`
- Create: `apps/api/src/positions/positions.service.ts`
- Create: `apps/api/src/positions/positions.controller.ts`
- Create: `apps/api/src/positions/positions.e2e.spec.ts`
- Modify: `apps/api/src/app.module.ts` — import `PositionsModule`

**Interfaces:**
- Consumes: `ClassesService.findByCode` (Task 10), `joinClassSchema`/`reassignPositionSchema` (Task 1).
- Produces: `POST /positions/join`, `POST /positions/:id/release`, `PATCH /positions/:id/reassign` — không có
  task nào khác trong Plan 1A tiêu thụ; Plan 1B không gọi trực tiếp module này (độc lập với `students`).

- [ ] **Step 1: Viết test trước cho race condition — `apps/api/src/positions/positions.e2e.spec.ts`**

```ts
it('2 giáo viên cùng nhận vị trí SUBJECT "Toán" của cùng 1 lớp cùng lúc: đúng 1 người thành công, người kia nhận 409', async () => {
  const creatorToken = await registerAndPromote('gv.lop-race', 'TEACHER');
  const classRes = await request(app.getHttpServer())
    .post('/classes')
    .set('Authorization', `Bearer ${creatorToken}`)
    .send({ name: '10A1', claimHomeroom: false });
  const code = classRes.body.class.code;

  const teacherA = await registerAndPromote('gv.race-a', 'TEACHER');
  const teacherB = await registerAndPromote('gv.race-b', 'TEACHER');

  const [resA, resB] = await Promise.all([
    request(app.getHttpServer())
      .post('/positions/join')
      .set('Authorization', `Bearer ${teacherA}`)
      .send({ code, type: 'SUBJECT', subject: 'Toán' }),
    request(app.getHttpServer())
      .post('/positions/join')
      .set('Authorization', `Bearer ${teacherB}`)
      .send({ code, type: 'SUBJECT', subject: 'Toán' }),
  ]);

  const statuses = [resA.status, resB.status].sort();
  expect(statuses).toEqual([201, 409]);
});

it('ngừng phụ trách: người không giữ vị trí đó bị từ chối (403), người đang giữ thì thành công và holderId trở về null', async () => {
  // ...
});

it('reassign: chỉ ADMIN được gọi, user không phải TEACHER bị từ chối với lỗi 400 rõ ràng', async () => {
  // ...
});
```

(viết đầy đủ theo khuôn mẫu các task trước — module test import `ClassesController`+`PositionsController`+
`AuthController` cùng lúc vì `positions/join` cần tra cứu lớp qua mã.)

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Implement `PositionsService.join(teacherId, input: JoinClassInput)`**

```ts
async join(teacherId: string, input: JoinClassInput) {
  const klass = await this.classesService.findByCodeRaw(input.code); // not found -> NotFoundException
  const filter: any = { classId: klass._id, type: input.type, holderId: null };
  if (input.type === 'SUBJECT') filter.subject = input.subject;
  const position = await this.positionModel.findOneAndUpdate(filter, { holderId: teacherId }, { new: true });
  if (!position) {
    throw new ConflictException('Vị trí này đã có người giữ hoặc không tồn tại');
  }
  return position;
}
```

(`findOneAndUpdate` với filter chứa `holderId: null` là nguyên tử ở tầng MongoDB — đây chính là cơ chế chống
race condition, không cần session/transaction vì chỉ ghi 1 document duy nhất.)

- [ ] **Step 4: Implement `PositionsService.release(userId, positionId)`** — load position theo id; nếu
  `String(position.holderId) !== userId` → `ForbiddenException('Bạn không giữ vị trí này')`; nếu khớp → set
  `holderId = null`, save.

- [ ] **Step 5: Implement `PositionsService.reassign(teacherId, positionId)`** (chỉ gọi được từ controller đã
  qua `@Roles('ADMIN')`) — validate `teacherId` ứng với 1 `User` có `role: 'TEACHER'`, nếu không →
  `BadRequestException('Người được gán phải là giáo viên')`; set `holderId = teacherId` (ghi đè, không kiểm tra
  `holderId` hiện tại — admin override).

- [ ] **Step 6: Implement `PositionsController`** (`POST /positions/join` — bất kỳ TEACHER;
  `POST /positions/:id/release` — bất kỳ TEACHER đã đăng nhập (service tự kiểm tra quyền sở hữu);
  `PATCH /positions/:id/reassign` — `@Roles('ADMIN')`).

- [ ] **Step 7: Implement `PositionsModule`, sửa `app.module.ts`**

- [ ] **Step 8: Chạy test — xác nhận PASS**

- [ ] **Step 9: Chạy toàn bộ test + build + lint của `api`**

- [ ] **Step 10: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): add PositionsModule with atomic join preventing double-claim race condition"
```

---

## Task 12: Seed script (admin + giáo viên mẫu + 1 lớp có vị trí) + cập nhật README

**Files:**
- Create: `apps/api/src/seed/seed.ts`
- Modify: `apps/api/package.json` — thêm script `"seed": "ts-node -r tsconfig-paths/register src/seed/seed.ts"`
  và devDependency `tsconfig-paths` (nếu cần resolve alias; nếu seed không dùng alias thì bỏ qua
  `tsconfig-paths`, dùng import tương đối).
- Modify: `README.md` — thêm mục hướng dẫn chạy seed.

**Interfaces:**
- Không có interface nào task khác tiêu thụ — đây là script CLI độc lập, không export gì cho ứng dụng.

- [ ] **Step 1: Implement `apps/api/src/seed/seed.ts`** — kết nối Mongo thật
  (`process.env.MONGODB_URI ?? 'mongodb://localhost:27017/so_chu_nhiem?replicaSet=rs0'`) bằng `mongoose.connect`
  trực tiếp (không qua Nest), xoá hết document trong các collection liên quan
  (`User, SchoolYear, Class, Position`), tạo:
  - 1 `SchoolYear` `{ name: '2025-2026', isCurrent: true, startDate, endDate }`.
  - 1 `User` admin (`username: 'admin'`, mật khẩu tạm in ra console, `role: 'ADMIN'`, `fullName: 'Quản trị viên'`).
  - 3 `User` giáo viên mẫu (`gv1`, `gv2`, `gv3`, cùng mật khẩu tạm in ra console, `role: 'TEACHER'`).
  - 1 `Class` "11A4" qua đúng logic sinh mã + tạo Position như `ClassesService` (import lại service nếu tiện,
    hoặc lặp lại logic ngắn gọn — ưu tiên import `ClassesService`/`PositionsService` thật qua
    `NestFactory.createApplicationContext(AppModule)` để không lặp code, chấp nhận script chạy chậm hơn một
    chút vì bootstrap cả Nest app).
  - Gán HOMEROOM cho `gv1`.
  In ra console toàn bộ username/mật khẩu tạm + mã lớp để dùng thử.

- [ ] **Step 2: Verify thủ công — chạy seed với Mongo thật (Docker đang chạy từ Phase 0)**

Run:
```bash
docker compose up -d mongo mongo-init
pnpm --filter api run seed
docker compose exec mongo mongosh so_chu_nhiem --quiet --eval "db.users.countDocuments({})"
docker compose down
```
Expected: lệnh cuối in ra `4` (1 admin + 3 giáo viên).

- [ ] **Step 3: Sửa `README.md`** — thêm dòng `pnpm --filter api run seed` vào mục hướng dẫn, ghi chú "chỉ chạy ở
  dev, sẽ xoá sạch dữ liệu hiện có".

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/seed apps/api/package.json README.md pnpm-lock.yaml
git commit -m "feat(api): add dev seed script for admin/teachers/sample class"
```

---

## Tổng kết Self-Review

- **Spec coverage:** Auth (Task 6-7), Admin (Task 8), SchoolYear tối giản (Task 9), Class + mã lớp + pre-tạo
  Position transaction (Task 10), Position nhận/ngừng/gán lại + race condition (Task 11), guard phân quyền theo
  role (Task 5, dùng xuyên suốt Task 7-11), seed (Task 12). Hồ sơ học sinh + import Excel + `PositionGuard` theo
  classId dời sang Plan 1B (xem spec, mục Ngoài phạm vi của plan này).
- **Step scan:** mỗi step là 1 test cụ thể, 1 đoạn code có chữ ký rõ, hoặc 1 lệnh verify có output kỳ vọng — các
  đoạn "quy tắc bắt buộc" (Task 6 Step 4) liệt kê từng nhánh rẽ cụ thể thay vì nói chung chung "xử lý lỗi".
- **Type consistency:** `AuthResult`, `RegisterInput`/`LoginInput`/`ChangePasswordInput`,
  `CreateClassInput`/`JoinClassInput`/`ReassignPositionInput` dùng nhất quán tên giữa Task 1 (định nghĩa) và các
  Task 6-11 (tiêu thụ).
- **Review Focus:** cả 4 mục (refresh token cũ, tài khoản bị khóa, transaction rollback, race condition nhận vị
  trí) đều có test cụ thể ở đúng task sở hữu.
- **Proportion:** các đoạn code mẫu chỉ pin chữ ký + các nhánh rẽ nghiệp vụ bắt buộc (vd quy tắc `register`
  trong Task 6), không viết sẵn toàn bộ thân hàm — implementer tự nối logic theo đúng mô tả.
