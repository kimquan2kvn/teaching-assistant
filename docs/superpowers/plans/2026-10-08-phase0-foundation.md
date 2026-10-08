# Phase 0 — Khởi tạo nền tảng Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng khung kỹ thuật monorepo (api NestJS + web Next.js + packages/shared) với docker-compose Mongo replica set, schema Mongoose nền tảng, CI cơ bản, và layout/theme shadcn cho web — chưa có nghiệp vụ thật nào.

**Architecture:** pnpm workspace 3 package độc lập (`apps/api`, `apps/web`, `packages/shared`) nối với nhau qua `workspace:*`. `apps/api` chỉ có 1 endpoint `/health` chứng minh pipeline Nest + Mongoose chạy được. `apps/web` là Next.js App Router JS thuần với 3 primitive shadcn tự viết tay (Button/Input/Sheet) dựng layout sidebar responsive + Redux Toolkit store rỗng. Mongo chạy qua docker-compose dạng 1-node replica set.

**Tech Stack:** pnpm workspaces, NestJS 10 + Mongoose 8 (TypeScript), Next.js 14 App Router (JavaScript) + Tailwind 3 + Redux Toolkit 2, Jest (+ ts-jest cho TS, next/jest cho web) + React Testing Library, Docker Compose, GitHub Actions.

**Spec:** [docs/superpowers/specs/2026-10-08-phase0-foundation-design.md](../specs/2026-10-08-phase0-foundation-design.md) (và bối cảnh nghiệp vụ đầy đủ ở [docs/PROJECT_BRIEF.md](../../PROJECT_BRIEF.md))

## Global Constraints

- Node.js >= 20 (sandbox hiện tại mặc định Node 18 qua nvm — mọi lệnh `pnpm`/`node` trong plan này giả định đã chạy `nvm use 20` trước, xem Task 1).
- `packageManager` trong root `package.json` ghim đúng bản pnpm đã cài trong môi trường: `pnpm@12.3.4`.
- `apps/web` viết bằng **JavaScript** (không TypeScript). `apps/api` và `packages/shared` viết bằng **TypeScript**.
- Package name để dùng với `pnpm --filter`: `api`, `web`, `@so-chu-nhiem/shared`.
- Phiên bản thư viện chính (implementer chọn đúng major, patch/minor mới nhất tương thích): NestJS `^10`, `@nestjs/mongoose` + `mongoose` `^8`, Next.js `^14` (App Router), React `^18`, Redux Toolkit `^2`, Tailwind CSS `^3.4`, `@radix-ui/react-dialog` `^1`, `class-variance-authority` `^0.7`, `clsx` `^2`, `tailwind-merge` `^2`, `lucide-react` mới nhất, Jest `^29`.
- CSS variables theme (đặt trong `apps/web/app/globals.css`, dùng đúng các giá trị này, không đổi tên biến khác hệ thống shadcn):
  `--brand:#F0B90B; --brand-hover:#D0980B; --sidebar-bg:#1E2329; --sidebar-fg:#B7BDC6; --sidebar-active-fg:#F0B90B; --border:#EAECEF; --fg:#1E2329; --fg-muted:#848E9C; --success:#0ECB81; --danger:#F6465D`.
- Font: `next/font/google` — Inter (`--font-sans`, thân chữ), IBM Plex Sans (`--font-heading`, tiêu đề), IBM Plex Mono (`--font-mono`, số liệu).
- Enum dùng xuyên suốt schema: `User.role ∈ {TEACHER, STUDENT, ADMIN}`; `Position.type ∈ {HOMEROOM, SUBJECT}`; `Student.status ∈ {ACTIVE, TRANSFERRED}`.
- `packages/shared` export `APP_NAME = 'So Chu Nhiem'` (chuỗi ASCII dùng làm định danh kỹ thuật/log — tên hiển thị tiếng Việt có dấu "Sổ Chủ Nhiệm" được hardcode riêng trong UI web, không lấy từ hằng số này).
- Mỗi package phải có script `lint`, `build`, `test` (hoặc no-op hợp lệ nếu thật sự không áp dụng) chạy được qua `pnpm -r run <script>` ở root mà không lỗi.
- Không tạo bất kỳ API/trang/schema nghiệp vụ nào ngoài những gì liệt kê trong các task dưới đây (PWA, auth thật, PPCT, điểm danh... đều thuộc phase sau).

## Review Focus

- Index `Position` phải đúng loại **partial unique** theo (`classId`,`subject`) khi `type=SUBJECT` và theo (`classId`,`type`) khi `type=HOMEROOM` — sai loại index (vd unique toàn cục không partial) sẽ chặn nhầm các lớp khác nhau hoặc cho phép 2 người giữ cùng 1 vị trí. → test ở Task 5.
- Endpoint `/health` phải luôn trả response hợp lệ (`status: 'ok'`) ngay cả khi Mongo mất kết nối (`db: 'disconnected'`), không được throw lỗi 500 — đây là endpoint mà hạ tầng/monitoring dựa vào. → test ở Task 4.
- `packages/shared` phải thực sự **import được** từ `apps/api` qua `workspace:*` (không chỉ build độc lập thành công) — đây là mục tiêu chính của Phase 0 (dùng lại cho React Native sau này), lỗi cấu hình workspace sẽ không lộ ra nếu chỉ test riêng từng package. → test ở Task 4 (health response chứa `APP_NAME` từ shared).
- Icon tìm kiếm và icon điều hướng phải là SVG/`lucide-react` thật, **tuyệt đối không phải emoji** (yêu cầu rõ trong spec giao diện) — dễ bị quên khi viết nhanh. → test ở Task 7 & Task 8.
- Trên màn hình nhỏ, 6 nhóm điều hướng không được biến mất hoàn toàn — phải mở được qua drawer, nếu không học sinh/giáo viên dùng điện thoại (ưu tiên hàng đầu theo yêu cầu) sẽ không vào được menu. → test ở Task 8.

---

## Task 1: Monorepo root — tooling & workspace scaffolding

**Files:**
- Create: `.nvmrc`
- Create: `.editorconfig`
- Create: `.gitignore`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `README.md`

**Interfaces:**
- Produces: root scripts `pnpm -r run lint`, `pnpm -r run build`, `pnpm -r run test` — mọi task sau phải thêm script `lint`/`build`/`test` tương ứng vào package.json của mình để các lệnh này chạy qua.

- [ ] **Step 1: Tạo `.nvmrc` với nội dung `20`**

- [ ] **Step 2: Tạo `.editorconfig`** (indent 2 spaces, UTF-8, LF, trim trailing whitespace, insert final newline — chuẩn phổ biến, implementer tự điền).

- [ ] **Step 3: Tạo `.gitignore`** gồm tối thiểu: `node_modules/`, `dist/`, `.next/`, `out/`, `coverage/`, `*.log`, `.env`, `.env.local`, `.DS_Store`.

- [ ] **Step 4: Tạo `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 5: Tạo `package.json` ở root**

```json
{
  "name": "so-chu-nhiem",
  "private": true,
  "packageManager": "pnpm@12.3.4",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev:api": "pnpm --filter api run dev",
    "dev:web": "pnpm --filter web run dev",
    "lint": "pnpm -r run lint",
    "build": "pnpm -r run build",
    "test": "pnpm -r run test"
  }
}
```

- [ ] **Step 6: Tạo `README.md`** ghi ngắn gọn: yêu cầu Node 20 (`nvm use 20`), cài đặt (`pnpm install`), chạy Mongo (`docker compose up -d mongo mongo-init`), chạy dev (`pnpm run dev:api`, `pnpm run dev:web`), chạy kiểm thử (`pnpm run lint && pnpm run build && pnpm run test`).

- [ ] **Step 7: Verify — chạy `nvm use 20 && node -v && corepack enable && pnpm -v` trong thư mục root**

Expected: in ra Node `v20.x.x` và pnpm `12.3.4`, không lỗi.

- [ ] **Step 8: Commit**

```bash
git add .nvmrc .editorconfig .gitignore package.json pnpm-workspace.yaml README.md
git commit -m "chore: scaffold pnpm monorepo root"
```

---

## Task 2: `packages/shared` — khung build + hằng số dùng chung

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/jest.config.js`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/index.test.ts`

**Interfaces:**
- Produces: `APP_NAME: string` export từ `@so-chu-nhiem/shared` (sau khi build, từ `dist/index.js`) — Task 4 (`apps/api`) import giá trị này.

- [ ] **Step 1: Viết test trước — `packages/shared/src/index.test.ts`**

```ts
import { APP_NAME } from './index';

describe('APP_NAME', () => {
  it('xuất đúng hằng số định danh ứng dụng', () => {
    expect(APP_NAME).toBe('So Chu Nhiem');
  });
});
```

- [ ] **Step 2: Tạo `packages/shared/jest.config.js`**

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
};
```

- [ ] **Step 3: Tạo `packages/shared/tsconfig.json`** (target `ES2020`, `module: commonjs`, `declaration: true`, `outDir: dist`, `rootDir: src`, `strict: true`).

- [ ] **Step 4: Tạo `packages/shared/package.json`** với `name: "@so-chu-nhiem/shared"`, `main: "dist/index.js"`, `types: "dist/index.d.ts"`, scripts `build: "tsc -p tsconfig.json"`, `lint: "eslint src --ext .ts"` (cấu hình ESLint tối thiểu recommended cho TS, implementer tự chọn bản ESLint tương thích), `test: "jest"`. Thêm devDependencies: `typescript`, `jest`, `ts-jest`, `@types/jest`, `@types/node`, `eslint` (+ plugin TS tương ứng).

- [ ] **Step 5: Chạy `pnpm install` ở root (yêu cầu Node 20 active), rồi chạy test — xác nhận FAIL vì `src/index.ts` chưa tồn tại**

Run: `cd packages/shared && pnpm run test`
Expected: FAIL — Cannot find module './index'

- [ ] **Step 6: Tạo `packages/shared/src/index.ts`**

```ts
export const APP_NAME = 'So Chu Nhiem';
```

- [ ] **Step 7: Chạy test — xác nhận PASS**

Run: `pnpm --filter @so-chu-nhiem/shared run test`
Expected: PASS

- [ ] **Step 8: Chạy build — xác nhận `dist/index.js` và `dist/index.d.ts` được tạo**

Run: `pnpm --filter @so-chu-nhiem/shared run build`
Expected: thành công, file `packages/shared/dist/index.js` tồn tại và export `APP_NAME`.

- [ ] **Step 9: Chạy lint — xác nhận không lỗi**

Run: `pnpm --filter @so-chu-nhiem/shared run lint`
Expected: exit code 0.

- [ ] **Step 10: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): scaffold package with APP_NAME constant"
```

---

## Task 3: Docker Compose — MongoDB 1-node replica set

**Files:**
- Create: `docker-compose.yml`

**Interfaces:**
- Produces: Mongo khả dụng tại `mongodb://localhost:27017` với replica set `rs0` đã initiate — Task 5 dùng để kết nối dev (không cần cho CI vì test Task 4/5 đều mock).

- [ ] **Step 1: Tạo `docker-compose.yml`**

```yaml
services:
  mongo:
    image: mongo:7
    restart: unless-stopped
    command: ["--replSet", "rs0", "--bind_ip_all"]
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping')"]
      interval: 5s
      timeout: 5s
      retries: 10

  mongo-init:
    image: mongo:7
    depends_on:
      mongo:
        condition: service_healthy
    restart: "no"
    entrypoint:
      - mongosh
      - --host
      - mongo
      - --quiet
      - --eval
      - "try { rs.status().ok } catch (e) { rs.initiate({_id:'rs0', members:[{_id:0, host:'mongo:27017'}]}) }"

volumes:
  mongo_data:
```

- [ ] **Step 2: Verify — khởi động và kiểm tra replica set đã initiate**

Run:
```bash
docker compose up -d mongo mongo-init
docker compose logs mongo-init
docker compose exec mongo mongosh --quiet --eval "rs.status().ok"
```
Expected: lệnh cuối in ra `1`.

- [ ] **Step 3: Dừng lại để môi trường sạch cho các task sau (Mongo sẽ được bật lại khi cần dev/test thật ở Phase 1)**

Run: `docker compose down`

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add docker-compose for single-node MongoDB replica set"
```

---

## Task 4: `apps/api` — khung NestJS + endpoint `/health`

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/tsconfig.build.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/jest.config.js`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/src/health/health.controller.spec.ts`
- Create: `apps/api/src/health/health.module.ts`

**Interfaces:**
- Consumes: `APP_NAME` từ `@so-chu-nhiem/shared` (Task 2).
- Produces: `HealthController.check(): { status: 'ok'; db: 'connected' | 'disconnected'; app: string }` — xác nhận pipeline Nest + Mongoose + workspace shared hoạt động, dùng làm cơ sở cho `DatabaseModule` ở Task 5.

- [ ] **Step 1: Viết test trước — `apps/api/src/health/health.controller.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  async function buildController(readyState: number) {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: getConnectionToken(), useValue: { readyState } }],
    }).compile();
    return moduleRef.get(HealthController);
  }

  it('trả status ok và db connected khi readyState = 1', async () => {
    const controller = await buildController(1);
    expect(controller.check()).toEqual({ status: 'ok', db: 'connected', app: 'So Chu Nhiem' });
  });

  it('trả status ok và db disconnected khi readyState != 1 (không throw)', async () => {
    const controller = await buildController(0);
    expect(controller.check()).toEqual({ status: 'ok', db: 'disconnected', app: 'So Chu Nhiem' });
  });
});
```

- [ ] **Step 2: Tạo khung Nest tối thiểu để test chạy được (chưa có logic)**

Tạo `apps/api/package.json` (name `"api"`, deps: `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/mongoose`, `mongoose`, `reflect-metadata`, `rxjs`, `@so-chu-nhiem/shared: "workspace:*"`; devDeps: `@nestjs/cli`, `@nestjs/testing`, `typescript`, `ts-node`, `jest`, `ts-jest`, `@types/jest`, `@types/node`, `eslint` + plugin TS; scripts `dev: "nest start --watch"`, `build: "nest build"`, `lint: "eslint src --ext .ts"`, `test: "jest"`), `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json`, `apps/api/nest-cli.json` (chuẩn Nest CLI, `sourceRoot: "src"`), `apps/api/jest.config.js` (`preset: 'ts-jest'`, `testEnvironment: 'node'`, `rootDir: 'src'`).

Tạo `apps/api/src/health/health.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({ controllers: [HealthController] })
export class HealthModule {}
```

- [ ] **Step 3: Chạy test — xác nhận FAIL vì `HealthController` chưa tồn tại**

Run: `pnpm install && pnpm --filter api run test`
Expected: FAIL — Cannot find module './health.controller'

- [ ] **Step 4: Implement `HealthController` trong `apps/api/src/health/health.controller.ts`**

```ts
import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { APP_NAME } from '@so-chu-nhiem/shared';

@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  check(): { status: 'ok'; db: 'connected' | 'disconnected'; app: string } {
    return {
      status: 'ok',
      db: this.connection.readyState === 1 ? 'connected' : 'disconnected',
      app: APP_NAME,
    };
  }
}
```

- [ ] **Step 5: Chạy test — xác nhận PASS**

Run: `pnpm --filter api run test`
Expected: PASS (2 test case)

- [ ] **Step 6: Tạo `apps/api/src/app.module.ts` và `apps/api/src/main.ts` để app bootstrap được (chưa nối `DatabaseModule` thật — Task 5 sẽ thêm)**

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';

@Module({ imports: [HealthModule] })
export class AppModule {}
```

```ts
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
```

Lưu ý: `AppModule` ở bước này **chưa import `HealthModule` cùng `DatabaseModule`** vì `DatabaseModule` chưa tồn tại — Task 5 sẽ sửa `app.module.ts` để import cả hai và cung cấp `MongooseModule` thật cho `InjectConnection` hoạt động lúc chạy app thật (test unit ở Step 1-5 đã mock riêng nên không phụ thuộc).

- [ ] **Step 7: Chạy build — xác nhận biên dịch sạch**

Run: `pnpm --filter api run build`
Expected: thành công, `apps/api/dist/main.js` tồn tại.

- [ ] **Step 8: Chạy lint — xác nhận không lỗi**

Run: `pnpm --filter api run lint`
Expected: exit code 0.

- [ ] **Step 9: Commit**

```bash
git add apps/api
git commit -m "feat(api): scaffold NestJS app with /health endpoint"
```

---

## Task 5: `apps/api` — Mongoose schemas nền tảng + `DatabaseModule`

**Files:**
- Create: `apps/api/src/database/schemas/user.schema.ts`
- Create: `apps/api/src/database/schemas/school-year.schema.ts`
- Create: `apps/api/src/database/schemas/semester.schema.ts`
- Create: `apps/api/src/database/schemas/class.schema.ts`
- Create: `apps/api/src/database/schemas/position.schema.ts`
- Create: `apps/api/src/database/schemas/position.schema.spec.ts`
- Create: `apps/api/src/database/schemas/student.schema.ts`
- Create: `apps/api/src/database/database.module.ts`
- Modify: `apps/api/src/app.module.ts` — import thêm `DatabaseModule`

**Interfaces:**
- Produces: `User, SchoolYear, Semester, Class, Position, Student` (Mongoose schema classes + `*Schema` qua `SchemaFactory`) và `DatabaseModule` (export `MongooseModule`) — Phase 1 sẽ `forFeature` thêm các collection khác và viết nghiệp vụ dùng các model này.

- [ ] **Step 1: Viết test trước cho index của `Position` — `apps/api/src/database/schemas/position.schema.spec.ts`**

```ts
import { PositionSchema } from './position.schema';

describe('PositionSchema indexes', () => {
  it('có unique partial index theo (classId, subject) chỉ áp dụng cho type=SUBJECT', () => {
    const indexes = PositionSchema.indexes();
    expect(indexes).toContainEqual([
      { classId: 1, subject: 1 },
      expect.objectContaining({ unique: true, partialFilterExpression: { type: 'SUBJECT' } }),
    ]);
  });

  it('có unique partial index theo (classId, type) chỉ áp dụng cho type=HOMEROOM', () => {
    const indexes = PositionSchema.indexes();
    expect(indexes).toContainEqual([
      { classId: 1, type: 1 },
      expect.objectContaining({ unique: true, partialFilterExpression: { type: 'HOMEROOM' } }),
    ]);
  });
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL vì `position.schema.ts` chưa tồn tại**

Run: `pnpm --filter api run test -- position.schema`
Expected: FAIL — Cannot find module './position.schema'

- [ ] **Step 3: Implement các schema**

`apps/api/src/database/schemas/user.schema.ts`:

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserRole = 'TEACHER' | 'STUDENT' | 'ADMIN';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, enum: ['TEACHER', 'STUDENT', 'ADMIN'] })
  role: UserRole;

  @Prop({ required: true, unique: true })
  username: string;

  @Prop()
  email?: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ default: false })
  mustChangePassword: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Student' })
  studentId?: Types.ObjectId;
}

export const UserSchema = SchemaFactory.createForClass(User);
```

`apps/api/src/database/schemas/school-year.schema.ts` — `SchoolYear { name: string (unique), startDate: Date, endDate: Date }`.

`apps/api/src/database/schemas/semester.schema.ts` — `Semester { schoolYearId: ObjectId ref SchoolYear, term: 1|2, startDate: Date, endDate: Date }`, thêm `SemesterSchema.index({ schoolYearId: 1, term: 1 }, { unique: true })`.

`apps/api/src/database/schemas/class.schema.ts` — `Class { code: string (unique, mã lớp ngắn vd "11A4-8X2K"), name: string, schoolYearId: ObjectId ref SchoolYear }`.

`apps/api/src/database/schemas/position.schema.ts`:

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PositionType = 'HOMEROOM' | 'SUBJECT';

@Schema({ timestamps: true })
export class Position extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Class', required: true })
  classId: Types.ObjectId;

  @Prop({ required: true, enum: ['HOMEROOM', 'SUBJECT'] })
  type: PositionType;

  @Prop()
  subject?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  holderId: Types.ObjectId | null;
}

export const PositionSchema = SchemaFactory.createForClass(Position);

PositionSchema.index(
  { classId: 1, subject: 1 },
  { unique: true, partialFilterExpression: { type: 'SUBJECT' } },
);
PositionSchema.index(
  { classId: 1, type: 1 },
  { unique: true, partialFilterExpression: { type: 'HOMEROOM' } },
);
```

`apps/api/src/database/schemas/student.schema.ts`:

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StudentStatus = 'ACTIVE' | 'TRANSFERRED';

@Schema({ timestamps: true })
export class Student extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Class', required: true })
  classId: Types.ObjectId;

  @Prop({ required: true })
  fullName: string;

  @Prop()
  dob?: Date;

  @Prop({ required: true, enum: ['ACTIVE', 'TRANSFERRED'], default: 'ACTIVE' })
  status: StudentStatus;

  @Prop()
  transferDate?: Date;

  @Prop()
  transferReason?: string;
}

export const StudentSchema = SchemaFactory.createForClass(Student);
StudentSchema.index({ classId: 1, status: 1 });
```

- [ ] **Step 4: Chạy test — xác nhận PASS**

Run: `pnpm --filter api run test -- position.schema`
Expected: PASS

- [ ] **Step 5: Tạo `apps/api/src/database/database.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { SchoolYear, SchoolYearSchema } from './schemas/school-year.schema';
import { Semester, SemesterSchema } from './schemas/semester.schema';
import { Class, ClassSchema } from './schemas/class.schema';
import { Position, PositionSchema } from './schemas/position.schema';
import { Student, StudentSchema } from './schemas/student.schema';

@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGODB_URI ?? 'mongodb://localhost:27017/so_chu_nhiem?replicaSet=rs0',
    ),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: SchoolYear.name, schema: SchoolYearSchema },
      { name: Semester.name, schema: SemesterSchema },
      { name: Class.name, schema: ClassSchema },
      { name: Position.name, schema: PositionSchema },
      { name: Student.name, schema: StudentSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
```

- [ ] **Step 6: Sửa `apps/api/src/app.module.ts` để import `DatabaseModule`**

```ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';

@Module({ imports: [DatabaseModule, HealthModule] })
export class AppModule {}
```

- [ ] **Step 7: Verify thủ công app bootstrap thật kết nối được Mongo (cần Mongo đang chạy từ Task 3)**

Run:
```bash
docker compose up -d mongo mongo-init
pnpm --filter api run build
MONGODB_URI="mongodb://localhost:27017/so_chu_nhiem?replicaSet=rs0" node apps/api/dist/main.js &
sleep 2
curl -s http://localhost:3001/health
kill %1
docker compose down
```
Expected: in ra `{"status":"ok","db":"connected","app":"So Chu Nhiem"}`.

- [ ] **Step 8: Chạy toàn bộ test + build + lint của `api`**

Run: `pnpm --filter api run lint && pnpm --filter api run build && pnpm --filter api run test`
Expected: tất cả PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api
git commit -m "feat(api): add foundational Mongoose schemas and database module"
```

---

## Task 6: `apps/web` — khung Next.js + Tailwind + theme

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/jsconfig.json`
- Create: `apps/web/next.config.js`
- Create: `apps/web/tailwind.config.js`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/app/layout.jsx`
- Create: `apps/web/app/page.jsx`
- Create: `apps/web/jest.config.js`
- Create: `apps/web/jest.setup.js`

**Interfaces:**
- Produces: `app/globals.css` định nghĩa các CSS variable ở Global Constraints — Task 7/8 dùng các variable này qua Tailwind (`tailwind.config.js` map `colors.brand = 'var(--brand)'`, v.v.).

- [ ] **Step 1: Tạo `apps/web/package.json`** (`name: "web"`, deps: `next`, `react`, `react-dom`, `@reduxjs/toolkit`, `react-redux`, `clsx`, `tailwind-merge`, `class-variance-authority`, `@radix-ui/react-dialog`, `lucide-react`; devDeps: `tailwindcss`, `postcss`, `autoprefixer`, `eslint`, `eslint-config-next`, `jest`, `jest-environment-jsdom`, `@testing-library/react`, `@testing-library/jest-dom`; scripts `dev: "next dev -p 3000"`, `build: "next build"`, `lint: "next lint"`, `test: "jest"`).

- [ ] **Step 2: Tạo `apps/web/jsconfig.json`** với path alias `"@/*": ["./*"]`.

- [ ] **Step 3: Tạo `apps/web/next.config.js`** (`/** @type {import('next').NextConfig} */ const nextConfig = {}; module.exports = nextConfig;`), `apps/web/postcss.config.js` (tailwindcss + autoprefixer chuẩn).

- [ ] **Step 4: Tạo `apps/web/tailwind.config.js`** — `content` trỏ `./app/**/*.{js,jsx}` và `./components/**/*.{js,jsx}`; `theme.extend.colors` map: `brand: 'var(--brand)'`, `"brand-hover": 'var(--brand-hover)'`, `"sidebar-bg": 'var(--sidebar-bg)'`, `"sidebar-fg": 'var(--sidebar-fg)'`, `"sidebar-active-fg": 'var(--sidebar-active-fg)'`, `border: 'var(--border)'`, `fg: 'var(--fg)'`, `"fg-muted": 'var(--fg-muted)'`, `success: 'var(--success)'`, `danger: 'var(--danger)'`; `theme.extend.fontFamily`: `sans: 'var(--font-sans)'`, `heading: 'var(--font-heading)'`, `mono: 'var(--font-mono)'`.

- [ ] **Step 5: Tạo `apps/web/app/globals.css`** — `@tailwind base; @tailwind components; @tailwind utilities;` rồi khối `:root { --brand:#F0B90B; --brand-hover:#D0980B; --sidebar-bg:#1E2329; --sidebar-fg:#B7BDC6; --sidebar-active-fg:#F0B90B; --border:#EAECEF; --fg:#1E2329; --fg-muted:#848E9C; --success:#0ECB81; --danger:#F6465D; }` và `body { @apply bg-white text-fg font-sans; }`.

- [ ] **Step 6: Tạo `apps/web/app/layout.jsx`** (server component) — dùng `next/font/google` load Inter/IBM Plex Sans/IBM Plex Mono gán vào CSS variable `--font-sans`/`--font-heading`/`--font-mono` qua option `variable`, import `./globals.css`, export `metadata = { title: 'Sổ Chủ Nhiệm', description: 'Sổ chủ nhiệm điện tử cho giáo viên và học sinh THPT' }`, render `<html lang="vi"><body className={cn(fontVariables)}>{children}</body></html>` (chưa có Sidebar/Providers — Task 8 và 9 sẽ bọc thêm quanh `children`).

- [ ] **Step 7: Tạo `apps/web/app/page.jsx`** — trang "Tổng quan" placeholder đơn giản: heading "Tổng quan", đoạn mô tả ngắn ("Dữ liệu thật sẽ hiển thị từ Phase 2"), và 1 nút ví dụ dùng class Tailwind thô `bg-brand text-black rounded-full` (demo màu, chưa cần component `Button` thật — Task 7 mới thêm Button và Task 7 sẽ thay thế đoạn này nếu cần).

- [ ] **Step 8: Tạo `apps/web/jest.config.js`**

```js
const nextJest = require('next/jest');
const createJestConfig = nextJest({ dir: './' });
module.exports = createJestConfig({
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEach: ['<rootDir>/jest.setup.js'],
});
```

`apps/web/jest.setup.js`: `import '@testing-library/jest-dom';`

- [ ] **Step 9: Verify — cài đặt và build**

Run: `pnpm install && pnpm --filter web run build`
Expected: build thành công, không lỗi Tailwind/font.

- [ ] **Step 10: Verify lint**

Run: `pnpm --filter web run lint`
Expected: exit code 0.

- [ ] **Step 11: Commit**

```bash
git add apps/web
git commit -m "feat(web): scaffold Next.js app with Tailwind theme"
```

---

## Task 7: `apps/web` — shadcn-style primitives (Button, Input, Sheet) + `cn()`

**Files:**
- Create: `apps/web/lib/utils.js`
- Create: `apps/web/components/ui/button.jsx`
- Create: `apps/web/components/ui/input.jsx`
- Create: `apps/web/components/ui/sheet.jsx`
- Create: `apps/web/components/icons/search-icon.jsx`
- Create: `apps/web/components/icons/search-icon.test.jsx`

**Interfaces:**
- Produces: `cn(...classValues): string`; `<Button variant="default"|"outline"|"ghost" size="default"|"sm"|"lg"|"icon">`; `<Input />`; `<Sheet>`, `<SheetTrigger>`, `<SheetContent side="left"|"right">`, `<SheetClose>` (API tương thích Radix Dialog theo đúng pattern shadcn); `<SearchIcon className?: string />` — Task 8 dùng tất cả các export này để dựng Sidebar/MobileDrawer/SearchBox.

- [ ] **Step 1: Viết test trước — `apps/web/components/icons/search-icon.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import { SearchIcon } from './search-icon';

test('render ra SVG thật, không phải emoji hay icon font', () => {
  render(<SearchIcon data-testid="search-icon" />);
  const icon = screen.getByTestId('search-icon');
  expect(icon.tagName.toLowerCase()).toBe('svg');
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL vì `search-icon.jsx` chưa tồn tại**

Run: `pnpm --filter web run test -- search-icon`
Expected: FAIL — Cannot find module './search-icon'

- [ ] **Step 3: Implement `apps/web/lib/utils.js`**

```js
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Implement `apps/web/components/icons/search-icon.jsx`** — 1 component functional nhận `className` và các props khác (bao gồm `data-testid`) truyền thẳng (`...props`) vào thẻ `<svg>` inline (path kính lúp chuẩn, viewBox `0 0 24 24`, `stroke="currentColor"`, `fill="none"`), export named `SearchIcon`.

- [ ] **Step 5: Chạy test — xác nhận PASS**

Run: `pnpm --filter web run test -- search-icon`
Expected: PASS

- [ ] **Step 6: Implement `apps/web/components/ui/button.jsx`** — dùng `class-variance-authority` định nghĩa `buttonVariants` với base class bo tròn pill (`rounded-full font-medium transition-colors`), `variant.default` = nền `bg-brand` chữ đen (`text-black`) hover `hover:bg-brand-hover`, `variant.outline` = viền `border border-border bg-transparent text-fg`, `variant.ghost` = `bg-transparent hover:bg-black/5`; `size.default/sm/lg/icon` theo padding/height tăng dần chuẩn shadcn. Component `Button` forward `className` qua `cn(buttonVariants({ variant, size }), className)`, forward ref.

- [ ] **Step 7: Implement `apps/web/components/ui/input.jsx`** — input chuẩn shadcn: border `border-border`, bo góc `rounded-md`, padding, focus ring màu `brand`, forward ref + props.

- [ ] **Step 8: Implement `apps/web/components/ui/sheet.jsx`** — bọc `@radix-ui/react-dialog`: export `Sheet` (= `Dialog.Root`), `SheetTrigger` (= `Dialog.Trigger`), `SheetClose` (= `Dialog.Close`), `SheetContent` nhận prop `side: 'left' | 'right'` (mặc định `'left'`) render `Dialog.Portal` + `Dialog.Overlay` (nền đen mờ) + `Dialog.Content` với animation slide từ `side`, nền `bg-white`, chiều rộng cố định (vd `w-72`) full height.

- [ ] **Step 9: Verify toàn bộ build + lint**

Run: `pnpm --filter web run build && pnpm --filter web run lint`
Expected: thành công.

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib apps/web/components
git commit -m "feat(web): add shadcn-style Button/Input/Sheet primitives"
```

---

## Task 8: `apps/web` — Sidebar, mobile drawer, search box, trang placeholder

**Files:**
- Create: `apps/web/components/layout/nav-data.js`
- Create: `apps/web/components/layout/sidebar.jsx`
- Create: `apps/web/components/layout/sidebar.test.jsx`
- Create: `apps/web/components/layout/search-box.jsx`
- Create: `apps/web/components/layout/search-box.test.jsx`
- Create: `apps/web/components/layout/mobile-nav.jsx`
- Create: `apps/web/components/layout/mobile-nav.test.jsx`
- Create: `apps/web/app/dang-phat-trien/page.jsx`
- Modify: `apps/web/app/layout.jsx` — render `<Sidebar />` (ẩn trên mobile) + `<MobileNav />` (hiện trên mobile) + `<SearchBox />` trong thanh header, bọc quanh `{children}`
- Modify: `apps/web/app/page.jsx` — dùng component `Button` thật (Task 7) thay cho class Tailwind thô ở Task 6 Step 7

**Interfaces:**
- Consumes: `cn`, `Button`, `Input`, `Sheet`/`SheetTrigger`/`SheetContent`, `SearchIcon` (Task 7).
- Produces: `<Sidebar className? />`, `<MobileNav />`, `<SearchBox />` — dùng trong `app/layout.jsx`; không có task sau nào tiêu thụ thêm trong Phase 0.

- [ ] **Step 1: Tạo `apps/web/components/layout/nav-data.js`** — export mảng `NAV_GROUPS`, mỗi phần tử `{ group: string, items: [{ label: string, href: string, icon: LucideIconComponent }] }`, đúng 6 nhóm theo thứ tự và nhãn chính xác:
  1. `"Tổng quan"` → item `{ label: 'Bảng điều khiển', href: '/', icon: LayoutDashboard }`
  2. `"Nền tảng"` → `{ label: 'Lớp học', href: '/dang-phat-trien', icon: School }`, `{ label: 'Học sinh', href: '/dang-phat-trien', icon: Users }`
  3. `"Kế hoạch dạy học"` → `{ label: 'Phân phối chương trình', href: '/dang-phat-trien', icon: BookOpen }`, `{ label: 'Thời khóa biểu', href: '/dang-phat-trien', icon: CalendarDays }`
  4. `"Lớp học hằng ngày"` → `{ label: 'Điểm danh', href: '/dang-phat-trien', icon: ClipboardCheck }`, `{ label: 'Vi phạm & điểm cộng', href: '/dang-phat-trien', icon: AlertTriangle }`
  5. `"Học tập"` → `{ label: 'Sổ điểm', href: '/dang-phat-trien', icon: NotebookText }`, `{ label: 'Bài tập', href: '/dang-phat-trien', icon: ListChecks }`
  6. `"Khác"` → `{ label: 'Cài đặt', href: '/dang-phat-trien', icon: Settings }`

  (import các icon trên từ `lucide-react`).

- [ ] **Step 2: Viết test trước — `apps/web/components/layout/sidebar.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import { Sidebar } from './sidebar';

jest.mock('next/navigation', () => ({ usePathname: () => '/' }));

test('render đủ 6 nhóm điều hướng với đúng nhãn', () => {
  render(<Sidebar />);
  ['Tổng quan', 'Nền tảng', 'Kế hoạch dạy học', 'Lớp học hằng ngày', 'Học tập', 'Khác'].forEach((label) => {
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

test('mục ứng với pathname hiện tại có style active (chữ vàng)', () => {
  render(<Sidebar />);
  const active = screen.getByText('Bảng điều khiển');
  expect(active.closest('a')).toHaveClass('text-sidebar-active-fg');
});
```

- [ ] **Step 3: Chạy test — xác nhận FAIL**

Run: `pnpm --filter web run test -- sidebar`
Expected: FAIL — Cannot find module './sidebar'

- [ ] **Step 4: Implement `apps/web/components/layout/sidebar.jsx`** (client component, `'use client'`) — dùng `usePathname()` từ `next/navigation`, render nền `bg-sidebar-bg text-sidebar-fg`, mỗi group có label nhỏ (uppercase, `text-fg-muted`) rồi danh sách `<Link>` kèm icon; mục có `href === pathname` nhận class `text-sidebar-active-fg` + vạch vàng trái (`border-l-2 border-brand`), mục khác `text-sidebar-fg hover:text-sidebar-active-fg`. Nhận prop `className` forward ra ngoài để `MobileNav` tái sử dụng bên trong `SheetContent`.

- [ ] **Step 5: Chạy test — xác nhận PASS**

Run: `pnpm --filter web run test -- sidebar`
Expected: PASS

- [ ] **Step 6: Viết test trước — `apps/web/components/layout/search-box.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import { SearchBox } from './search-box';

test('render input tìm kiếm kèm icon SVG, không emoji', () => {
  render(<SearchBox />);
  expect(screen.getByPlaceholderText('Tìm kiếm...')).toBeInTheDocument();
  const icon = screen.getByTestId('search-icon');
  expect(icon.tagName.toLowerCase()).toBe('svg');
});
```

- [ ] **Step 7: Chạy test — xác nhận FAIL, rồi implement `apps/web/components/layout/search-box.jsx`** — wrapper `relative`, `<SearchIcon data-testid="search-icon" className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />` + `<Input placeholder="Tìm kiếm..." className="pl-9" />` (dùng `Input` từ Task 7).

- [ ] **Step 8: Chạy test — xác nhận PASS**

Run: `pnpm --filter web run test -- search-box`

- [ ] **Step 9: Viết test trước — `apps/web/components/layout/mobile-nav.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileNav } from './mobile-nav';

jest.mock('next/navigation', () => ({ usePathname: () => '/' }));

test('mở được drawer và thấy đủ 6 nhóm điều hướng trên màn hình nhỏ', async () => {
  render(<MobileNav />);
  await userEvent.click(screen.getByRole('button', { name: /mở menu/i }));
  expect(await screen.findByText('Lớp học hằng ngày')).toBeInTheDocument();
});
```

(thêm devDependency `@testing-library/user-event` vào `apps/web/package.json` nếu chưa có ở Task 6).

- [ ] **Step 10: Chạy test — xác nhận FAIL, rồi implement `apps/web/components/layout/mobile-nav.jsx`** (client component) — `<Sheet><SheetTrigger asChild><Button variant="ghost" size="icon" aria-label="Mở menu"><MenuIcon /></Button></SheetTrigger><SheetContent side="left"><Sidebar /></SheetContent></Sheet>` (import `Menu as MenuIcon` từ `lucide-react`).

- [ ] **Step 11: Chạy test — xác nhận PASS**

Run: `pnpm --filter web run test -- mobile-nav`

- [ ] **Step 12: Tạo `apps/web/app/dang-phat-trien/page.jsx`** — trang tĩnh đơn giản: heading "Tính năng đang được phát triển", đoạn mô tả ngắn sẽ có ở phase sau.

- [ ] **Step 13: Sửa `apps/web/app/layout.jsx`** — bọc `{children}` trong layout 2 cột: `<Sidebar className="hidden md:flex" />` cố định bên trái desktop, header ngang trên cùng của phần nội dung chứa `<MobileNav />` (chỉ hiện `md:hidden`) + `<SearchBox />`, phần `<main>` chứa `{children}`.

- [ ] **Step 14: Sửa `apps/web/app/page.jsx`** — thay nút Tailwind thô bằng `<Button>Xem chi tiết</Button>` thật từ Task 7 (demo theme, chưa gắn hành vi).

- [ ] **Step 15: Chạy toàn bộ test + build + lint của `web`**

Run: `pnpm --filter web run lint && pnpm --filter web run build && pnpm --filter web run test`
Expected: tất cả PASS.

- [ ] **Step 16: Commit**

```bash
git add apps/web
git commit -m "feat(web): add responsive sidebar navigation and search box"
```

---

## Task 9: `apps/web` — Redux Toolkit store (authSlice rỗng + apiSlice RTK Query rỗng)

**Files:**
- Create: `apps/web/lib/store/auth-slice.js`
- Create: `apps/web/lib/store/api-slice.js`
- Create: `apps/web/lib/store/store.js`
- Create: `apps/web/components/providers.jsx`
- Create: `apps/web/lib/store/store.test.js`
- Modify: `apps/web/app/layout.jsx` — bọc nội dung trong `<Providers>`

**Interfaces:**
- Produces: `store` (Redux store instance), `makeStore(): Store`, `authSlice` reducer tại key `auth` (state `{ user: null, accessToken: null }`, chưa có reducer nào — Phase 1 thêm `login`/`logout`), `apiSlice` (RTK Query `createApi`, `reducerPath: 'api'`, `tagTypes: []`, `endpoints: {}` — Phase 1 dùng `apiSlice.injectEndpoints` để thêm `login`/`me`/...), `<Providers>{children}</Providers>` client component bọc `<Provider store={store}>`.

- [ ] **Step 1: Viết test trước — `apps/web/lib/store/store.test.js`**

```js
import { makeStore } from './store';

test('store khởi tạo đúng 2 slice reducer: auth và api', () => {
  const store = makeStore();
  const state = store.getState();
  expect(state.auth).toEqual({ user: null, accessToken: null });
  expect(state).toHaveProperty('api');
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

Run: `pnpm --filter web run test -- store`
Expected: FAIL — Cannot find module './store'

- [ ] **Step 3: Implement `apps/web/lib/store/auth-slice.js`**

```js
import { createSlice } from '@reduxjs/toolkit';

const initialState = { user: null, accessToken: null };

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {},
});

export default authSlice.reducer;
```

- [ ] **Step 4: Implement `apps/web/lib/store/api-slice.js`**

```js
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001' }),
  tagTypes: [],
  endpoints: () => ({}),
});
```

- [ ] **Step 5: Implement `apps/web/lib/store/store.js`**

```js
import { configureStore } from '@reduxjs/toolkit';
import authReducer from './auth-slice';
import { apiSlice } from './api-slice';

export function makeStore() {
  return configureStore({
    reducer: { auth: authReducer, [apiSlice.reducerPath]: apiSlice.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(apiSlice.middleware),
  });
}

export const store = makeStore();
```

- [ ] **Step 6: Chạy test — xác nhận PASS**

Run: `pnpm --filter web run test -- store`

- [ ] **Step 7: Implement `apps/web/components/providers.jsx`**

```jsx
'use client';
import { Provider } from 'react-redux';
import { store } from '@/lib/store/store';

export function Providers({ children }) {
  return <Provider store={store}>{children}</Provider>;
}
```

- [ ] **Step 8: Sửa `apps/web/app/layout.jsx`** — bọc toàn bộ phần thân (`Sidebar` + `MobileNav` + `main`) bên trong `<Providers>...</Providers>`.

- [ ] **Step 9: Chạy toàn bộ test + build + lint của `web`**

Run: `pnpm --filter web run lint && pnpm --filter web run build && pnpm --filter web run test`
Expected: tất cả PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web
git commit -m "feat(web): wire up Redux Toolkit store with empty auth and api slices"
```

---

## Task 10: CI (GitHub Actions) + verify toàn repo

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Tạo `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Enable corepack
        run: corepack enable
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Lint
        run: pnpm run lint
      - name: Build
        run: pnpm run build
      - name: Test
        run: pnpm run test
```

- [ ] **Step 2: Verify toàn bộ monorepo chạy sạch từ root (mô phỏng đúng lệnh CI, không cần Mongo vì mọi test đều mock)**

Run:
```bash
nvm use 20
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install --frozen-lockfile
pnpm run lint
pnpm run build
pnpm run test
```
Expected: cả 4 lệnh thành công (exit code 0), không có package nào bị lỗi.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow for lint/build/test"
```

- [ ] **Step 4: Tóm tắt Phase 0 — xác nhận với người dùng trước khi sang Phase 1**

Không phải code — bước cuối của phase: báo cáo lại cho người dùng những gì đã làm (monorepo, docker-compose, schema nền tảng, CI, layout/theme), kết quả lint/build/test, và chờ duyệt theo đúng quy trình gốc ("Hết mỗi phase thì chạy test và lint, tóm tắt những gì đã làm, rồi chờ tôi duyệt mới sang phase tiếp").

---

## Tổng kết Self-Review

- **Spec coverage:** cả 5 mục phạm vi Phase 0 (monorepo, docker-compose, schema, CI, layout/theme) đều có task tương ứng (Task 1-2 & 6-9, Task 3, Task 5, Task 10, Task 6-9). ✓
- **Step scan:** mỗi step hoặc là 1 test/implementation cụ thể, hoặc 1 lệnh verify có output kỳ vọng rõ ràng — không có step kiểu "xử lý edge case" chung chung.
- **Type consistency:** `HealthController.check()` trả `{ status, db, app }` giống nhau xuyên suốt Task 4 (test) và Task 5 (verify thủ công); `Sidebar`/`MobileNav`/`SearchBox` dùng đúng tên export đã khai báo ở Interfaces của Task 7 (`Button`, `Input`, `Sheet*`, `SearchIcon`, `cn`).
- **Review Focus:** cả 5 mục đều đã gắn vào đúng 1 task có test cụ thể (xem bảng Review Focus ở trên).
- **Proportion:** plan ~ tương đương độ dài spec, phần lớn code block là test/signature pin cứng giá trị từ spec (màu, enum, index) — không chép lại toàn bộ component JSX (Sidebar/Button/Sheet để implementer tự viết phần trình bày, chỉ pin những gì ảnh hưởng đúng/sai).
