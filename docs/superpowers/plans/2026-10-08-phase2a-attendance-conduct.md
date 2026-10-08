# Phase 2A — Điểm danh, Danh mục & Ghi nhận vi phạm/điểm cộng, Xếp loại rèn luyện Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GVBM điểm danh/ghi vi phạm-điểm cộng cho đúng vị trí môn mình giữ; GVCN điểm danh/ghi cho vị trí HOMEROOM và xem (không sửa) được điểm danh của mọi vị trí khác trong lớp; ADMIN quản lý danh mục vi phạm/điểm cộng dùng chung toàn trường; xếp loại rèn luyện tính theo tuần ISO từ các bản ghi đó.

**Architecture:** Một guard mới `PositionOwnerGuard` (song song với `PositionGuard` của Phase 1, không thay thế) đọc `:positionId` từ route param — khác với `PositionGuard` vốn đọc `:classId` — tra `Position` theo `_id` để biết `classId`/`holderId`, cho qua nếu đúng người giữ (`'SELF'`) hoặc đúng người giữ HOẶC là GVCN của lớp đó (`'SELF_OR_HOMEROOM'`, dùng cho route chỉ-đọc). `AttendanceRecord`/`ConductLog` đều có `positionId` nên dùng chung 1 guard mới này; danh sách/xếp loại theo cả lớp (`GET /classes/:classId/...`) dùng lại `PositionGuard('ANY')` đã có từ Phase 1. Xếp loại rèn luyện tính on-the-fly bằng aggregation theo `weekStart` (field suy diễn lưu sẵn trên mỗi `ConductLog`, không lưu điểm tổng).

**Tech Stack:** NestJS + Mongoose (đã có), zod (`packages/shared`), Jest + `mongodb-memory-server` (đã có hạ tầng từ Phase 1).

**Spec:** [docs/superpowers/specs/2026-10-08-phase2-attendance-conduct-design.md](../specs/2026-10-08-phase2-attendance-conduct-design.md) — phần "Điểm danh", "Danh mục vi phạm/điểm cộng", "Ghi nhận vi phạm/điểm cộng", "Xếp loại rèn luyện". Kế thừa toàn bộ hạ tầng Phase 1 (xem ledger lịch sử trong git log các commit `feat(api): add PositionGuard...`, `feat(api): add StudentsModule...` — đặc biệt: mọi module Nest PHẢI tự `imports: [DatabaseModule]`, và mọi `@Prop({ type: ... })` tham chiếu ObjectId PHẢI dùng `MongooseSchema.Types.ObjectId` chứ không phải `Types.ObjectId` — xem commit `feat(api): add PositionGuard for per-class HOMEROOM/ANY authorization` và theo sau để biết vì sao).

Chép phạt tự động, `SchoolConfig`, và Dashboard thuộc **Phase 2B** (kế thừa trực tiếp `ConductLogService.create` của plan này — xem Interfaces của Task 7).

Xếp loại rèn luyện THÁNG/HỌC KỲ (yêu cầu gốc có nhắc) **chưa làm ở plan này** — chỉ làm TUẦN (có test ranh giới
tuần rõ ràng theo spec). Tháng/học kỳ là trung bình cộng các tuần trong khoảng đó, thêm sau khi có nhu cầu dùng
thật — không có trong tiêu chí test của spec này nên không set-up API shape mà chưa biết FE cần trả về gì.

## Global Constraints

- Mọi `@Prop({ type: ... })` tham chiếu ObjectId dùng `MongooseSchema.Types.ObjectId` (import
  `Schema as MongooseSchema` từ `'mongoose'`), KHÔNG dùng `Types.ObjectId` làm `type:` — bug đã xảy ra thật ở
  Phase 1B (xem `docs/ASSUMPTIONS.md`), lặp lại sẽ khiến field âm thầm thành `Mixed`, không cast được string
  sang ObjectId.
- Mọi module mới tự `imports: [DatabaseModule]` — không giả định module khác import hộ (bug thật đã xảy ra ở
  Phase 1A).
- Lỗi nghiệp vụ trả tiếng Việt thân thiện qua `BadRequestException`/`NotFoundException`/`ForbiddenException`
  (kế thừa quy ước từ Phase 1), KHÔNG để lộ stack trace hay message tiếng Anh gốc của Mongoose/Node.
- `date` truyền qua query param dạng `yyyy-mm-dd` (không có giờ) — song song với mô tả "ngày dd/mm/yyyy" ở FE
  (yêu cầu gốc), API nội bộ dùng ISO `yyyy-mm-dd` cho dễ parse, FE tự hiển thị `dd/mm/yyyy`. Chuẩn hoá về
  00:00:00 UTC của đúng ngày đó khi lưu.
- Tuần tính theo ISO (Thứ Hai 00:00 UTC – Chủ Nhật 23:59:59 UTC) — xem `docs/ASSUMPTIONS.md` mục "Phase 2".
- `points` trên `ConductCatalogItem`/`ConductLog` luôn validate đúng giới hạn: vi phạm tối đa 50, điểm cộng tối
  đa 30 (hằng số `MAX_VIOLATION_POINTS`/`MAX_MERIT_POINTS` trong `packages/shared`).

## Review Focus

- GVBM ghi điểm danh/vi phạm vào vị trí KHÔNG phải của mình (vd biết `positionId` của đồng nghiệp dạy cùng lớp)
  phải bị từ chối (403) — nếu `PositionOwnerGuard` chỉ kiểm tra "vị trí đó thuộc lớp mình có vị trí nào không"
  mà quên so đúng `holderId === positionId.holderId`, GVBM sẽ sửa được dữ liệu môn khác. → test ở Task 5, Task 8.
- GVCN xem (GET) điểm danh/vi phạm của vị trí SUBJECT trong lớp mình phải được (200), nhưng GHI (PUT/POST) vào
  đúng vị trí SUBJECT đó (không phải HOMEROOM của mình) phải bị từ chối (403) — nếu guard dùng chung 1 nhánh cho
  cả đọc/ghi, GVCN sẽ ghi đè được dữ liệu của GVBM khác. → test ở Task 5, Task 8.
- Giáo viên ở lớp KHÁC hoàn toàn (không giữ vị trí nào của lớp chứa `positionId` đó) gọi bằng đúng `positionId`
  đoán được/biết được của lớp khác phải bị từ chối (403), không phải lỗi 500 do không tìm thấy gì liên quan. →
  test ở Task 5.
- Xếp loại rèn luyện phải tính đúng ranh giới tuần: 1 `ConductLog` ghi lúc 23:59:59 Chủ Nhật và 1 bản ghi lúc
  00:00:00 Thứ Hai ngay sau đó phải rơi vào 2 tuần khác nhau (2 giá trị `weekStart` khác nhau) — nếu dùng sai
  mốc giờ (vd giờ địa phương thay vì UTC, hoặc tính tuần bắt đầu Chủ Nhật), kết quả xếp loại sẽ sai lệch so với
  kỳ vọng của GVCN khi đối chiếu lịch thật. → test ở Task 3, Task 9.
- Mục "Khác" (không chọn từ danh mục) phải validate đúng giới hạn điểm giống hệt mục có catalog (vi phạm ≤50,
  điểm cộng ≤30) — nếu bỏ qua validate cho nhánh "Khác", giáo viên có thể nhập điểm trừ/cộng tuỳ ý vượt mọi giới
  hạn nghiệp vụ đã định nghĩa. → test ở Task 1, Task 7.

---

## Task 1: `packages/shared` — hằng số + zod schema điểm danh/vi phạm/điểm cộng

**Files:**
- Create: `packages/shared/src/constants/conduct.ts`
- Create: `packages/shared/src/constants/conduct.test.ts`
- Create: `packages/shared/src/schemas/attendance.schema.ts`
- Create: `packages/shared/src/schemas/attendance.schema.test.ts`
- Create: `packages/shared/src/schemas/conduct.schema.ts`
- Create: `packages/shared/src/schemas/conduct.schema.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `MAX_VIOLATION_POINTS = 50`, `MAX_MERIT_POINTS = 30`,
  `HOMEWORK_NOT_DONE_LINES_BY_OCCURRENCE = [20, 30, 40, 50] as const`, `getConductRatingLabel(score: number):
  string`. `attendanceStatusEnum` (zod), `AttendanceStatus` (type), `markAttendanceSchema`/`MarkAttendanceInput`.
  `conductKindEnum`/`ConductKind`, `conductSpecialRuleEnum`/`ConductSpecialRule`,
  `createConductCatalogItemSchema`/`CreateConductCatalogItemInput`,
  `updateConductCatalogItemSchema`/`UpdateConductCatalogItemInput`,
  `createConductLogSchema`/`CreateConductLogInput` — dùng ở Task 5-7.

- [ ] **Step 1: Viết test trước — `packages/shared/src/constants/conduct.test.ts`**

```ts
import { getConductRatingLabel, MAX_VIOLATION_POINTS, MAX_MERIT_POINTS } from './conduct';

describe('getConductRatingLabel', () => {
  it.each([
    [100, 'Xuất sắc'],
    [95, 'Xuất sắc'],
    [94, 'Tốt'],
    [90, 'Tốt'],
    [89, 'Khá'],
    [80, 'Khá'],
    [79, 'Đạt'],
    [65, 'Đạt'],
    [64, 'Cần rèn luyện'],
    [50, 'Cần rèn luyện'],
    [49, 'Chưa đạt'],
    [-10, 'Chưa đạt'],
  ])('điểm %i → %s', (score, label) => {
    expect(getConductRatingLabel(score)).toBe(label);
  });
});

it('giới hạn điểm vi phạm/điểm cộng đúng yêu cầu gốc', () => {
  expect(MAX_VIOLATION_POINTS).toBe(50);
  expect(MAX_MERIT_POINTS).toBe(30);
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL** (`pnpm --filter @so-chu-nhiem/shared run test -- conduct`)

- [ ] **Step 3: Implement `packages/shared/src/constants/conduct.ts`**

```ts
export const MAX_VIOLATION_POINTS = 50;
export const MAX_MERIT_POINTS = 30;
export const HOMEWORK_NOT_DONE_LINES_BY_OCCURRENCE = [20, 30, 40, 50] as const;

export function getConductRatingLabel(score: number): string {
  if (score >= 95) return 'Xuất sắc';
  if (score >= 90) return 'Tốt';
  if (score >= 80) return 'Khá';
  if (score >= 65) return 'Đạt';
  if (score >= 50) return 'Cần rèn luyện';
  return 'Chưa đạt';
}
```

- [ ] **Step 4: Chạy test — xác nhận PASS**

- [ ] **Step 5: Viết test trước — `packages/shared/src/schemas/attendance.schema.test.ts`**

```ts
import { markAttendanceSchema } from './attendance.schema';

describe('markAttendanceSchema', () => {
  it('chấp nhận mảng entries hợp lệ, từ chối status không thuộc enum', () => {
    expect(
      markAttendanceSchema.safeParse({ entries: [{ studentId: 'abc', status: 'LATE' }] }).success,
    ).toBe(true);
    expect(
      markAttendanceSchema.safeParse({ entries: [{ studentId: 'abc', status: 'SICK' }] }).success,
    ).toBe(false);
  });

  it('giới hạn tối đa 200 dòng/lần (tương đương 1 lớp lớn, tránh payload vô hạn)', () => {
    const entries = Array.from({ length: 201 }, (_, i) => ({ studentId: `s${i}`, status: 'LATE' as const }));
    expect(markAttendanceSchema.safeParse({ entries }).success).toBe(false);
  });
});
```

- [ ] **Step 6: Chạy test — xác nhận FAIL**

- [ ] **Step 7: Implement `packages/shared/src/schemas/attendance.schema.ts`**

```ts
import { z } from 'zod';

export const attendanceStatusEnum = z.enum(['PRESENT', 'EXCUSED', 'LATE', 'UNEXCUSED']);
export type AttendanceStatus = z.infer<typeof attendanceStatusEnum>;

export const markAttendanceSchema = z.object({
  entries: z
    .array(z.object({ studentId: z.string().min(1), status: attendanceStatusEnum }))
    .max(200),
});
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
```

- [ ] **Step 8: Chạy test — xác nhận PASS**

- [ ] **Step 9: Viết test trước — `packages/shared/src/schemas/conduct.schema.test.ts`**

```ts
import { createConductCatalogItemSchema, createConductLogSchema } from './conduct.schema';

describe('createConductCatalogItemSchema', () => {
  it('vi phạm (kind=VIOLATION) điểm vượt quá 50 bị từ chối', () => {
    expect(
      createConductCatalogItemSchema.safeParse({ label: 'Đánh nhau', kind: 'VIOLATION', points: 51 }).success,
    ).toBe(false);
    expect(
      createConductCatalogItemSchema.safeParse({ label: 'Đánh nhau', kind: 'VIOLATION', points: 50 }).success,
    ).toBe(true);
  });

  it('điểm cộng (kind=MERIT) điểm vượt quá 30 bị từ chối', () => {
    expect(
      createConductCatalogItemSchema.safeParse({ label: 'Giúp bạn', kind: 'MERIT', points: 31 }).success,
    ).toBe(false);
  });

  it('chấp nhận specialRule tuỳ chọn', () => {
    expect(
      createConductCatalogItemSchema.safeParse({
        label: 'Không làm BTVN',
        kind: 'VIOLATION',
        points: 10,
        specialRule: 'HOMEWORK_NOT_DONE',
      }).success,
    ).toBe(true);
  });
});

describe('createConductLogSchema', () => {
  it('nhánh chọn từ danh mục: cần studentId + catalogItemId', () => {
    expect(
      createConductLogSchema.safeParse({ studentId: 's1', catalogItemId: 'c1' }).success,
    ).toBe(true);
  });

  it("nhánh 'Khác': cần studentId + kind + points + note, điểm phải trong giới hạn theo kind", () => {
    expect(
      createConductLogSchema.safeParse({ studentId: 's1', kind: 'VIOLATION', points: 5, note: 'Nói chuyện riêng' })
        .success,
    ).toBe(true);
    expect(
      createConductLogSchema.safeParse({ studentId: 's1', kind: 'VIOLATION', points: 60, note: 'Quá giới hạn' })
        .success,
    ).toBe(false);
  });
});
```

- [ ] **Step 10: Chạy test — xác nhận FAIL**

- [ ] **Step 11: Implement `packages/shared/src/schemas/conduct.schema.ts`**

```ts
import { z } from 'zod';
import { MAX_VIOLATION_POINTS, MAX_MERIT_POINTS } from '../constants/conduct';

export const conductKindEnum = z.enum(['VIOLATION', 'MERIT']);
export type ConductKind = z.infer<typeof conductKindEnum>;

export const conductSpecialRuleEnum = z.enum(['HOMEWORK_NOT_DONE']);
export type ConductSpecialRule = z.infer<typeof conductSpecialRuleEnum>;

function maxPointsFor(kind: ConductKind): number {
  return kind === 'VIOLATION' ? MAX_VIOLATION_POINTS : MAX_MERIT_POINTS;
}

export const createConductCatalogItemSchema = z
  .object({
    label: z.string().min(1).max(100),
    kind: conductKindEnum,
    points: z.number().int().positive(),
    specialRule: conductSpecialRuleEnum.optional(),
  })
  .refine((data) => data.points <= maxPointsFor(data.kind), {
    message: 'Điểm vượt quá giới hạn cho phép theo loại (vi phạm tối đa 50, điểm cộng tối đa 30)',
    path: ['points'],
  });
export type CreateConductCatalogItemInput = z.infer<typeof createConductCatalogItemSchema>;

export const updateConductCatalogItemSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateConductCatalogItemInput = z.infer<typeof updateConductCatalogItemSchema>;

const fromCatalogSchema = z.object({
  studentId: z.string().min(1),
  catalogItemId: z.string().min(1),
  note: z.string().max(200).optional(),
});

const customSchema = z
  .object({
    studentId: z.string().min(1),
    kind: conductKindEnum,
    points: z.number().int().positive(),
    note: z.string().min(1).max(200),
  })
  .refine((data) => data.points <= maxPointsFor(data.kind), {
    message: 'Điểm vượt quá giới hạn cho phép theo loại (vi phạm tối đa 50, điểm cộng tối đa 30)',
    path: ['points'],
  });

export const createConductLogSchema = z.union([fromCatalogSchema, customSchema]);
export type CreateConductLogInput = z.infer<typeof createConductLogSchema>;
```

- [ ] **Step 12: Chạy test — xác nhận PASS**

- [ ] **Step 13: Export tất cả từ `packages/shared/src/index.ts`**

```ts
export * from './constants/conduct';
export * from './schemas/attendance.schema';
export * from './schemas/conduct.schema';
```

- [ ] **Step 14: Chạy toàn bộ test `packages/shared` — xác nhận PASS** (`pnpm --filter @so-chu-nhiem/shared run test`)

- [ ] **Step 15: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): add attendance/conduct constants and zod DTOs"
```

---

## Task 2: `apps/api` — tiện ích ngày/tuần dùng chung

**Files:**
- Create: `apps/api/src/common/utils/date.ts`
- Create: `apps/api/src/common/utils/date.spec.ts`

**Interfaces:**
- Produces: `parseDateOnly(input: string): Date` (throws `BadRequestException` nếu `input` không khớp
  `yyyy-mm-dd` hoặc không phải ngày hợp lệ; trả về `Date` chuẩn hoá 00:00:00.000 UTC đúng ngày đó),
  `getIsoWeekStart(date: Date): Date` (trả về 00:00:00 UTC của Thứ Hai trong tuần ISO chứa `date`) — Task 3, 4,
  6, 7, 8 dùng cả hai hàm này.

- [ ] **Step 1: Viết test trước — `apps/api/src/common/utils/date.spec.ts`**

```ts
import { parseDateOnly, getIsoWeekStart } from './date';
import { BadRequestException } from '@nestjs/common';

describe('parseDateOnly', () => {
  it('parse đúng yyyy-mm-dd thành 00:00 UTC', () => {
    const d = parseDateOnly('2026-01-15');
    expect(d.toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  it('từ chối chuỗi không đúng định dạng hoặc ngày không hợp lệ', () => {
    expect(() => parseDateOnly('15/01/2026')).toThrow(BadRequestException);
    expect(() => parseDateOnly('2026-02-30')).toThrow(BadRequestException);
    expect(() => parseDateOnly('')).toThrow(BadRequestException);
  });
});

describe('getIsoWeekStart', () => {
  it('Chủ Nhật 23:59:59 UTC và Thứ Hai 00:00:00 UTC ngay sau đó rơi vào 2 tuần khác nhau', () => {
    // 2026-01-18 là Chủ Nhật, 2026-01-19 là Thứ Hai (xác nhận qua lịch ISO).
    const sunday = new Date('2026-01-18T23:59:59.000Z');
    const monday = new Date('2026-01-19T00:00:00.000Z');
    expect(getIsoWeekStart(sunday).toISOString()).not.toBe(getIsoWeekStart(monday).toISOString());
    expect(getIsoWeekStart(monday).toISOString()).toBe('2026-01-19T00:00:00.000Z');
  });

  it('bất kỳ ngày nào trong cùng 1 tuần ISO trả về cùng 1 weekStart', () => {
    const tuesday = new Date('2026-01-20T10:00:00.000Z');
    const sunday = new Date('2026-01-25T23:00:00.000Z');
    expect(getIsoWeekStart(tuesday).toISOString()).toBe(getIsoWeekStart(sunday).toISOString());
  });
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Implement `apps/api/src/common/utils/date.ts`**

```ts
import { BadRequestException } from '@nestjs/common';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateOnly(input: string): Date {
  const match = DATE_ONLY_PATTERN.exec(input ?? '');
  if (!match) {
    throw new BadRequestException('Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd');
  }
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const rolledOver =
    date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d);
  if (rolledOver) {
    throw new BadRequestException('Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd');
  }
  return date;
}

export function getIsoWeekStart(date: Date): Date {
  const isoDay = date.getUTCDay() === 0 ? 7 : date.getUTCDay(); // Chủ Nhật (0) -> 7, Thứ Hai -> 1
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - (isoDay - 1));
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}
```

- [ ] **Step 4: Chạy test — xác nhận PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/utils
git commit -m "feat(api): add date-only parsing and ISO week-start utilities"
```

---

## Task 3: `apps/api` — schema `AttendanceRecord`, `ConductCatalogItem`, `ConductLog`

**Files:**
- Create: `apps/api/src/database/schemas/attendance-record.schema.ts`
- Create: `apps/api/src/database/schemas/conduct-catalog-item.schema.ts`
- Create: `apps/api/src/database/schemas/conduct-log.schema.ts`
- Modify: `apps/api/src/database/database.module.ts`

**Interfaces:**
- Produces: `AttendanceRecord` (`classId, positionId, studentId, date, status, recordedBy`),
  `AttendanceStatus` type; `ConductCatalogItem` (`label, kind, points, specialRule?, isActive`), `ConductKind`,
  `ConductSpecialRule` types; `ConductLog` (`classId, positionId, studentId, catalogItemId, points, note?, date,
  weekStart, recordedBy`) — Task 4 (guard), Task 5 (attendance service), Task 6 (catalog service), Task 7
  (conduct-log service) dùng các Model này qua `@InjectModel`.

- [ ] **Step 1: Implement `apps/api/src/database/schemas/attendance-record.schema.ts`**

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type AttendanceStatus = 'PRESENT' | 'EXCUSED' | 'LATE' | 'UNEXCUSED';

@Schema({ timestamps: true })
export class AttendanceRecord extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Class', required: true })
  classId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Position', required: true })
  positionId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true })
  date: Date;

  @Prop({ required: true, enum: ['PRESENT', 'EXCUSED', 'LATE', 'UNEXCUSED'], default: 'PRESENT' })
  status: AttendanceStatus;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  recordedBy: Types.ObjectId;
}

export const AttendanceRecordSchema = SchemaFactory.createForClass(AttendanceRecord);
AttendanceRecordSchema.index({ positionId: 1, studentId: 1, date: 1 }, { unique: true });
AttendanceRecordSchema.index({ classId: 1, date: 1 });
```

- [ ] **Step 2: Implement `apps/api/src/database/schemas/conduct-catalog-item.schema.ts`**

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ConductKind = 'VIOLATION' | 'MERIT';
export type ConductSpecialRule = 'HOMEWORK_NOT_DONE';

@Schema({ timestamps: true })
export class ConductCatalogItem extends Document {
  @Prop({ required: true })
  label: string;

  @Prop({ required: true, enum: ['VIOLATION', 'MERIT'] })
  kind: ConductKind;

  @Prop({ required: true })
  points: number;

  @Prop({ enum: ['HOMEWORK_NOT_DONE'], default: null })
  specialRule: ConductSpecialRule | null;

  @Prop({ default: true })
  isActive: boolean;
}

export const ConductCatalogItemSchema = SchemaFactory.createForClass(ConductCatalogItem);
```

- [ ] **Step 3: Implement `apps/api/src/database/schemas/conduct-log.schema.ts`**

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ timestamps: true })
export class ConductLog extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Class', required: true })
  classId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Position', required: true })
  positionId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ConductCatalogItem', default: null })
  catalogItemId: Types.ObjectId | null;

  @Prop({ required: true })
  points: number;

  @Prop()
  note?: string;

  @Prop({ required: true })
  date: Date;

  @Prop({ required: true })
  weekStart: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  recordedBy: Types.ObjectId;
}

export const ConductLogSchema = SchemaFactory.createForClass(ConductLog);
ConductLogSchema.index({ studentId: 1, weekStart: 1 });
ConductLogSchema.index({ classId: 1, date: 1 });
```

- [ ] **Step 4: Đăng ký 3 schema trong `apps/api/src/database/database.module.ts`**

Thêm `AttendanceRecord/AttendanceRecordSchema`, `ConductCatalogItem/ConductCatalogItemSchema`,
`ConductLog/ConductLogSchema` vào mảng `MongooseModule.forFeature([...])` (cùng cách các schema Phase 1 đã
được đăng ký).

- [ ] **Step 5: Build xác nhận không lỗi type** (`pnpm --filter api run build`)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/database
git commit -m "feat(api): add AttendanceRecord, ConductCatalogItem, ConductLog schemas"
```

---

## Task 4: `apps/api` — `PositionOwnerGuard` + `@RequirePositionOwner` + `@ResolvedPosition`

**Files:**
- Create: `apps/api/src/common/decorators/require-position-owner.decorator.ts`
- Create: `apps/api/src/common/decorators/resolved-position.decorator.ts`
- Create: `apps/api/src/common/guards/position-owner.guard.ts`
- Create: `apps/api/src/common/guards/position-owner.guard.spec.ts`

**Interfaces:**
- Produces: `REQUIRE_POSITION_OWNER_KEY`, `RequirePositionOwner(requirement: 'SELF' | 'SELF_OR_HOMEROOM')`,
  `ResolvedPosition()` (param decorator, trả `request.position` — instance `Position` guard đã fetch sẵn),
  `PositionOwnerGuard` (đọc `:positionId` từ route param, gắn `request.position` khi cho qua) — Task 5 (Attendance)
  và Task 7 (ConductLog) dùng cả 3 trong `@UseGuards`/`@RequirePositionOwner`/`@ResolvedPosition()`.

- [ ] **Step 1: Viết test trước — `apps/api/src/common/guards/position-owner.guard.spec.ts`**

```ts
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Model, Types } from 'mongoose';
import { Position } from '../../database/schemas/position.schema';
import { PositionOwnerGuard } from './position-owner.guard';

const CLASS_A = '6ac0000000000000000000a1';
const POSITION_SUBJECT = '6ac0000000000000000000a2';
const HOLDER = '6ac0000000000000000000a3';
const HOMEROOM_HOLDER = '6ac0000000000000000000a4';

function buildContext(options: {
  requirement?: 'SELF' | 'SELF_OR_HOMEROOM';
  user?: { id: string; role: string };
  positionId?: string;
  position: { _id: string; classId: string; holderId: string | null; type: 'HOMEROOM' | 'SUBJECT' } | null;
  homeroomPosition?: { holderId: string | null } | null;
}) {
  const reflector = { getAllAndOverride: () => options.requirement } as unknown as Reflector;
  const findByIdMock = jest.fn(() => ({ exec: async () => options.position }));
  const findOneMock = jest.fn(() => ({ exec: async () => options.homeroomPosition ?? null }));
  const positionModel = { findById: findByIdMock, findOne: findOneMock } as unknown as Model<Position>;
  const request: Record<string, unknown> = { user: options.user, params: { positionId: options.positionId } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return { guard: new PositionOwnerGuard(reflector, positionModel), context, request };
}

describe('PositionOwnerGuard', () => {
  it('cho qua nếu route không khai báo @RequirePositionOwner', async () => {
    const { guard, context } = buildContext({ requirement: undefined, position: null });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('ADMIN luôn được bỏ qua', async () => {
    const { guard, context } = buildContext({
      requirement: 'SELF',
      user: { id: 'admin-id', role: 'ADMIN' },
      positionId: POSITION_SUBJECT,
      position: null,
    });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it("'SELF': đúng chủ vị trí thì qua, gắn request.position", async () => {
    const { guard, context, request } = buildContext({
      requirement: 'SELF',
      user: { id: HOLDER, role: 'TEACHER' },
      positionId: POSITION_SUBJECT,
      position: { _id: POSITION_SUBJECT, classId: CLASS_A, holderId: HOLDER, type: 'SUBJECT' },
    });
    expect(await guard.canActivate(context)).toBe(true);
    expect(request.position).toBeDefined();
  });

  it("'SELF': không phải chủ vị trí thì bị từ chối dù cùng lớp", async () => {
    const { guard, context } = buildContext({
      requirement: 'SELF',
      user: { id: HOMEROOM_HOLDER, role: 'TEACHER' },
      positionId: POSITION_SUBJECT,
      position: { _id: POSITION_SUBJECT, classId: CLASS_A, holderId: HOLDER, type: 'SUBJECT' },
    });
    expect(await guard.canActivate(context)).toBe(false);
  });

  it("'SELF_OR_HOMEROOM': GVCN (giữ HOMEROOM của lớp đó) xem được vị trí SUBJECT khác", async () => {
    const { guard, context } = buildContext({
      requirement: 'SELF_OR_HOMEROOM',
      user: { id: HOMEROOM_HOLDER, role: 'TEACHER' },
      positionId: POSITION_SUBJECT,
      position: { _id: POSITION_SUBJECT, classId: CLASS_A, holderId: HOLDER, type: 'SUBJECT' },
      homeroomPosition: { holderId: HOMEROOM_HOLDER },
    });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it("'SELF_OR_HOMEROOM': giáo viên không liên quan (không giữ vị trí này, không phải GVCN lớp đó) bị từ chối", async () => {
    const { guard, context } = buildContext({
      requirement: 'SELF_OR_HOMEROOM',
      user: { id: 'outsider-id', role: 'TEACHER' },
      positionId: POSITION_SUBJECT,
      position: { _id: POSITION_SUBJECT, classId: CLASS_A, holderId: HOLDER, type: 'SUBJECT' },
      homeroomPosition: { holderId: HOMEROOM_HOLDER },
    });
    expect(await guard.canActivate(context)).toBe(false);
  });

  it('positionId không tồn tại → từ chối, không throw', async () => {
    const { guard, context } = buildContext({
      requirement: 'SELF',
      user: { id: HOLDER, role: 'TEACHER' },
      positionId: '6ac0000000000000000000ff',
      position: null,
    });
    expect(await guard.canActivate(context)).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL** (module chưa tồn tại)

- [ ] **Step 3: Implement `apps/api/src/common/decorators/require-position-owner.decorator.ts`**

```ts
import { SetMetadata } from '@nestjs/common';

export const REQUIRE_POSITION_OWNER_KEY = 'requirePositionOwner';
export type PositionOwnerRequirement = 'SELF' | 'SELF_OR_HOMEROOM';
export const RequirePositionOwner = (requirement: PositionOwnerRequirement) =>
  SetMetadata(REQUIRE_POSITION_OWNER_KEY, requirement);
```

- [ ] **Step 4: Implement `apps/api/src/common/decorators/resolved-position.decorator.ts`**

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ResolvedPosition = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().position;
});
```

- [ ] **Step 5: Implement `apps/api/src/common/guards/position-owner.guard.ts`**

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Position } from '../../database/schemas/position.schema';
import { REQUIRE_POSITION_OWNER_KEY, PositionOwnerRequirement } from '../decorators/require-position-owner.decorator';

@Injectable()
export class PositionOwnerGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(Position.name) private readonly positionModel: Model<Position>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<PositionOwnerRequirement | undefined>(
      REQUIRE_POSITION_OWNER_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as { id: string; role: string } | undefined;
    if (!user) return false;
    if (user.role === 'ADMIN') return true;

    const positionId = request.params?.positionId;
    if (!positionId || !Types.ObjectId.isValid(positionId)) return false;
    const position = await this.positionModel.findById(positionId).exec();
    if (!position) return false;

    if (String(position.holderId) === user.id) {
      request.position = position;
      return true;
    }
    if (requirement === 'SELF_OR_HOMEROOM') {
      const homeroom = await this.positionModel.findOne({ classId: position.classId, type: 'HOMEROOM' }).exec();
      if (homeroom?.holderId && String(homeroom.holderId) === user.id) {
        request.position = position;
        return true;
      }
    }
    return false;
  }
}
```

- [ ] **Step 6: Chạy test — xác nhận PASS**

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common
git commit -m "feat(api): add PositionOwnerGuard for position-scoped attendance/conduct routes"
```

---

## Task 5: `apps/api` — `AttendanceModule`

**Files:**
- Create: `apps/api/src/attendance/attendance.service.ts`
- Create: `apps/api/src/attendance/attendance.controller.ts`
- Create: `apps/api/src/attendance/attendance.module.ts`
- Create: `apps/api/src/attendance/attendance.e2e.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `PositionOwnerGuard`/`@RequirePositionOwner`/`@ResolvedPosition` (Task 4), `PositionGuard`/
  `@RequirePosition` (Phase 1), `parseDateOnly` (Task 2), `markAttendanceSchema`/`MarkAttendanceInput` (Task 1).
- Produces: `AttendanceService.markAttendance(position: Position, dateStr: string, entries:
  {studentId: string; status: AttendanceStatus}[], recordedBy: string): Promise<AttendanceRecord[]>`,
  `.getByPosition(positionId: string, dateStr: string): Promise<AttendanceRecord[]>`,
  `.getClassSummary(classId: string, dateStr: string): Promise<Record<AttendanceStatus, number>>` — không task
  nào khác trong Phase 2A tiêu thụ trực tiếp, nhưng Phase 2B's Dashboard (xem spec) sẽ gọi lại
  `.getClassSummary`.

- [ ] **Step 1: Viết test trước — `apps/api/src/attendance/attendance.e2e.spec.ts`**

(Khuôn mẫu giống `students.e2e.spec.ts` ở Phase 1: dựng module tối giản gồm `AuthController` + `ClassesController`
+ `PositionsController` + `AttendanceController` + `ClassAttendanceController` cùng mọi service/model liên quan,
`buildTestMongoUri('attendance_e2e')`, tạo sẵn 1 `SchoolYear isCurrent` trong `beforeAll`. Helper
`createClassAsHomeroom`/`registerAndPromote` copy lại từ `students.e2e.spec.ts`, cộng thêm 2 helper cục bộ dùng
xuyên suốt mọi test file điểm danh/vi phạm từ đây trở đi (Task 7, và cả Phase 2B — mỗi file test tự khai báo lại
bản sao của mình, đúng quy ước hiện có của dự án: không có file test-utils dùng chung):

```ts
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
```

(`classModel`/`positionModel` lấy qua `moduleRef.get(getModelToken(Class.name))`/`getModelToken(Position.name)`
trong `beforeAll`, giống cách `userModel`/`schoolYearModel` đã lấy ở Phase 1.)

```ts
it('GVBM điểm danh đúng vị trí môn mình, GVCN xem được nhưng không sửa được', async () => {
  const { token: gvcnToken, classId, code } = await createClassAsHomeroom('gvcn.att-a', '10A1');
  const { token: gvbmToken } = await registerAndPromote('gvbm.att-a', 'TEACHER');
  const subjectPositionId = await joinAsSubject(code, gvbmToken, 'Toán');
  const studentRes = await request(app.getHttpServer())
    .post(`/classes/${classId}/students`)
    .set('Authorization', `Bearer ${gvcnToken}`)
    .send({ fullName: 'Học sinh A' });
  const studentId = studentRes.body._id as string;

  await request(app.getHttpServer())
    .put(`/positions/${subjectPositionId}/attendance?date=2026-01-19`)
    .set('Authorization', `Bearer ${gvbmToken}`)
    .send({ entries: [{ studentId, status: 'LATE' }] })
    .expect(200);

  const gvcnRead = await request(app.getHttpServer())
    .get(`/positions/${subjectPositionId}/attendance?date=2026-01-19`)
    .set('Authorization', `Bearer ${gvcnToken}`)
    .expect(200);
  expect(gvcnRead.body[0].status).toBe('LATE');

  await request(app.getHttpServer())
    .put(`/positions/${subjectPositionId}/attendance?date=2026-01-19`)
    .set('Authorization', `Bearer ${gvcnToken}`)
    .send({ entries: [{ studentId, status: 'PRESENT' }] })
    .expect(403);
});

it('ghi đè điểm danh (PUT) thay thế toàn bộ bản ghi ngoại lệ của ngày đó', async () => {
  const { token, classId, code } = await createClassAsHomeroom('gvcn.att-b', '10A2');
  const homeroomPositionId = (
    await request(app.getHttpServer()).get(`/classes/${code}`).expect(200)
  ).body.positions.find((p: { type: string }) => p.type === 'HOMEROOM');
  void homeroomPositionId; // findByCode không trả _id — lấy qua service trong test helper nếu cần thêm assertion
  const s1 = (
    await request(app.getHttpServer())
      .post(`/classes/${classId}/students`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'HS 1' })
  ).body._id as string;
  const s2 = (
    await request(app.getHttpServer())
      .post(`/classes/${classId}/students`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'HS 2' })
  ).body._id as string;

  const homeroomId = await getHomeroomPositionId(classId);
  await request(app.getHttpServer())
    .put(`/positions/${homeroomId}/attendance?date=2026-01-19`)
    .set('Authorization', `Bearer ${token}`)
    .send({ entries: [{ studentId: s1, status: 'LATE' }, { studentId: s2, status: 'EXCUSED' }] })
    .expect(200);

  await request(app.getHttpServer())
    .put(`/positions/${homeroomId}/attendance?date=2026-01-19`)
    .set('Authorization', `Bearer ${token}`)
    .send({ entries: [{ studentId: s1, status: 'UNEXCUSED' }] }) // s2 không còn trong payload
    .expect(200);

  const res = await request(app.getHttpServer())
    .get(`/positions/${homeroomId}/attendance?date=2026-01-19`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  expect(res.body.find((r: { studentId: string }) => r.studentId === s1).status).toBe('UNEXCUSED');
  expect(res.body.some((r: { studentId: string }) => r.studentId === s2)).toBe(false); // trở lại mặc định, không còn bản ghi ngoại lệ
});

it('giáo viên không liên quan tới lớp bị từ chối dù biết đúng positionId', async () => {
  const { classId, code } = await createClassAsHomeroom('gvcn.att-c', '10A3');
  const homeroomId = await getHomeroomPositionId(classId);
  const { token: outsiderToken } = await registerAndPromote('gv.att-outsider', 'TEACHER');
  void code;
  await request(app.getHttpServer())
    .get(`/positions/${homeroomId}/attendance?date=2026-01-19`)
    .set('Authorization', `Bearer ${outsiderToken}`)
    .expect(403);
});
```

(Viết đầy đủ helper `getHomeroomPositionId(classId)` bằng cách query `positionModel.findOne({classId,
type:'HOMEROOM'}).exec()` lấy từ `moduleRef.get(getModelToken(Position.name))`, theo đúng pattern đã dùng ở
`permission-matrix.e2e.spec.ts` của Phase 1B.)

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Implement `apps/api/src/attendance/attendance.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AttendanceRecord, AttendanceStatus } from '../database/schemas/attendance-record.schema';
import { Position } from '../database/schemas/position.schema';
import { parseDateOnly } from '../common/utils/date';

@Injectable()
export class AttendanceService {
  constructor(@InjectModel(AttendanceRecord.name) private readonly attendanceModel: Model<AttendanceRecord>) {}

  async markAttendance(
    position: Position,
    dateStr: string,
    entries: Array<{ studentId: string; status: AttendanceStatus }>,
    recordedBy: string,
  ): Promise<AttendanceRecord[]> {
    const date = parseDateOnly(dateStr);
    const keepStudentIds = entries.map((e) => e.studentId);
    await this.attendanceModel
      .deleteMany({ positionId: position._id, date, studentId: { $nin: keepStudentIds } })
      .exec();
    await Promise.all(
      entries.map((e) =>
        this.attendanceModel
          .findOneAndUpdate(
            { positionId: position._id, studentId: e.studentId, date },
            { classId: position.classId, status: e.status, recordedBy },
            { upsert: true, new: true },
          )
          .exec(),
      ),
    );
    return this.getByPosition(String(position._id), dateStr);
  }

  async getByPosition(positionId: string, dateStr: string): Promise<AttendanceRecord[]> {
    const date = parseDateOnly(dateStr);
    return this.attendanceModel.find({ positionId, date }).exec();
  }

  async getClassSummary(classId: string, dateStr: string): Promise<Record<AttendanceStatus, number>> {
    const date = parseDateOnly(dateStr);
    const counts: Record<AttendanceStatus, number> = { PRESENT: 0, EXCUSED: 0, LATE: 0, UNEXCUSED: 0 };
    const records = await this.attendanceModel.find({ classId, date }).exec();
    for (const r of records) counts[r.status] += 1;
    return counts;
  }
}
```

(`markAttendance` không cần transaction: `deleteMany` + các `findOneAndUpdate` độc lập đều tự nguyên tử ở cấp
từng document; không có bất biến xuyên-document nào cần bảo vệ ở bước này.)

- [ ] **Step 4: Implement `apps/api/src/attendance/attendance.controller.ts`**

```ts
import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { markAttendanceSchema } from '@so-chu-nhiem/shared';
import type { MarkAttendanceInput } from '@so-chu-nhiem/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResolvedPosition } from '../common/decorators/resolved-position.decorator';
import { RequirePositionOwner } from '../common/decorators/require-position-owner.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { Position } from '../database/schemas/position.schema';
import { AttendanceService } from './attendance.service';

@Controller('positions/:positionId/attendance')
@UseGuards(JwtAuthGuard, RolesGuard, PositionOwnerGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Put()
  @RequirePositionOwner('SELF')
  async markAttendance(
    @ResolvedPosition() position: Position,
    @Query('date') date: string,
    @Body(new ZodValidationPipe(markAttendanceSchema)) body: MarkAttendanceInput,
    @CurrentUser() user: { id: string },
  ) {
    return this.attendanceService.markAttendance(position, date, body.entries, user.id);
  }

  @Get()
  @RequirePositionOwner('SELF_OR_HOMEROOM')
  async getAttendance(@Param('positionId') positionId: string, @Query('date') date: string) {
    return this.attendanceService.getByPosition(positionId, date);
  }
}
```

- [ ] **Step 5: Implement `apps/api/src/attendance/class-attendance.controller.ts`**

```ts
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PositionGuard } from '../common/guards/position.guard';
import { RequirePosition } from '../common/decorators/require-position.decorator';
import { AttendanceService } from './attendance.service';

@Controller('classes/:classId/attendance')
@UseGuards(JwtAuthGuard, RolesGuard, PositionGuard)
export class ClassAttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('summary')
  @RequirePosition('ANY')
  async summary(@Param('classId') classId: string, @Query('date') date: string) {
    return this.attendanceService.getClassSummary(classId, date);
  }
}
```

- [ ] **Step 6: Implement `apps/api/src/attendance/attendance.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { ClassAttendanceController } from './class-attendance.controller';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { PositionGuard } from '../common/guards/position.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [AttendanceController, ClassAttendanceController],
  providers: [AttendanceService, PositionOwnerGuard, PositionGuard],
})
export class AttendanceModule {}
```

- [ ] **Step 7: Thêm `AttendanceModule` vào `apps/api/src/app.module.ts`**

- [ ] **Step 8: Chạy test — xác nhận PASS** (`pnpm --filter api run test -- attendance`)

- [ ] **Step 9: Lint + build + chạy toàn bộ test `api`**

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/attendance apps/api/src/app.module.ts
git commit -m "feat(api): add AttendanceModule with position-scoped and class-summary routes"
```

---

## Task 6: `apps/api` — `ConductCatalogModule` (ADMIN CRUD)

**Files:**
- Create: `apps/api/src/conduct-catalog/conduct-catalog.service.ts`
- Create: `apps/api/src/conduct-catalog/conduct-catalog.controller.ts`
- Create: `apps/api/src/conduct-catalog/conduct-catalog.module.ts`
- Create: `apps/api/src/conduct-catalog/conduct-catalog.e2e.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `createConductCatalogItemSchema`/`updateConductCatalogItemSchema` (Task 1).
- Produces: `ConductCatalogService.list(): Promise<ConductCatalogItem[]>` (chỉ `isActive: true`),
  `.create(input): Promise<ConductCatalogItem>`, `.update(id, input): Promise<ConductCatalogItem>` — Task 7
  (`ConductLogService`) gọi `.findByIdOrThrow(id): Promise<ConductCatalogItem>` để resolve `catalogItemId` khi
  tạo `ConductLog`.

- [ ] **Step 1: Viết test trước — `apps/api/src/conduct-catalog/conduct-catalog.e2e.spec.ts`**

(Khuôn mẫu tối giản: `AuthController` + `ConductCatalogController`, `registerAndPromote` copy từ Phase 1.)

```ts
it('TEACHER không tạo/sửa được danh mục (403), nhưng xem được (200)', async () => {
  const { token } = await registerAndPromote('gv.catalog-a', 'TEACHER');
  await request(app.getHttpServer())
    .post('/conduct-catalog')
    .set('Authorization', `Bearer ${token}`)
    .send({ label: 'Đi học muộn', kind: 'VIOLATION', points: 5 })
    .expect(403);
  await request(app.getHttpServer()).get('/conduct-catalog').set('Authorization', `Bearer ${token}`).expect(200);
});

it('ADMIN tạo/sửa được danh mục, item isActive=false không còn trong list()', async () => {
  const { token } = await registerAndPromote('admin.catalog-a', 'ADMIN');
  const createRes = await request(app.getHttpServer())
    .post('/conduct-catalog')
    .set('Authorization', `Bearer ${token}`)
    .send({ label: 'Đi học muộn', kind: 'VIOLATION', points: 5 })
    .expect(201);
  const id = createRes.body._id as string;

  await request(app.getHttpServer())
    .patch(`/conduct-catalog/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ isActive: false })
    .expect(200);

  const listRes = await request(app.getHttpServer())
    .get('/conduct-catalog')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  expect(listRes.body.some((item: { _id: string }) => item._id === id)).toBe(false);
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Implement `apps/api/src/conduct-catalog/conduct-catalog.service.ts`**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConductCatalogItem } from '../database/schemas/conduct-catalog-item.schema';
import type { CreateConductCatalogItemInput, UpdateConductCatalogItemInput } from '@so-chu-nhiem/shared';

@Injectable()
export class ConductCatalogService {
  constructor(
    @InjectModel(ConductCatalogItem.name) private readonly catalogModel: Model<ConductCatalogItem>,
  ) {}

  async list(): Promise<ConductCatalogItem[]> {
    return this.catalogModel.find({ isActive: true }).exec();
  }

  async create(input: CreateConductCatalogItemInput): Promise<ConductCatalogItem> {
    return this.catalogModel.create(input);
  }

  async update(id: string, input: UpdateConductCatalogItemInput): Promise<ConductCatalogItem> {
    const item = await this.findByIdOrThrow(id);
    if (input.label !== undefined) item.label = input.label;
    if (input.isActive !== undefined) item.isActive = input.isActive;
    await item.save();
    return item;
  }

  async findByIdOrThrow(id: string): Promise<ConductCatalogItem> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy mục danh mục này');
    }
    const item = await this.catalogModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException('Không tìm thấy mục danh mục này');
    }
    return item;
  }
}
```

- [ ] **Step 4: Implement `apps/api/src/conduct-catalog/conduct-catalog.controller.ts`**

```ts
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createConductCatalogItemSchema, updateConductCatalogItemSchema } from '@so-chu-nhiem/shared';
import type { CreateConductCatalogItemInput, UpdateConductCatalogItemInput } from '@so-chu-nhiem/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ConductCatalogService } from './conduct-catalog.service';

@Controller('conduct-catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TEACHER', 'ADMIN')
export class ConductCatalogController {
  constructor(private readonly catalogService: ConductCatalogService) {}

  @Get()
  async list() {
    return this.catalogService.list();
  }

  @Post()
  @Roles('ADMIN')
  async create(@Body(new ZodValidationPipe(createConductCatalogItemSchema)) body: CreateConductCatalogItemInput) {
    return this.catalogService.create(body);
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateConductCatalogItemSchema)) body: UpdateConductCatalogItemInput,
  ) {
    return this.catalogService.update(id, body);
  }
}
```

(2 tầng `@Roles`: controller-level `('TEACHER', 'ADMIN')` cho `GET` dùng chung, method-level `('ADMIN')` override
cho `POST`/`PATCH` — đúng pattern `PositionsController.reassign` đã dùng ở Phase 1.)

- [ ] **Step 5: Implement `apps/api/src/conduct-catalog/conduct-catalog.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ConductCatalogService } from './conduct-catalog.service';
import { ConductCatalogController } from './conduct-catalog.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [ConductCatalogController],
  providers: [ConductCatalogService],
  exports: [ConductCatalogService],
})
export class ConductCatalogModule {}
```

(`exports: [ConductCatalogService]` — Task 7's `ConductLogModule` cần import `ConductCatalogModule` để tiêm
`ConductCatalogService` vào `ConductLogService`.)

- [ ] **Step 6: Thêm `ConductCatalogModule` vào `apps/api/src/app.module.ts`**

- [ ] **Step 7: Chạy test — xác nhận PASS**

- [ ] **Step 8: Lint + build + chạy toàn bộ test `api`**

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/conduct-catalog apps/api/src/app.module.ts
git commit -m "feat(api): add ConductCatalogModule with ADMIN-only write access"
```

---

## Task 7: `apps/api` — `ConductLogModule` (ghi nhận vi phạm/điểm cộng + xếp loại rèn luyện)

**Files:**
- Create: `apps/api/src/conduct-log/conduct-log.service.ts`
- Create: `apps/api/src/conduct-log/conduct-log.controller.ts`
- Create: `apps/api/src/conduct-log/class-conduct.controller.ts`
- Create: `apps/api/src/conduct-log/conduct-log.module.ts`
- Create: `apps/api/src/conduct-log/conduct-log.e2e.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `PositionOwnerGuard`/`@RequirePositionOwner`/`@ResolvedPosition` (Task 4), `PositionGuard`/
  `@RequirePosition` (Phase 1), `getIsoWeekStart`/`parseDateOnly` (Task 2), `ConductCatalogService.findByIdOrThrow`
  (Task 6), `createConductLogSchema`/`CreateConductLogInput` (Task 1), `getConductRatingLabel` (Task 1).
- Produces: `ConductLogService.create(position: Position, input: CreateConductLogInput, recordedBy: string):
  Promise<ConductLog>` (**Phase 2B Task 4 sẽ MODIFY method này** để bọc transaction + gọi 2 rule tự sinh chép
  phạt — giữ nguyên signature, chỉ thêm side-effect bên trong), `.listByClass(classId: string, filter?:
  {studentId?: string; from?: Date; to?: Date}): Promise<ConductLog[]>`,
  `.getWeeklyRating(classId: string, dateInWeek: string): Promise<Array<{studentId: string; score: number; label:
  string}>>`.

- [ ] **Step 1: Viết test trước — `apps/api/src/conduct-log/conduct-log.e2e.spec.ts`**

(Khuôn mẫu giống Task 5, thêm `ConductCatalogController`/`ConductCatalogService` vào module test.)

```ts
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
  expect(logsRes.body[0].points).toBe(-5); // VIOLATION → điểm âm
});

it("nhánh 'Khác' (không catalogItemId): điểm cộng dương, vi phạm âm, tự suy ra dấu từ kind", async () => {
  const { token, classId, code } = await createClassAsHomeroom('gvcn.cl-b', '10B2');
  const homeroomId = await getHomeroomPositionId(classId);
  const studentId = await createStudent(classId, token, 'Học sinh B');
  void code;

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
  const { classId, code } = await createClassAsHomeroom('gvcn.cl-c', '10B3');
  const homeroomId = await getHomeroomPositionId(classId);
  const { token: gvbmToken } = await registerAndPromote('gvbm.cl-c', 'TEACHER');
  await joinAsSubject(code, gvbmToken, 'Toán');
  const studentId = await createStudent(classId, (await registerAndPromote('gvcn.cl-c2', 'TEACHER')).token, 'X');
  void studentId;

  await request(app.getHttpServer())
    .post(`/positions/${homeroomId}/conduct-logs`)
    .set('Authorization', `Bearer ${gvbmToken}`)
    .send({ studentId: 'irrelevant', kind: 'MERIT', points: 5, note: 'x' })
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

  const ratingRes = await request(app.getHttpServer())
    .get(`/classes/${classId}/conduct-rating?date=2026-01-19`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const row = ratingRes.body.find((r: { studentId: string }) => r.studentId === studentId);
  expect(row.score).toBe(125); // 100 + 30 - 5
  expect(row.label).toBe('Xuất sắc');
});
```

(Các bản ghi `conduct-logs` trong test dùng ngày hệ thống hiện tại làm `date` mặc định ở service nếu request
không gửi `date` — xem Step 3; test cuối cố định ngày truy vấn `2026-01-19` nên PHẢI cũng truyền `date` khi
tạo log tương ứng đúng tuần đó, hoặc service nhận thêm `date` tuỳ chọn trong body `createConductLogSchema`
— spec không yêu cầu field này, nên cách đơn giản nhất: test luôn chạy trong cùng 1 tuần với ngày hệ thống thật
lúc test chạy, KHÔNG hard-code `2026-01-19` cho bước tạo log — chỉ hard-code khi so sánh nếu cần. Viết lại test
cuối dùng `new Date()` hiện tại cho mốc truy vấn `conduct-rating` thay vì ngày cố định, để tránh phụ thuộc vào
thời điểm chạy CI.)

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Implement `apps/api/src/conduct-log/conduct-log.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConductLog } from '../database/schemas/conduct-log.schema';
import { Position } from '../database/schemas/position.schema';
import { getConductRatingLabel } from '@so-chu-nhiem/shared';
import type { CreateConductLogInput } from '@so-chu-nhiem/shared';
import { ConductCatalogService } from '../conduct-catalog/conduct-catalog.service';
import { getIsoWeekStart, parseDateOnly } from '../common/utils/date';

@Injectable()
export class ConductLogService {
  constructor(
    @InjectModel(ConductLog.name) private readonly conductLogModel: Model<ConductLog>,
    private readonly catalogService: ConductCatalogService,
  ) {}

  async create(position: Position, input: CreateConductLogInput, recordedBy: string): Promise<ConductLog> {
    const date = new Date();
    const doc: Partial<ConductLog> = {
      classId: position.classId,
      positionId: position._id,
      studentId: input.studentId as unknown as ConductLog['studentId'],
      date,
      weekStart: getIsoWeekStart(date),
      recordedBy: recordedBy as unknown as ConductLog['recordedBy'],
      note: input.note,
    };
    if ('catalogItemId' in input) {
      const item = await this.catalogService.findByIdOrThrow(input.catalogItemId);
      doc.catalogItemId = item._id as unknown as ConductLog['catalogItemId'];
      doc.points = item.kind === 'VIOLATION' ? -item.points : item.points;
    } else {
      doc.catalogItemId = null;
      doc.points = input.kind === 'VIOLATION' ? -input.points : input.points;
    }
    return this.conductLogModel.create(doc);
  }

  async listByClass(classId: string, filter?: { studentId?: string }): Promise<ConductLog[]> {
    const query: Record<string, unknown> = { classId };
    if (filter?.studentId) query.studentId = filter.studentId;
    return this.conductLogModel.find(query).sort({ date: -1 }).exec();
  }

  async getWeeklyRating(
    classId: string,
    dateInWeek: string,
  ): Promise<Array<{ studentId: string; score: number; label: string }>> {
    const weekStart = getIsoWeekStart(parseDateOnly(dateInWeek));
    const rows = await this.conductLogModel.aggregate([
      { $match: { classId: new (require('mongoose').Types.ObjectId)(classId), weekStart } },
      { $group: { _id: '$studentId', total: { $sum: '$points' } } },
    ]);
    return rows.map((r) => {
      const score = 100 + r.total;
      return { studentId: String(r._id), score, label: getConductRatingLabel(score) };
    });
  }
}
```

(Gợi ý cho implementer: thay `require('mongoose')` bằng `import { Types } from 'mongoose'` ở đầu file — viết
tắt ở đây chỉ để không lặp lại toàn bộ khối import; implementer tự biết cách import đúng chuẩn dự án.)

- [ ] **Step 4: Implement `apps/api/src/conduct-log/conduct-log.controller.ts`**

```ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { createConductLogSchema } from '@so-chu-nhiem/shared';
import type { CreateConductLogInput } from '@so-chu-nhiem/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResolvedPosition } from '../common/decorators/resolved-position.decorator';
import { RequirePositionOwner } from '../common/decorators/require-position-owner.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { Position } from '../database/schemas/position.schema';
import { ConductLogService } from './conduct-log.service';

@Controller('positions/:positionId/conduct-logs')
@UseGuards(JwtAuthGuard, RolesGuard, PositionOwnerGuard)
export class ConductLogController {
  constructor(private readonly conductLogService: ConductLogService) {}

  @Post()
  @RequirePositionOwner('SELF')
  async create(
    @ResolvedPosition() position: Position,
    @Body(new ZodValidationPipe(createConductLogSchema)) body: CreateConductLogInput,
    @CurrentUser() user: { id: string },
  ) {
    return this.conductLogService.create(position, body, user.id);
  }
}
```

- [ ] **Step 5: Implement `apps/api/src/conduct-log/class-conduct.controller.ts`**

```ts
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PositionGuard } from '../common/guards/position.guard';
import { RequirePosition } from '../common/decorators/require-position.decorator';
import { ConductLogService } from './conduct-log.service';

@Controller('classes/:classId')
@UseGuards(JwtAuthGuard, RolesGuard, PositionGuard)
export class ClassConductController {
  constructor(private readonly conductLogService: ConductLogService) {}

  @Get('conduct-logs')
  @RequirePosition('ANY')
  async list(@Param('classId') classId: string, @Query('studentId') studentId?: string) {
    return this.conductLogService.listByClass(classId, { studentId });
  }

  @Get('conduct-rating')
  @RequirePosition('ANY')
  async rating(@Param('classId') classId: string, @Query('date') date: string) {
    return this.conductLogService.getWeeklyRating(classId, date);
  }
}
```

- [ ] **Step 6: Implement `apps/api/src/conduct-log/conduct-log.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ConductCatalogModule } from '../conduct-catalog/conduct-catalog.module';
import { ConductLogService } from './conduct-log.service';
import { ConductLogController } from './conduct-log.controller';
import { ClassConductController } from './class-conduct.controller';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { PositionGuard } from '../common/guards/position.guard';

@Module({
  imports: [DatabaseModule, ConductCatalogModule],
  controllers: [ConductLogController, ClassConductController],
  providers: [ConductLogService, PositionOwnerGuard, PositionGuard],
  exports: [ConductLogService],
})
export class ConductLogModule {}
```

(`exports: [ConductLogService]` — Phase 2B cần import module này để lấy `ConductLogService` khi viết Task về
chép phạt tự động.)

- [ ] **Step 7: Thêm `ConductLogModule` vào `apps/api/src/app.module.ts`**

- [ ] **Step 8: Chạy test — xác nhận PASS**

- [ ] **Step 9: Lint + build + chạy toàn bộ test `api`**

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/conduct-log apps/api/src/app.module.ts
git commit -m "feat(api): add ConductLogModule with position-scoped logging and weekly conduct rating"
```

---

## Task 8: Ma trận test phân quyền điểm danh + vi phạm/điểm cộng

**Files:**
- Create: `apps/api/src/attendance/permission-matrix.e2e.spec.ts`

**Interfaces:**
- Không có interface nào task khác tiêu thụ — file test độc lập, liệt kê đủ các cặp (role/vị trí, hành động)
  theo đúng Review Focus của plan này.

- [ ] **Step 1: Viết test — mỗi dòng dưới đây là 1 `it()`, khuôn mẫu giống
  `permission-matrix.e2e.spec.ts` của Phase 1B**

  | Vị trí giữ | Hành động | Kỳ vọng |
  |---|---|---|
  | GVBM (SUBJECT môn mình) | `PUT .../attendance` đúng position của mình | 200 |
  | GVBM (SUBJECT môn mình) | `PUT .../attendance` vào position môn KHÁC cùng lớp | 403 |
  | GVBM (SUBJECT môn mình) | `POST .../conduct-logs` đúng position của mình | 201 |
  | GVCN (HOMEROOM) | `GET .../attendance` vị trí SUBJECT bất kỳ cùng lớp | 200 |
  | GVCN (HOMEROOM) | `PUT .../attendance` vị trí SUBJECT (không phải mình) | 403 |
  | Giáo viên không giữ vị trí nào của lớp | `GET .../attendance` bất kỳ position nào của lớp đó | 403 |
  | ADMIN | `PUT .../attendance`, `POST .../conduct-logs` bất kỳ position nào | 200/201 |
  | TEACHER (bất kỳ) | `POST /conduct-catalog` | 403 |
  | ADMIN | `POST /conduct-catalog`, `PATCH /conduct-catalog/:id` | 201/200 |

- [ ] **Step 2: Chạy test — xác nhận PASS** (hầu hết case này đã được đảm bảo bởi `PositionOwnerGuard`/
  `PositionGuard`/`RolesGuard` viết ở Task 4-7; nếu có case FAIL thì đó là dấu hiệu guard thiếu sót thật, quay
  lại task tương ứng sửa.)

- [ ] **Step 3: Lint + build + chạy toàn bộ test `api`**

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/attendance/permission-matrix.e2e.spec.ts
git commit -m "test(api): add permission matrix for attendance and conduct logging"
```

---

## Task 9: Verify toàn bộ monorepo + báo cáo

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

- [ ] **Step 2: Không phải code — báo cáo lại cho người dùng Phase 2A: những gì đã làm, kết quả test, ruling
  nào đã ghi vào ledger, rồi chờ duyệt trước khi sang Phase 2B.**

---

## Tổng kết Self-Review

- **Spec coverage:** Điểm danh theo Position cả 2 chiều GVCN/GVBM (Task 5), danh mục ADMIN quản lý (Task 6),
  ghi nhận vi phạm/điểm cộng kể cả nhánh "Khác" (Task 7), xếp loại rèn luyện theo tuần ISO (Task 7). Chép phạt
  tự động, `SchoolConfig`, Dashboard — đã nói rõ thuộc Phase 2B, không phải thiếu sót của plan này.
- **Step scan:** mỗi step pin chữ ký/test cụ thể; phần aggregate `getWeeklyRating` có 1 dòng ghi chú nhường
  quyết định "import Types ở đâu" cho implementer vì đó là chi tiết cú pháp không ảnh hưởng hành vi.
- **Type consistency:** `AttendanceService`/`ConductLogService` dùng nhất quán `Position` (từ
  `database/schemas/position.schema.ts`, Phase 1) làm tham số đầu vào xuyên suốt Task 5, 7 — không đổi tên/kiểu
  giữa các task.
- **Review Focus:** cả 5 mục (GVBM ghi nhầm vị trí, GVCN đọc-được/sửa-không-được vị trí khác, giáo viên ngoài
  lớp, ranh giới tuần ISO, nhánh "Khác" validate điểm) đều có test cụ thể ở đúng task sở hữu (Task 5, 7, 8 cho
  phân quyền; Task 2, 3, 9 cho ranh giới tuần/validate điểm).
- **Proportion:** code mẫu chỉ pin chữ ký + nhánh rẽ nghiệp vụ bắt buộc (vd dấu điểm theo `kind`, upsert theo
  position+date); Task 8 chỉ liệt kê bảng, không viết sẵn toàn bộ file test.
