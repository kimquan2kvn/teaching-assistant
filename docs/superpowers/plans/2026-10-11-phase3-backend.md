# Phase 3 (backend) — Lịch năm học, PPCT, TKB, Engine khớp tiết, Sổ báo giảng — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend thuần (`apps/api` + zod schema ở `packages/shared`) cho: ngày nghỉ toàn trường + thẻ thống kê lịch năm học, TKB do GVBM tự khai báo, PPCT theo từng Position (nhập tay + import Excel có preview), engine khớp tiết tự động rải PPCT vào TKB, và sổ báo giảng (xem theo lớp/tuần hoặc theo tuần của mọi lớp, tích "Đã thực hiện", kéo chỉnh tay).

**Architecture:** 4 module mới (`holidays`, `timetable-slots`, `ppct`, `lesson-logs`). Engine tách 2 tầng: hàm THUẦN không DB (`lesson-schedule.ts`: dựng ô, giữ chỗ cho log bị khóa, rải PPCT) được test ≥12 kịch bản trước, rồi `LessonLogEngineService` bọc DB + transaction (mọi thao tác ghi TKB/PPCT/ngày nghỉ chạy chung 1 transaction với lần tính lại). Phân quyền dùng lại `PositionOwnerGuard`/`@RequirePositionOwner`/`@ResolvedPosition` (Phase 2) cho route theo `:positionId`, `@Roles` cho route không theo position.

**Tech Stack:** NestJS 10 + Mongoose 8 (transaction), zod (`packages/shared`), exceljs (đã có từ Phase 1), Jest + `mongodb-memory-server` replica set + supertest.

**Spec:** [docs/superpowers/specs/2026-10-11-phase3-design.md](../specs/2026-10-11-phase3-design.md) (ĐÃ DUYỆT 2026-10-11 — nguồn sự thật, đặc biệt 3.1, 3.2, 4.2–4.6). Giả định đã ghi: `docs/ASSUMPTIONS.md` mục "Phase 3 (backend)". Không có UI, không có route cho STUDENT, không có `SubscriptionGuard` (Phase 6).

## Global Constraints

- **Lệnh shell**: mọi lệnh `pnpm`/`node` chạy sau `source ~/.nvm/nvm.sh && nvm use 20 &&` (môi trường mặc định Node 18). Plan viết rút gọn, không lặp tiền tố. Hai lệnh verify chuẩn:
  - **V-SHARED** = `pnpm --filter @so-chu-nhiem/shared run lint && pnpm --filter @so-chu-nhiem/shared run build && pnpm --filter @so-chu-nhiem/shared run test`
  - **V-API** = `pnpm --filter api run lint && pnpm --filter api run build && pnpm --filter api run test` (gồm cả `app.module.e2e.spec.ts`)
- **`apps/api` import `@so-chu-nhiem/shared` qua `packages/shared/dist`** (không có `moduleNameMapper`): sau MỖI lần sửa `packages/shared/src`, phải `pnpm --filter @so-chu-nhiem/shared run build` rồi mới chạy test `api`, nếu không ts-jest báo thiếu export.
- **Mongoose**: mọi `@Prop({ type: ... })` tham chiếu ObjectId dùng `MongooseSchema.Types.ObjectId` (`import { Schema as MongooseSchema } from 'mongoose'`), KHÔNG dùng `Types.ObjectId` làm `type:` (bug đã xảy ra 3 lần — field âm thầm thành `Mixed`). Mỗi schema mới có test `schema.path('<field>').instance === 'ObjectId'`.
- **Module mới tự `imports: [DatabaseModule]`** (bug đã xảy ra 3 lần). Mỗi task thêm module vào `AppModule` và chạy `app.module.e2e.spec.ts` (nằm trong V-API) để bắt lỗi này.
- **"Hôm nay"**: KHÔNG dùng `new Date().toISOString().slice(0,10)` và KHÔNG dùng getter giờ địa phương của server (container thường chạy UTC). Dùng `todayDateOnlyVN(clock.now())` (cộng cố định UTC+7, giống `getIsoWeekStartVN`), nhận "bây giờ" qua provider `Clock` để test giả lập được giờ.
- **Ngày**: API nhận/trả ngày dạng `yyyy-mm-dd` (không giờ); lưu 00:00:00 UTC của đúng ngày đó (`parseDateOnly`). `dayOfWeek` của slot: Thứ Hai=2 … Thứ Bảy=7 (= `getUTCDay()+1`; Chủ Nhật = 1, không bao giờ là ngày học).
- **zod**: ngày dùng `dateOnlySchema` (phát issue `custom` với message tiếng Việt — `ZodValidationPipe` giữ nguyên văn nhánh `custom`; mọi `.refine()` có `message` tiếng Việt).
- **Transaction**: mọi thao tác "ghi dữ liệu + tính lại sổ báo giảng" chạy trong **1 transaction** (`runInTransaction`, tức `session.withTransaction` — tự retry khi `TransientTransactionError`, nên callback phải chạy lại được; mọi query bên trong dùng `.session(session)`; các query trong 1 session chạy TUẦN TỰ, không `Promise.all`). Không có thao tác nào cần "bắt E11000 rồi chạy tiếp" nên KHÔNG dùng dạng ghi tuần tự không transaction; E11000 lọt ra sẽ được `MongoExceptionFilter` map thành 409.
- **Phân quyền** (kiểm tra bằng guard, không chỉ ẩn UI): `JwtAuthGuard + RolesGuard` mọi route; route theo vị trí thêm `PositionOwnerGuard` (ADMIN được bỏ qua — đã xác nhận trong `position-owner.guard.ts`, vẫn gắn `request.position`). Mọi route Phase 3 gắn `@Roles('TEACHER','ADMIN')` ở cấp class để STUDENT bị chặn trước khi chạm DB (riêng `GET /timetable/me` và `GET /lesson-logs/week`: `@Roles('TEACHER')`; route ghi ngày nghỉ và `recalculate`: `@Roles('ADMIN')` ở cấp method).
- **Lỗi tiếng Việt**: mọi lỗi nghiệp vụ do Phase 3 chủ động ném dùng đúng message dưới đây (test assert đúng văn bản này); 403 do guard giữ hành vi hiện có của dự án (xem Open Question 5).

| Mã | Message |
|---|---|
| 400 | `Ngày kết thúc không được trước ngày bắt đầu` (ngày nghỉ) |
| 400 | `Ngày kết thúc hiệu lực không được trước ngày bắt đầu hiệu lực` (slot) |
| 400 | `Ngày bắt đầu không được sau ngày kết thúc` (query `from`/`to`) |
| 400 | `Ngày này không có tiết của môn` (đổi ngày vào ngày nghỉ / ngày không có tiết trong TKB) |
| 400 | `Chỉ vị trí giáo viên bộ môn mới có thời khóa biểu và PPCT` (ghi vào position HOMEROOM) |
| 400 | `Cần gửi ít nhất một trong hai trường: date hoặc done` |
| 409 | `Bạn đã có tiết khác vào thời điểm này` (trùng slot với position khác của cùng giáo viên) |
| 409 | `Tiết này đã có trong thời khóa biểu của môn trong khoảng thời gian trùng` (trùng slot cùng position) |
| 409 | `Ngày này đã có buổi học khác, không thể chuyển vào` (ô bị log khóa khác chiếm hết) |
| 404 | `Không tìm thấy năm học` / `Không tìm thấy ngày nghỉ` / `Không tìm thấy tiết trong thời khóa biểu` / `Không tìm thấy mục PPCT` / `Không tìm thấy buổi học` (cũng dùng khi id không phải ObjectId hợp lệ, hoặc id thuộc position khác) |
| 400 | `Chưa chọn file để import` / `File không đúng định dạng Excel (.xlsx)` / `File Excel không có sheet nào` / `File có quá nhiều dòng (tối đa 500)` |

- **Commit**: mỗi task 1 commit riêng; message kết thúc bằng dòng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (ghi bằng `-m` thứ hai). TDD: test fail đúng lý do → implement tối thiểu → pass → commit.
- Frontend (`apps/web`) không đụng tới ở plan này.

## Review Focus

Các đầu vào/điều kiện spec ngầm đòi nhưng dễ sót nhất (mỗi dòng đã có test ở task sở hữu code):

1. **IDOR qua id con**: GVBM giữ position A gọi `/positions/A/ppct/<itemId của position B>` (tương tự `slotId`, lesson-log `:id`) phải nhận 404 và dữ liệu B không đổi — guard chỉ xác nhận `positionId`, không xác nhận id con thuộc position đó. → Task 8, 9, 11.
2. **Ngày đầu vào & múi giờ VN**: `weekStart` không phải Thứ Hai (phải chuẩn hóa về Thứ Hai); không truyền `weekStart` lúc 00:00–07:00 sáng Thứ Hai giờ VN (UTC vẫn là Chủ Nhật) phải ra đúng tuần mới; `2026-02-30`/`19/01/2026`/`from > to` → 400 tiếng Việt. → Task 2, 11, 12.
3. **Trạng thái rỗng**: giáo viên chưa giữ vị trí nào gọi `/timetable/me`, `/lesson-logs/week` → 200 với mảng rỗng; position có PPCT nhưng chưa có slot → tính lại ra 0 log, không lỗi; năm học chưa có ngày nghỉ → thẻ thống kê toàn 0; PPCT dài hơn số ô còn lại không lỗi. → Task 5, 7, 12.
4. **Hình dạng ngày nghỉ**: 2 ngày nghỉ khác loại chồng nhau chỉ tính 1 lần vào tổng; ngày nghỉ kéo qua Chủ Nhật; ngày nghỉ vượt ngoài khoảng năm học bị cắt; thêm ngày nghỉ đúng vào ngày của 1 log đã `done` thì log đó KHÔNG bị dời. → Task 5, 6, 7.
5. **Nguyên tử + đồng thời**: tính lại lỗi giữa chừng phải rollback luôn cả thao tác ghi gốc (không để slot/PPCT/ngày nghỉ đã lưu mà sổ báo giảng cũ); 2 request `POST /ppct` đồng thời không sinh `order` trùng và không trả 500. → Task 5, 7, 8, 9.

## Quyết định triển khai (lấp khoảng trống của spec — ghi vào ASSUMPTIONS ở Task 15)

1. **Log "đã giữ lại" ≠ chỉ log bị khóa.** Spec 4.3 bước 4 chỉ bỏ các mục có log *bị khóa*; nhưng log chưa khóa có `date < fromDate` cũng được giữ nguyên (bước 2), nếu engine vẫn xếp lại mục đó thì `insert` vi phạm unique `(positionId, ppctItemId)`. → Engine coi mọi log được giữ (mọi log `date < fromDate` + log khóa `date >= fromDate`) là "mục đã xếp", bỏ qua mục đó.
2. **`LessonLog` không lưu tiết** (schema đã duyệt chỉ có `date`) → ô bị log khóa chiếm suy ra từ `date`: log khóa chiếm `periodCount` ô TỰ DO đầu tiên có `date >= log.date` (xử lý theo thứ tự `(date, order)`). Log khóa nằm trên ngày không còn ô (vd ngày vừa thành ngày nghỉ) chiếm ô tự do đầu tiên sau đó; `date` lưu không bị sửa.
3. **"Liên tiếp"** = liên tiếp trong chuỗi ô tự do (đã bỏ ô bị giữ chỗ). Mục không đủ `periodCount` ô tự do thì DỪNG, các mục sau cũng không xếp (giữ đúng thứ tự `order`).
4. **Engine không đọc `saturdayIsSchoolDay`** (slot do giáo viên khai báo là nguồn đúng; cờ chỉ dùng cho thẻ thống kê, đúng spec 4.2). Slot `dayOfWeek=7` vẫn được xếp tiết dù cờ tắt (Open Question 1).
5. **Năm học của engine = năm học của lớp** (`Class.schoolYearId`), không phải "năm học hiện hành": trùng nhau ở mọi luồng v1 (lớp mới tự gán năm hiện hành), nhưng không 404 khi không có năm hiện hành và đúng khi sửa lớp năm cũ. Ngày nghỉ lấy theo `schoolYearId` đó. `fromDate` luôn bị kẹp `>= SchoolYear.startDate`.
6. **`fromDate` khi tính lại**: ghi slot → `effectiveFrom` (PATCH: nhỏ hơn giữa giá trị cũ/mới; DELETE: `effectiveFrom` của slot); ghi ngày nghỉ → `startDate` (PATCH: min cũ/mới); ghi PPCT/import → **hôm nay (VN)**, NGOẠI LỆ position chưa có log nào (xếp lần đầu) → đầu năm học, để thứ tự nhập PPCT-trước/TKB-trước không làm khác kết quả (Open Question 2); ADMIN `POST .../recalculate` nhận `fromDate` tuỳ chọn, mặc định như PPCT.
7. **Tính lại giữ nguyên `_id` log**: không xóa-chèn lại; xóa log chưa khóa `date >= fromDate` mà mục không còn được xếp, rồi `bulkWrite` upsert theo `(positionId, ppctItemId)` — để id mà UI đang giữ không bị mồ côi sau mỗi lần tính lại do thao tác khác.
8. **PPCT `order`**: hệ thống gán, POST luôn thêm CUỐI (`max(order)+1`), import nối tiếp sau `order` lớn nhất; PATCH không đổi `order`; DELETE không đánh số lại (chỗ trống OK). Không có chèn giữa/đổi thứ tự ở v1 (Open Question 4). Xóa mục PPCT xóa luôn `LessonLog` của nó (kể cả `done`).
9. **`periodLabel`** chỉ là chuỗi hiển thị (trim, 1–20 ký tự) — không ép regex vì "Tiết thứ" của mục 2 tiết có thể là `15-16`. `week` int 1–60, `periodCount` int 1–10, `period` của slot int 1–10, import tối đa 500 dòng (giới hạn hợp lý, không có trong brief).
10. **Slot/PPCT chỉ ghi được vào position `SUBJECT`**; đọc position HOMEROOM trả rỗng.
11. **Thẻ thống kê** (`calendar-stats`): đếm ngày LỊCH nằm trong khoảng năm học bị ngày nghỉ phủ (cả Chủ Nhật nếu ngày nghỉ kéo qua); `totalHolidayDays` = hợp (mỗi ngày 1 lần dù chồng nhiều loại); `leHolidayDays`/`dotXuatHolidayDays` = hợp theo từng loại; `remainingTeachingDays` = số ngày từ `asOf` (mặc định hôm nay VN, tính cả `asOf`) đến hết năm học, trừ Chủ Nhật, trừ Thứ Bảy khi `saturdayIsSchoolDay=false`, trừ ngày nghỉ. Query `asOf=yyyy-mm-dd` tuỳ chọn (để test xác định và để UI xem "tính đến ngày").
12. **`GET holidays` / `calendar-stats`**: spec 4.4 ghi "mọi user đăng nhập" nhưng 4.6 ghi "STUDENT 403 mọi route" → áp `@Roles('TEACHER','ADMIN')` (STUDENT 403). `GET /timetable/me`, `GET /lesson-logs/week`: chỉ TEACHER (ADMIN 403, đúng bảng 4.4).
13. **DELETE** trả `200 { deleted: true }`. `POST .../recalculate` trả `200 { scheduled: number }`. Các POST tạo mới trả 201 (mặc định Nest), kể cả `import/preview`/`import/commit` (giống import học sinh Phase 1).

## Câu hỏi mở

> **Người dùng đã xác nhận (2026-10-11): giữ mặc định của plan cho câu 1-4** (không chặn slot Thứ Bảy; `fromDate` mặc định hôm nay VN,
> lần xếp đầu từ đầu năm học; không thêm `period` vào `LessonLog`; PPCT v1 chỉ thêm cuối). Câu 5-6 không nằm trong plan này.

1. **Thứ Bảy**: spec 4.2 chỉ dùng `saturdayIsSchoolDay` cho thẻ thống kê. Nếu GVBM khai báo slot Thứ Bảy khi cờ tắt thì engine vẫn xếp tiết vào Thứ Bảy (quyết định 4). Muốn chặn tạo slot Thứ Bảy khi cờ tắt (400) hay để nguyên?
2. **`fromDate` khi ghi PPCT**: spec không nêu. Mặc định "hôm nay (VN)", ngoại lệ xếp lần đầu → đầu năm học (quyết định 6). PPCT nhập giữa năm học sẽ không tự lấp các buổi đã qua ngoài lần xếp đầu tiên; ADMIN có thể `recalculate` với `fromDate` tuỳ chọn.
3. **`LessonLog` không có trường tiết**: ô bị log khóa chiếm suy ra từ `date` (quyết định 2). Nếu cần kéo-thả chính xác tới từng TIẾT trong ngày có ≥2 tiết, phải thêm `period` vào schema đã duyệt — chưa làm.
4. **Chèn/đổi thứ tự PPCT**: spec ghi `order` do hệ thống gán nên v1 chỉ thêm cuối (quyết định 8). Muốn chèn giữa phải thêm API đánh số lại (unique `(positionId, order)` khiến việc dịch số cần ghi 2 bước).
5. **403 tiếng Anh**: guard trả `false` → Nest sinh `Forbidden resource` (đã tồn tại ở Phase 1–2, không riêng Phase 3). Brief yêu cầu mọi lỗi tiếng Việt; đề xuất sửa 1 chỗ trong `MongoExceptionFilter` (map `ForbiddenException` mặc định + 401 mặc định sang tiếng Việt) ở một việc riêng, không nằm trong plan này.
6. **Gán lại vị trí (`reassign`) có thể tạo slot trùng**: kiểm tra "cùng giáo viên không có 2 slot trùng" chỉ chạy lúc ghi slot, không chạy lại khi ADMIN gán position cho giáo viên đã có tiết trùng giờ. Chưa xử lý ở Phase 3.

## File Structure

```
packages/shared/src/
  constants/schedule.ts                 # hằng số TKB/PPCT/import
  schemas/date-only.schema.ts           # dateOnlySchema
  schemas/holiday.schema.ts             # create/update ngày nghỉ
  schemas/timetable-slot.schema.ts      # create/update slot
  schemas/ppct.schema.ts                # item + import commit
  schemas/lesson-log.schema.ts          # patch log + recalculate body
  schemas/school-config.schema.ts       # (sửa) + saturdayIsSchoolDay
apps/api/src/
  common/utils/date.ts                  # (sửa) todayDateOnlyVN, toVnDayOfWeek, formatDateOnly, resolveWeekStart
  common/utils/clock.ts                 # Clock (giờ giả lập được)
  common/utils/transaction.ts           # runInTransaction
  database/schemas/{holiday,timetable-slot,ppct-item,lesson-log}.schema.ts
  database/database.module.ts           # (sửa) đăng ký 4 model
  lesson-logs/engine/lesson-schedule.ts # engine THUẦN
  lesson-logs/lesson-log-engine.service.ts
  lesson-logs/lesson-logs.{module,service,controller}.ts, teacher-lesson-logs.controller.ts
  holidays/calendar-stats.ts, holidays.{module,controller,service}.ts
  timetable-slots/timetable-slots.{module,controller,service}.ts (+ TimetableMeController)
  ppct/ppct.{module,controller,service}.ts, ppct-import.ts
apps/api/test/phase3-fixtures.ts        # seed trực tiếp DB + fake clock (Task 5)
apps/api/test/phase3-test-app.ts        # dựng app HTTP + helper đăng ký/tạo lớp/nhận môn (Task 7)
```

**Thứ tự & phụ thuộc (cho orchestrator):** Task 1 → 2 → 3 → 4 → 5 → 6 → 7 tuần tự (hạ tầng). Sau Task 7: Task 8, 9, 11 độc lập nhau (chạy song song được); Task 10 sau 9; Task 12 sau 8 + 11; Task 13, 14 sau tất cả; Task 15 cuối. File dùng chung duy nhất giữa các nhóm song song là `app.module.ts` (mỗi task thêm đúng 1 dòng import) — gộp tuần tự hoặc tự xử lý conflict.

---

### Task 1: `packages/shared` — hằng số + zod schema Phase 3

**Files:**
- Create: `packages/shared/src/constants/schedule.ts`
- Create: `packages/shared/src/schemas/{date-only,holiday,timetable-slot,ppct,lesson-log}.schema.ts` + `*.schema.test.ts` cùng thư mục
- Modify: `packages/shared/src/schemas/school-config.schema.ts` (+ test), `packages/shared/src/index.ts`

**Interfaces:**
- Produces (dùng ở Task 2–12): `TIMETABLE_DAYS_OF_WEEK = [2,3,4,5,6,7] as const`, `MAX_PERIODS_PER_DAY = 10`, `MAX_PPCT_WEEK = 60`, `MAX_PPCT_PERIOD_COUNT = 10`, `MAX_PPCT_IMPORT_ROWS = 500`, `PPCT_IMPORT_HEADERS = ['Tuần','Bài học','Số tiết','Tiết thứ','Yêu cầu cần đạt','Ghi chú'] as const`.
  `dateOnlySchema` (string → `Date` 00:00 UTC). `holidayTypeEnum`/`HolidayType`, `createHolidaySchema`/`CreateHolidayInput` (`{schoolYearId, startDate, endDate, type, name}`), `updateHolidaySchema`/`UpdateHolidayInput` (mọi field tuỳ chọn, KHÔNG có `schoolYearId`). `createTimetableSlotSchema`/`CreateTimetableSlotInput` (`{dayOfWeek, period, effectiveFrom, effectiveTo?: Date|null}`), `updateTimetableSlotSchema`/`UpdateTimetableSlotInput`. `createPpctItemSchema`/`CreatePpctItemInput` (`{week, periodLabel, title, periodCount, requirement, note?}`), `updatePpctItemSchema`/`UpdatePpctItemInput`, `ppctImportCommitSchema`/`PpctImportCommitInput` (`{rows: CreatePpctItemInput[]}`). `updateLessonLogSchema`/`UpdateLessonLogInput` (`{date?: Date, done?: boolean}`), `recalculateLessonLogsSchema`/`RecalculateLessonLogsInput` (`{fromDate?: Date}`). `UpdateSchoolConfigInput` thêm `saturdayIsSchoolDay?: boolean`.

- [ ] **Step 1: Viết test fail** (mỗi file test cạnh schema). Các assertion bắt buộc:
  - `date-only`: `dateOnlySchema.parse('2026-01-19').toISOString() === '2026-01-19T00:00:00.000Z'`; `it.each(['2026-02-30','19/01/2026','2026-01-19T20:00:00+07:00',''])` → `safeParse` fail, `issues[0].code === 'custom'`, `issues[0].message === 'Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd'`.
  - `holiday`: `endDate < startDate` fail với message `Ngày kết thúc không được trước ngày bắt đầu` (path `endDate`); cùng ngày hợp lệ; `type: 'TET'` fail; `name: '  '` fail; `updateHolidaySchema.parse({ type: 'LE' })` ra đúng `{ type: 'LE' }` và bỏ `schoolYearId` nếu gửi kèm.
  - `timetable-slot`: `dayOfWeek` 1 và 8 fail, 2 và 7 ok; `period` 0 và 11 fail, 1 và 10 ok; `effectiveTo: null` ok, bỏ trống ok; `effectiveTo < effectiveFrom` fail với message `Ngày kết thúc hiệu lực không được trước ngày bắt đầu hiệu lực`.
  - `ppct`: `periodCount` 0 và 11 fail; `week` 0 và 61 fail; `periodLabel` `'  TC3 '` → `'TC3'`, `'15-16'` ok, 21 ký tự fail; `requirement` bỏ trống → `''`; **`updatePpctItemSchema.parse({ title: 'x' })` toEqual `{ title: 'x' }`** (partial không được chèn lại default `requirement: ''` làm PATCH xóa mất dữ liệu); `ppctImportCommitSchema` `rows: []` fail, 501 dòng fail.
  - `lesson-log`: `updateLessonLogSchema.safeParse({})` fail với message `Cần gửi ít nhất một trong hai trường: date hoặc done`; `{done:false}` ok; `{date:'2026-01-12'}` ok; `recalculateLessonLogsSchema.parse({})` ok.
  - `school-config`: `{ saturdayIsSchoolDay: true }` ok, `{ saturdayIsSchoolDay: 'yes' }` fail.
- [ ] **Step 2: Chạy** `pnpm --filter @so-chu-nhiem/shared run test` → FAIL (`Cannot find module './date-only.schema'` …).
- [ ] **Step 3: Implement** theo Interfaces. `dateOnlySchema` = `z.string().transform((value, ctx) => …)`: regex `^\d{4}-\d{2}-\d{2}$` + chặn ngày "lăn" (so lại y/m/d sau `Date.UTC`), lỗi thì `ctx.addIssue({ code: z.ZodIssueCode.custom, message })` rồi `return z.NEVER`. Ngày nghỉ/slot: dựng bằng `z.object({...}).refine(...)` cho create; update = object bỏ `schoolYearId` + `.partial()` (+ refine chỉ khi cả hai ngày cùng có mặt). Export hết trong `index.ts`.
- [ ] **Step 4: Chạy V-SHARED** → PASS (lệnh `build` ở đây cũng cập nhật `dist` cho `api`).
- [ ] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): add Phase 3 zod schemas (holiday, timetable slot, PPCT, lesson log) and saturdayIsSchoolDay config" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `apps/api` — tiện ích ngày VN + `Clock` + `runInTransaction`

**Files:**
- Modify: `apps/api/src/common/utils/date.ts`, `apps/api/src/common/utils/date.spec.ts`
- Create: `apps/api/src/common/utils/clock.ts`, `clock.spec.ts`, `transaction.ts`, `transaction.e2e.spec.ts`

**Interfaces:**
- Consumes: `parseDateOnly`, `getIsoWeekStart`, `addDays` (đã có).
- Produces: `todayDateOnlyVN(now?: Date): Date` (00:00 UTC của ngày lịch theo giờ VN); `toVnDayOfWeek(date: Date): number` (Thứ Hai=2 … Thứ Bảy=7, Chủ Nhật=1, theo `getUTCDay()`); `formatDateOnly(date: Date): string` (`yyyy-mm-dd` từ phần UTC); `maxDate(a: Date, b: Date): Date`, `minDate(a: Date, b: Date): Date`; `resolveWeekStart(raw: string | undefined, now: Date): Date` (raw rỗng → Thứ Hai của tuần chứa `todayDateOnlyVN(now)`; có raw → `getIsoWeekStart(parseDateOnly(raw))`; sai định dạng → 400 qua `parseDateOnly`). `@Injectable() class Clock { now(): Date }`. `runInTransaction<T>(connection: Connection, fn: (session: ClientSession) => Promise<T>): Promise<T>`.

- [ ] **Step 1: Viết test fail**
  - `date.spec.ts`: `todayDateOnlyVN(new Date('2026-01-11T18:00:00Z'))` → `2026-01-12T00:00:00.000Z` (01:00 sáng Thứ Hai VN); `'2026-01-12T16:59:59Z'` → `2026-01-12`; `'2026-01-12T17:00:00Z'` → `2026-01-13`. `toVnDayOfWeek`: `2026-01-05`→2, `2026-01-10`→7, `2026-01-11`→1. `formatDateOnly(new Date('2026-01-05T00:00:00Z'))==='2026-01-05'`. `resolveWeekStart(undefined, new Date('2026-01-11T18:00:00Z'))` → `2026-01-12` (không lùi về tuần trước); `resolveWeekStart('2026-01-14', now)` → `2026-01-12`; `resolveWeekStart('2026-01-18', now)` → `2026-01-12` (Chủ Nhật thuộc tuần đó); `resolveWeekStart('2026-02-30', now)` ném `BadRequestException` message `Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd`.
  - `clock.spec.ts`: `new Clock().now()` cách `Date.now()` < 1000ms.
  - `transaction.e2e.spec.ts` (replica set, `buildTestMongoUri('transaction_helper_e2e')`, collection tạm qua `connection.collection('tmp')`): callback trả giá trị thì `runInTransaction` trả đúng giá trị và dữ liệu được commit; callback `throw` sau khi insert thì lỗi được ném lại và collection rỗng (rollback).
- [ ] **Step 2: Chạy** `pnpm --filter api run test -- date.spec clock.spec transaction` → FAIL.
- [ ] **Step 3: Implement** như Interfaces. `runInTransaction`: `startSession` → `withTransaction`, giá trị trả về gán vào biến ngoài MỖI lần chạy callback (callback có thể bị retry) → `endSession` trong `finally`.
- [ ] **Step 4: Chạy V-API** → PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/utils
git commit -m "feat(api): add VN date helpers, Clock provider and runInTransaction helper" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `apps/api` — schema Mongoose Phase 3

**Files:**
- Create: `apps/api/src/database/schemas/{holiday,timetable-slot,ppct-item,lesson-log}.schema.ts`, `lesson-plan.schema.spec.ts`
- Modify: `apps/api/src/database/schemas/school-config.schema.ts`, `apps/api/src/database/database.module.ts`

**Interfaces:**
- Produces: classes `Holiday`, `TimetableSlot`, `PpctItem`, `LessonLog` (+ `*Schema`) đúng spec 4.2: `Holiday {schoolYearId, startDate, endDate, type: 'LE'|'DOT_XUAT'|'KHAC', name}` index `{schoolYearId:1,startDate:1}`; `TimetableSlot {positionId, dayOfWeek, period, effectiveFrom, effectiveTo: Date|null (default null)}` index `{positionId:1,dayOfWeek:1,period:1}`; `PpctItem {positionId, order, week, periodLabel, title, periodCount (default 1), requirement (default ''), note?}` unique `{positionId:1,order:1}`; `LessonLog {positionId, ppctItemId, date, isManuallyAdjusted (default false), done (default false)}` unique `{positionId:1,ppctItemId:1}` + `{positionId:1,date:1}`. `SchoolConfig.saturdayIsSchoolDay: boolean` (default `false`). Cả 4 model đăng ký trong `DatabaseModule.forFeature`.

- [ ] **Step 1: Viết test fail** `lesson-plan.schema.spec.ts` (thuần schema, không DB): mỗi field ref (`schoolYearId`, `positionId`, `ppctItemId`) có `Schema.path(name).instance === 'ObjectId'`; `HolidaySchema.indexes()` / `TimetableSlotSchema.indexes()` / `PpctItemSchema.indexes()` / `LessonLogSchema.indexes()` chứa đúng các index trên (unique với PPCT `(positionId, order)` và log `(positionId, ppctItemId)`); `new (model)({...}).validateSync()` báo lỗi khi `Holiday.type = 'TET'`; default `done === false`, `isManuallyAdjusted === false`, `effectiveTo === null`, `requirement === ''`; `new SchoolConfigModel({}).saturdayIsSchoolDay === false` (document cũ thiếu field vẫn đọc ra `false`).
- [ ] **Step 2: Chạy** `pnpm --filter api run test -- lesson-plan.schema` → FAIL (module chưa có).
- [ ] **Step 3: Implement** 4 schema theo mẫu `attendance-record.schema.ts` (`timestamps: true`, `MongooseSchema.Types.ObjectId`); thêm field vào `SchoolConfig`; đăng ký trong `DatabaseModule`.
- [ ] **Step 4: Chạy V-API** → PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/api/src/database
git commit -m "feat(api): add Holiday, TimetableSlot, PpctItem, LessonLog schemas and SchoolConfig.saturdayIsSchoolDay" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Engine THUẦN `lesson-schedule.ts` (≥12 kịch bản, không DB)

**Files:**
- Create: `apps/api/src/lesson-logs/engine/lesson-schedule.ts`, `lesson-schedule.spec.ts`

**Interfaces:**
- Consumes: `toVnDayOfWeek`, `addDays`, `formatDateOnly` (Task 2).
- Produces (Task 5, 11 dùng đúng tên/chữ ký này):

```ts
export interface Cell { date: Date; period: number }
export interface ScheduleSlot { dayOfWeek: number; period: number; effectiveFrom: Date; effectiveTo: Date | null }
export interface ScheduleHoliday { startDate: Date; endDate: Date }
export interface SchedulePpctItem { id: string; order: number; periodCount: number }
export interface KeptLog { ppctItemId: string; date: Date }
export interface ScheduleInput { fromDate: Date; yearEnd: Date; slots: ScheduleSlot[]; holidays: ScheduleHoliday[]; ppctItems: SchedulePpctItem[]; keptLogs: KeptLog[] }
export interface ScheduledLesson { ppctItemId: string; date: Date }
export function buildCells(args: { slots: ScheduleSlot[]; holidays: ScheduleHoliday[]; from: Date; to: Date }): Cell[]
export function reserveKeptLogs(cells: Cell[], keptLogs: KeptLog[], ppctItems: SchedulePpctItem[]): { freeCells: Cell[]; placements: Map<string, Cell> }
export function computeLessonSchedule(input: ScheduleInput): ScheduledLesson[]   // CHỈ các mục mới cần xếp, theo `order` tăng dần
```

Thuật toán (quyết định 1–3 ở trên):
- `buildCells`: duyệt từng ngày `from..to` (gồm cả hai đầu), bỏ ngày thuộc ngày nghỉ (`startDate <= d <= endDate`), với mỗi slot có `dayOfWeek === toVnDayOfWeek(d)` và `effectiveFrom <= d <= (effectiveTo ?? ∞)` lấy ô `(d, period)` (khử trùng `(d, period)`); kết quả sắp `date` rồi `period` tăng dần.
- `reserveKeptLogs`: sắp log theo `(date, order của mục)`; mỗi log lấy `periodCount` ô chưa bị chiếm đầu tiên có `date >= log.date` (thiếu ô thì lấy phần có); `placements` = ô đầu tiên được chiếm của mỗi mục; bỏ qua log của mục không có trong `ppctItems`.
- `computeLessonSchedule`: `cells = buildCells(fromDate..yearEnd)`; chỉ truyền cho `reserveKeptLogs` các log có `date >= fromDate`; tập "đã xếp" = `ppctItemId` của MỌI `keptLogs` (kể cả `date < fromDate`); các mục còn lại sắp theo `order`, mỗi mục lấy `periodCount` ô tự do kế tiếp (con trỏ chạy tới), `date` = ô đầu; không đủ ô → dừng hẳn.

- [ ] **Step 1: Viết test fail** `lesson-schedule.spec.ts`. Fixture dùng chung:

```ts
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const slot = (dayOfWeek: number, period: number, from = '2026-01-05', to: string | null = null) =>
  ({ dayOfWeek, period, effectiveFrom: d(from), effectiveTo: to ? d(to) : null });
const item = (k: number, periodCount = 1) => ({ id: `i${k}`, order: k, periodCount });
const items = (n: number) => Array.from({ length: n }, (_, i) => item(i + 1));
const MON_THU = [slot(2, 1), slot(5, 3)]; // 2 tiết/tuần: Thứ Hai tiết 1, Thứ Năm tiết 3 (2026-01-05 là Thứ Hai)
const run = (over: Partial<ScheduleInput> = {}) => computeLessonSchedule({
  fromDate: d('2026-01-05'), yearEnd: d('2026-05-31'), slots: MON_THU, holidays: [], ppctItems: items(5), keptLogs: [], ...over });
const out = (r: ScheduledLesson[]) => r.map((x) => `${x.ppctItemId}@${formatDateOnly(x.date)}`);
```

  12 kịch bản của spec 4.6 — expected chính xác (kịch bản 8 và 11 được kiểm lại với `periodLabel`/`week`/cờ `done` thật ở Task 5, vì engine thuần không biết các trường đó):
  1. Rải cơ bản → `['i1@2026-01-05','i2@2026-01-08','i3@2026-01-12','i4@2026-01-15','i5@2026-01-19']`.
  2. Nghỉ giữa tuần: `holidays:[{2026-01-08..2026-01-08}]` → `['i1@2026-01-05','i2@2026-01-12','i3@2026-01-15','i4@2026-01-19','i5@2026-01-22']`.
  3. Nghỉ cả tuần `2026-01-12..2026-01-18` → `['i1@2026-01-05','i2@2026-01-08','i3@2026-01-19','i4@2026-01-22','i5@2026-01-26']`.
  4. Thêm ngày nghỉ sau khi đã rải: `fromDate 2026-01-15`, holiday `2026-01-15`, `keptLogs` = i1@01-05, i2@01-08, i3@01-12 → `['i4@2026-01-19','i5@2026-01-22']` (i1–i3 không xuất hiện).
  5. Đổi TKB: `slots:[slot(2,1,'2026-01-05','2026-01-18'), slot(3,2,'2026-01-19')]`, `fromDate 2026-01-19`, `items(4)`, kept i1@01-05, i2@01-12 → `['i3@2026-01-20','i4@2026-01-27']`.
  6. Số tiết/tuần đổi theo giai đoạn: 2 tiết/tuần (`slot(2,1,'2026-01-05','2026-01-18')`, `slot(5,3,'2026-01-05','2026-01-18')`) rồi 3 tiết/tuần (`slot(2,1,'2026-01-19')`, `slot(4,2,'2026-01-19')`, `slot(6,4,'2026-01-19')`), `items(8)` → `['i1@2026-01-05','i2@2026-01-08','i3@2026-01-12','i4@2026-01-15','i5@2026-01-19','i6@2026-01-21','i7@2026-01-23','i8@2026-01-26']`.
  7. TC xen kẽ (`1,2,TC1,3`): truyền mảng đảo `[item(4),item(3),item(1),item(2)]` → `['i1@2026-01-05','i2@2026-01-08','i3@2026-01-12','i4@2026-01-15']` (chỉ `order` quyết định, không phải thứ tự mảng).
  8. CĐ xen kẽ: `ppctItems: [{id:'k1',order:1,periodCount:1},{id:'cd1',order:2,periodCount:1},{id:'cd2',order:3,periodCount:1},{id:'k2',order:4,periodCount:1}]` → `['k1@2026-01-05','cd1@2026-01-08','cd2@2026-01-12','k2@2026-01-15']` (chỉ `order`/`periodCount` được đọc, nhãn trong `id` không có nghĩa gì với thuật toán).
  9. `periodCount=2`: `[item(1),item(2,2),item(3)]` → `['i1@2026-01-05','i2@2026-01-08','i3@2026-01-15']` (i2 chiếm 01-08 và 01-12, tràn sang ngày kế); cùng ngày: `slots:[slot(2,1),slot(2,2)]`, `[item(1,2),item(2)]` → `['i1@2026-01-05','i2@2026-01-12']`.
  10. Log khóa tay: kept `[{ppctItemId:'i2', date:d('2026-01-12')}]`, `items(4)` → `['i1@2026-01-05','i3@2026-01-08','i4@2026-01-15']`.
  11. Log khóa do `done` (cùng dạng `KeptLog` với kịch bản 10, mục thứ tự nhỏ nhất bị khóa ở ô SAU): `items(3)`, kept `[{ppctItemId:'i1', date:d('2026-01-08')}]` → `['i2@2026-01-05','i3@2026-01-12']` (i1 không bị dời; các mục sau lấp ô trống phía trước nó).
  12. Hết ô: `yearEnd 2026-01-19`, `items(7)` → chỉ `i1…i5` (`@01-05,01-08,01-12,01-15,01-19`); `yearEnd 2026-01-15`, `[item(1),item(2),item(3),item(4,2),item(5)]` → `['i1@2026-01-05','i2@2026-01-08','i3@2026-01-12']` (i4 cần 2 ô nhưng chỉ còn 1 nên dừng; i5 KHÔNG được xếp dù còn 1 ô).
  Bổ sung: (13) slot Thứ Bảy `slot(7,1)`, `items(2)` → `['i1@2026-01-10','i2@2026-01-17']`; (14) `buildCells` với slot Thứ Hai–Thứ Bảy tiết 1 từ `2026-01-05` đến `2026-01-18` → 12 ô và không ô nào rơi vào Chủ Nhật; (15) log khóa nằm đúng ngày nghỉ: holiday `2026-01-08`, kept `{i1, 2026-01-08}`, `items(3)` → `['i2@2026-01-05','i3@2026-01-15']` (i1 chiếm ô đầu tiên sau đó = 01-12); (16) `fromDate > yearEnd` → `[]`; không slot → `[]`; (17) `effectiveTo` bao gồm cả ngày cuối: `slot(2,1,'2026-01-05','2026-01-12')`, `items(3)` → `['i1@2026-01-05','i2@2026-01-12']`; (18) `reserveKeptLogs`: ô 5 ngày (01-05…01-19) + kept i2@01-12 → `placements.get('i2').date` = 01-12 và `freeCells.length === 4`; (19) hàm không mutate input (đóng băng `Object.freeze` các mảng đầu vào) và chạy 2 lần cho kết quả bằng nhau.
- [ ] **Step 2: Chạy** `pnpm --filter api run test -- lesson-schedule` → FAIL (`Cannot find module './lesson-schedule'`).
- [ ] **Step 3: Implement** `lesson-schedule.ts` theo mô tả thuật toán ở trên (hàm thuần, không import Nest/Mongoose).
- [ ] **Step 4: Chạy** `pnpm --filter api run test -- lesson-schedule` → PASS; rồi V-API.
- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lesson-logs/engine
git commit -m "feat(api): add pure lesson-schedule engine (buildCells, reserveKeptLogs, computeLessonSchedule)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `LessonLogEngineService` (bọc DB + transaction) + fixture test

**Files:**
- Create: `apps/api/src/lesson-logs/lesson-log-engine.service.ts`, `lesson-log-engine.e2e.spec.ts`, `lesson-logs.module.ts`
- Create: `apps/api/test/phase3-fixtures.ts`
- Modify: `apps/api/src/app.module.ts` (thêm `LessonLogsModule`)

**Interfaces:**
- Consumes: `computeLessonSchedule`, `buildCells`, `reserveKeptLogs` (Task 4); `runInTransaction`, `Clock`, `todayDateOnlyVN`, `maxDate`, `minDate` (Task 2); 4 model Task 3.
- Produces:

```ts
@Injectable() export class LessonLogEngineService {
  recalculate(positionId: string, fromDate: Date, session?: ClientSession): Promise<{ scheduled: number }>
  recalculateWithDefaultFrom(positionId: string, session?: ClientSession): Promise<{ scheduled: number }>   // quyết định 6
  recalculateSchoolYear(schoolYearId: string, fromDate: Date, session: ClientSession): Promise<{ positions: number; scheduled: number }>
  assertCanMoveLog(positionId: string, ppctItemId: string, newDate: Date, session: ClientSession): Promise<void>  // 400/409 theo bảng lỗi
}
```
  `LessonLogsModule` (`imports: [DatabaseModule]`; providers `Clock`, `LessonLogEngineService`, `PositionOwnerGuard`; exports `Clock`, `LessonLogEngineService`). `phase3-fixtures.ts` xuất: `PHASE3_SCHEMAS` (mảng `ModelDefinition` cho `MongooseModule.forFeature`: toàn bộ schema hiện có + 4 mới), `getPhase3Models(moduleRef)` → `{ user, schoolYear, schoolConfig, klass, position, student, holiday, timetableSlot, ppctItem, lessonLog }`, `d(s)`, `createFixedClock(iso): { now(): Date; set(iso: string): void }`, `seedSchoolYear(models, {name,start,end,isCurrent?})`, `seedSubjectPosition(models, {schoolYearId, className, subject, holderId?}) → {classId, positionId}`, `seedSlots(models, positionId, rows: Array<{dayOfWeek,period,from?,to?}>)` (`from` mặc định `2026-01-05`), `seedPpct(models, positionId, count, {periodCount?}) → string[]` (id theo `order`).

Thuật toán `recalculate`: (không truyền session thì tự `runInTransaction`) nạp position → class → school year (404 `Không tìm thấy năm học` nếu thiếu); `from = maxDate(fromDate, year.startDate)`; nạp slot của position, ngày nghỉ `{schoolYearId, endDate >= from}`, PPCT, và log được giữ = log của position có `date < from` HOẶC `isManuallyAdjusted` HOẶC `done`; chạy `computeLessonSchedule`; `deleteMany` log chưa khóa `date >= from` có `ppctItemId` không nằm trong kết quả; `bulkWrite` upsert `updateOne({positionId, ppctItemId}, {$set:{date}, $setOnInsert:{isManuallyAdjusted:false, done:false}}, upsert)` (bỏ qua khi kết quả rỗng). `recalculateWithDefaultFrom`: position chưa có log nào → `year.startDate`, ngược lại `todayDateOnlyVN(clock.now())`. `recalculateSchoolYear`: các position (mọi lớp thuộc `schoolYearId`) có ≥1 `PpctItem` → gọi `recalculate` tuần tự cùng session. `assertCanMoveLog`: không có ô nào ở `newDate` (`buildCells` 1 ngày, đã trừ ngày nghỉ) → 400 `Ngày này không có tiết của môn`; dựng ô cả năm học, `reserveKeptLogs` với các log khóa KHÁC (mục ≠ `ppctItemId`), không còn ô tự do nào có `date === newDate` → 409 `Ngày này đã có buổi học khác, không thể chuyển vào`.

- [ ] **Step 1: Viết test fail** `lesson-log-engine.e2e.spec.ts` (module Nest tối giản: `MongooseModule.forRoot(buildTestMongoUri('lesson_log_engine_e2e'))` + `forFeature(PHASE3_SCHEMAS)` + `LessonLogEngineService` + `{ provide: Clock, useValue: createFixedClock('2026-01-14T03:00:00Z') }`; năm học `2025-09-05..2026-05-31`; slot Thứ Hai tiết 1 + Thứ Năm tiết 3 từ `2026-01-05`):
  - (a) 5 mục → `recalculate(positionId, d('2025-09-05'))` trả `{scheduled:5}`, 5 log ngày `01-05, 01-08, 01-12, 01-15, 01-19`, mặc định `done=false`, `isManuallyAdjusted=false`.
  - (b) **idempotent**: chạy lần 2 → cùng `_id` và cùng ngày cho cả 5 log.
  - (c) **kịch bản 8**: 4 mục `periodLabel` `['1','CĐ1','CĐ2','2']`, `week` `[40,1,30,2]` → ngày chỉ theo `order` (`01-05, 01-08, 01-12, 01-15`).
  - (d) **kịch bản 11 (`done` bị khóa)**: 3 mục (`01-05, 01-08, 01-12`), đánh `done=true` cho mục 2, thêm ngày nghỉ `2026-01-05`, `recalculate(…, d('2026-01-05'))` → mục 2 vẫn `01-08` (cùng `_id`), mục 1 → `01-12`, mục 3 → `01-15`.
  - (e) **kịch bản 10 (khóa tay)**: `isManuallyAdjusted=true` + `date=2026-01-12` cho mục 2 của 4 mục → sau tính lại: m1 `01-05`, m2 `01-12`, m3 `01-08`, m4 `01-15`.
  - (f) **quá khứ bất biến**: sau (a), đổi slot (xóa slot Thứ Năm) rồi `recalculate` từ `2026-01-15` → log có `date < 01-15` giữ nguyên `_id`/ngày (kể cả chưa khóa); log từ `01-15` trở đi xếp lại theo slot mới; không lỗi unique.
  - (g) `recalculateWithDefaultFrom`: position chưa có log, Clock = `2026-01-14` → vẫn ra log từ `01-05` (rơi về đầu năm học); đã có log và thêm mục 6 → log ở `01-05/01-08/01-12` (trước hôm nay) giữ nguyên, mục 6 vào `01-22`.
  - (h) PPCT có nhưng không có slot → `{scheduled:0}`, không throw; position không có PPCT cũng không throw; PPCT dài hơn số ô (đặt `endDate` năm học `2026-01-12`, 5 mục) → chỉ 3 log, không lỗi.
  - (i) **rollback**: `endDate` năm học = `2026-01-12` (mục 4, 5 sẽ mất chỗ), `jest.spyOn(lessonLogModel, 'bulkWrite').mockRejectedValueOnce(new Error('boom'))` → `recalculate` reject và 5 log cũ còn nguyên (lệnh `deleteMany` đã rollback).
  - (j) `recalculateSchoolYear` chỉ động tới position có PPCT thuộc lớp của năm học đó (position của năm học khác không đổi), trả `{positions, scheduled}` đúng.
  - (k) `assertCanMoveLog`: đích là ngày nghỉ → 400 `Ngày này không có tiết của môn`; đích là Thứ Ba (không slot) → 400 cùng message; đích `2026-01-12` đã bị log khóa khác chiếm hết ô duy nhất → 409 `Ngày này đã có buổi học khác, không thể chuyển vào`; đích hợp lệ và trống → resolve.
- [ ] **Step 2: Chạy** `pnpm --filter api run test -- lesson-log-engine` → FAIL.
- [ ] **Step 3: Implement** service + module + fixtures theo Interfaces; thêm `LessonLogsModule` vào `AppModule`.
- [ ] **Step 4: Chạy V-API** → PASS (gồm `app.module.e2e.spec.ts` xác nhận DI graph thật).
- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lesson-logs apps/api/src/app.module.ts apps/api/test/phase3-fixtures.ts
git commit -m "feat(api): add LessonLogEngineService with transactional recalculate" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Thống kê lịch năm học THUẦN `calendar-stats.ts`

**Files:**
- Create: `apps/api/src/holidays/calendar-stats.ts`, `calendar-stats.spec.ts`

**Interfaces:**
- Consumes: `toVnDayOfWeek`, `addDays`, `maxDate`, `minDate` (Task 2).
- Produces:

```ts
export interface CalendarStatsInput {
  yearStart: Date; yearEnd: Date; asOf: Date; saturdayIsSchoolDay: boolean;
  holidays: Array<{ type: 'LE' | 'DOT_XUAT' | 'KHAC'; startDate: Date; endDate: Date }>;
}
export interface CalendarStats { totalHolidayDays: number; leHolidayDays: number; dotXuatHolidayDays: number; remainingTeachingDays: number }
export function computeCalendarStats(input: CalendarStatsInput): CalendarStats
```

- [ ] **Step 1: Viết test fail**. Năm học nhỏ `2026-01-05` (Thứ Hai) … `2026-01-18` (Chủ Nhật): 10 ngày Thứ Hai–Thứ Sáu, 2 Thứ Bảy (`01-10`, `01-17`), 2 Chủ Nhật; `asOf = 2026-01-05` trừ khi nêu khác:
  - LE `01-08..01-09` + DOT_XUAT `01-12..01-13`: `{total:4, le:2, dotXuat:2, remaining:6}` với `saturdayIsSchoolDay=false`; `remaining:8` khi `true`.
  - **Chồng nhau**: LE `01-08..01-10` + DOT_XUAT `01-09..01-11` → `total:4` (hợp `01-08..01-11`, gồm cả Chủ Nhật `01-11`), `le:3`, `dotXuat:3`; `remaining:8` (Thứ Bảy tắt: trừ Thứ Năm 8 và Thứ Sáu 9) / `9` (Thứ Bảy bật: trừ 8, 9, 10).
  - Loại `KHAC` `01-14` chỉ vào `total` (và `remaining`), không vào `le`/`dotXuat`.
  - Ngày nghỉ vượt năm học `01-16..01-25` bị cắt còn `01-16..01-18` → `total:3`.
  - Không có ngày nghỉ: `{0,0,0, remaining:10}` (Thứ Bảy tắt) / `12` (bật); `asOf = 2026-01-12` → `5` / `6`; `asOf` sau `yearEnd` → `remaining:0`; `asOf` trước `yearStart` → tính từ `yearStart`.
- [ ] **Step 2: Chạy** `pnpm --filter api run test -- calendar-stats` → FAIL.
- [ ] **Step 3: Implement** theo quyết định 11 (duyệt từng ngày của năm học, dùng `Set` ngày nghỉ theo từng loại).
- [ ] **Step 4: Chạy V-API** → PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/api/src/holidays/calendar-stats.ts apps/api/src/holidays/calendar-stats.spec.ts
git commit -m "feat(api): add pure calendar stats computation" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `HolidaysModule` (ngày nghỉ + thẻ thống kê) + hạ tầng e2e HTTP

**Files:**
- Create: `apps/api/test/phase3-test-app.ts`
- Create: `apps/api/src/holidays/holidays.{module,controller,service}.ts`, `holidays.e2e.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `LessonLogEngineService.recalculateSchoolYear` (Task 5), `computeCalendarStats` (Task 6), `runInTransaction`, `Clock`, `todayDateOnlyVN`, `parseDateOnly`, `SchoolConfigService.getConfig()` (đã có), `createHolidaySchema`/`updateHolidaySchema` (Task 1).
- Produces: `HolidaysService { listBySchoolYear(schoolYearId: string): Promise<Holiday[]> (sắp theo startDate); create(input: CreateHolidayInput): Promise<Holiday>; update(id: string, input: UpdateHolidayInput): Promise<Holiday>; remove(id: string): Promise<{deleted: true}>; getCalendarStats(schoolYearId: string, asOf?: Date): Promise<CalendarStats> }`. Route (`@Controller()`, class `@UseGuards(JwtAuthGuard, RolesGuard) @Roles('TEACHER','ADMIN')`): `GET school-years/:id/holidays`, `GET school-years/:id/calendar-stats?asOf=`, `POST holidays`, `PATCH holidays/:id`, `DELETE holidays/:id` (3 route ghi `@Roles('ADMIN')`). `HolidaysModule` (`imports: [DatabaseModule, SchoolConfigModule, LessonLogsModule]`).
  `phase3-test-app.ts`: `createPhase3App({ dbName, controllers, providers, now? }): Promise<Phase3App>` dựng module Nest rút gọn (`MongooseModule.forRoot(buildTestMongoUri(dbName))`, `forFeature(PHASE3_SCHEMAS)`, `JwtModule`, `PassportModule`; controllers nền `AuthController, ClassesController, PositionsController, StudentsController`; providers nền `AuthService, JwtStrategy, SchoolYearsService, ClassesService, PositionsService, StudentsService, SchoolConfigService, PositionGuard, PositionOwnerGuard, Reflector` + `{provide: Clock, useValue: fixedClock}`), seed năm học `2025-2026` (`2025-09-05..2026-05-31`, `isCurrent`) và `SchoolConfig {}`, gọi `model.init()` cho mọi model (đợi build index unique); trả (`now` mặc định `'2026-01-04T03:00:00Z'` — Chủ Nhật, trước mọi ô `2026-01-05` của fixture; test nào cần giờ khác gọi `clock.set(iso)`) `{ app, models, clock, schoolYearId, register(username, role?: 'TEACHER'|'ADMIN'|'STUDENT') → {token, userId}, createClass(username, className) → {token, userId, classId, code, homeroomPositionId}, joinSubject(code, token, subject) → positionId, close() }` (ADMIN/STUDENT = đăng ký như giáo viên → `updateOne({username}, {role})` → login lại, theo mẫu `registerAndPromote` hiện có).

- [ ] **Step 1: Viết test fail** `holidays.e2e.spec.ts` (`controllers: [HolidaysController]`, `providers: [HolidaysService, LessonLogEngineService]`):
  - ADMIN `POST /holidays` `{schoolYearId, startDate:'2026-01-08', endDate:'2026-01-08', type:'LE', name:'Nghỉ lễ'}` → 201; `GET /school-years/:id/holidays` trả mảng sắp theo `startDate`; `endDate` < `startDate` → 400 chứa `Ngày kết thúc không được trước ngày bắt đầu`; `schoolYearId` không tồn tại / không phải ObjectId → 404 `Không tìm thấy năm học`; `PATCH` làm `endDate` < `startDate` (chỉ gửi 1 ngày so với giá trị đã lưu) → 400 cùng message; `PATCH`/`DELETE` id lạ → 404 `Không tìm thấy ngày nghỉ`.
  - **Tính lại theo thao tác ghi** (dữ liệu dựng bằng `seedSubjectPosition/seedSlots/seedPpct` 5 mục, Thứ Hai+Thứ Năm, `recalculate` ban đầu → `01-05,01-08,01-12,01-15,01-19`): `POST` ngày nghỉ `01-08` → log đổi thành `01-05,01-12,01-15,01-19,01-22`; `PATCH` ngày nghỉ sang `01-12` → `01-05,01-08,01-15,01-19,01-22`; `DELETE` → trở lại `01-05,01-08,01-12,01-15,01-19`. Position CÓ PPCT của năm học khác không đổi.
  - Ngày nghỉ rơi đúng ngày của log `done=true` → log đó giữ nguyên ngày (Review Focus 4).
  - **Rollback**: `jest.spyOn(app.get(LessonLogEngineService), 'recalculateSchoolYear').mockRejectedValueOnce(new Error('boom'))` → `POST /holidays` trả 500 và `holiday.countDocuments()` không đổi.
  - Thẻ thống kê: tạo thêm `SchoolYear` `{name:'TEST-STATS', 2026-01-05..2026-01-18, isCurrent:false}`; ADMIN tạo LE `01-08..01-09` + DOT_XUAT `01-12..01-13` → `GET .../calendar-stats?asOf=2026-01-05` = `{totalHolidayDays:4, leHolidayDays:2, dotXuatHolidayDays:2, remainingTeachingDays:6}`; `schoolConfigModel.updateOne({}, {saturdayIsSchoolDay:true})` → `remainingTeachingDays:8`; `asOf=2026-02-30` → 400 `Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd`; năm học chưa có ngày nghỉ → toàn 0 (ngoại trừ `remainingTeachingDays`); không truyền `asOf` + Clock `2026-01-11T18:00:00Z` (đã là `2026-01-12` ở VN), năm học `TEST-STATS` với LE `01-08..01-09` + DOT_XUAT `01-12..01-13` → `remainingTeachingDays: 3` (chỉ còn `01-14`, `01-15`, `01-16`; Thứ Bảy tắt).
- [ ] **Step 2: Chạy** `pnpm --filter api run test -- holidays.e2e` → FAIL.
- [ ] **Step 3: Implement** `phase3-test-app.ts`, module/controller/service. Ghi (`create/update/remove`) chạy trong `runInTransaction`: lưu ngày nghỉ rồi `engine.recalculateSchoolYear(String(schoolYearId), fromDate, session)` với `fromDate` theo quyết định 6. Thêm `HolidaysModule` vào `AppModule`.
- [ ] **Step 4: Chạy V-API** → PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/api/src/holidays apps/api/src/app.module.ts apps/api/test/phase3-test-app.ts
git commit -m "feat(api): add HolidaysModule with calendar stats and school-year recalculation" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `TimetableSlotsModule` (TKB do GVBM khai báo)

**Files:**
- Create: `apps/api/src/timetable-slots/timetable-slots.{module,controller,service}.ts`, `timetable-slots.e2e.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `LessonLogEngineService.recalculate`, `runInTransaction`, `ResolvedPosition`, `RequirePositionOwner`, `createTimetableSlotSchema`/`updateTimetableSlotSchema`, `createPhase3App` (Task 7).
- Produces: `TimetableSlotsService { list(positionId: string): Promise<TimetableSlot[]>; create(position: Position, input: CreateTimetableSlotInput): Promise<TimetableSlot>; update(position: Position, slotId: string, input: UpdateTimetableSlotInput): Promise<TimetableSlot>; remove(position: Position, slotId: string): Promise<{deleted: true}> }`. Route `positions/:positionId/timetable-slots` (`@UseGuards(JwtAuthGuard, RolesGuard, PositionOwnerGuard) @Roles('TEACHER','ADMIN')`): `GET` `@RequirePositionOwner('SELF_OR_HOMEROOM')`; `POST`, `PATCH :slotId`, `DELETE :slotId` `@RequirePositionOwner('SELF')`. Mẫu: `attendance.controller.ts`.

Luật: ghi vào position HOMEROOM → 400 (bảng lỗi). Trùng slot: cùng position, cùng `(dayOfWeek, period)`, hiệu lực chồng nhau (`a.from <= b.to(∞) && b.from <= a.to(∞)`, bỏ qua chính slot đang sửa) → 409 `Tiết này đã có trong thời khóa biểu của môn trong khoảng thời gian trùng`; nếu `position.holderId` khác null: các position KHÁC cùng `holderId` có slot trùng `(dayOfWeek, period)` + hiệu lực chồng → 409 `Bạn đã có tiết khác vào thời điểm này` (position vacant bỏ qua kiểm tra này). Kiểm tra + ghi + tính lại cùng 1 transaction. `slotId` phải thuộc `positionId` (`findOne({_id, positionId})`, sai → 404 `Không tìm thấy tiết trong thời khóa biểu`).

- [ ] **Step 1: Viết test fail** `timetable-slots.e2e.spec.ts` (`controllers: [TimetableSlotsController]`, `providers: [TimetableSlotsService, LessonLogEngineService]`; năm học + PPCT 5 mục dựng bằng fixtures):
  - GVBM `POST` `{dayOfWeek:2, period:1, effectiveFrom:'2026-01-05'}` → 201 và log của position được tính lại (mục 1 có `date` `2026-01-05`); `effectiveTo: null` lưu được.
  - Trùng cùng position cùng `(2,1)` hiệu lực chồng → 409 (message cùng-position); `effectiveTo '2026-01-18'` rồi slot mới `effectiveFrom '2026-01-19'` cùng `(2,1)` → 201 (liền kề không chồng).
  - GVBM giữ Toán ở 2 lớp: slot `(3,2)` ở lớp 1 rồi `(3,2)` chồng hiệu lực ở lớp 2 → 409 `Bạn đã có tiết khác vào thời điểm này`; khác `period` → 201; hiệu lực không chồng → 201; sau khi `release` position lớp 1 (`holderId=null`), ghi slot vào position lớp 1 bởi ADMIN không bị chặn bởi kiểm tra "cùng giáo viên".
  - `PATCH` chỉ `effectiveTo` của chính slot không tự báo trùng với chính nó; `PATCH` đổi `dayOfWeek` → tính lại (log đổi ngày); `PATCH` thành slot trùng slot khác → 409.
  - **Đổi TKB** end-to-end: slot Thứ Hai `effectiveTo 2026-01-18` + slot Thứ Ba tiết 2 `effectiveFrom 2026-01-19` → 5 mục: 2 mục đầu trước 01-19 giữ nguyên, các mục sau rơi vào Thứ Ba (`01-20`, `01-27`, …).
  - `DELETE` slot → log tính lại; `DELETE`/`PATCH` slot của position KHÁC qua `/positions/<A>/timetable-slots/<slotId của B>` → 404 và slot của B còn nguyên (Review Focus 1).
  - `slotId` không phải ObjectId → 404; body sai (`dayOfWeek: 1`, `period: 11`) → 400 tiếng Việt; ghi vào position HOMEROOM → 400 `Chỉ vị trí giáo viên bộ môn mới có thời khóa biểu và PPCT`.
  - **Rollback**: `jest.spyOn(engine, 'recalculate').mockRejectedValueOnce(new Error('boom'))` → `POST` trả 500 và `timetableSlot.countDocuments()` không đổi.
  - Position có PPCT nhưng chưa có slot nào: tạo slot đầu tiên không lỗi.
- [ ] **Step 2: Chạy** `pnpm --filter api run test -- timetable-slots` → FAIL.
- [ ] **Step 3: Implement** (kèm `fromDate` tính lại theo quyết định 6) và thêm module vào `AppModule`.
- [ ] **Step 4: Chạy V-API** → PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/api/src/timetable-slots apps/api/src/app.module.ts
git commit -m "feat(api): add TimetableSlotsModule with conflict detection and recalculation" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: `PpctModule` (CRUD)

**Files:**
- Create: `apps/api/src/ppct/ppct.{module,controller,service}.ts`, `ppct.e2e.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `LessonLogEngineService.recalculateWithDefaultFrom`, `runInTransaction`, `createPpctItemSchema`/`updatePpctItemSchema`, `createPhase3App`.
- Produces: `PpctService { list(positionId: string): Promise<PpctItem[]> (order tăng dần); create(position: Position, input: CreatePpctItemInput): Promise<PpctItem> (order = max+1); update(position: Position, itemId: string, input: UpdatePpctItemInput): Promise<PpctItem>; remove(position: Position, itemId: string): Promise<{deleted: true}> (xóa luôn LessonLog của mục) }`. Route `positions/:positionId/ppct`: `GET` `SELF_OR_HOMEROOM`; `POST`, `PATCH :itemId`, `DELETE :itemId` `SELF`. Mọi thao tác ghi: ghi + `engine.recalculateWithDefaultFrom(positionId, session)` trong 1 transaction. Ghi vào HOMEROOM → 400; `itemId` sai/khác position → 404 `Không tìm thấy mục PPCT`.

- [ ] **Step 1: Viết test fail** `ppct.e2e.spec.ts`:
  - GVBM `POST` 5 mục (body `{week:1, periodLabel:'1', title:'Bài 1', periodCount:1, requirement:'…'}`) → 201, `GET` trả `order` 1…5 và (khi đã có slot Thứ Hai/Thứ Năm) log xếp `01-05,01-08,01-12,01-15,01-19` (kiểm bằng `lessonLog` model).
  - **Kịch bản 7/8 qua API**: nhập `1,2,TC1,3` rồi `CĐ1` → ngày theo thứ tự nhập, `periodLabel` và `week` không ảnh hưởng.
  - `PATCH` `periodCount` của mục 2 từ 1 lên 2 → mục 3, 4, 5 lùi 1 ô (mục 2 chiếm 2 ô, `date` vẫn là ô đầu); `PATCH` `{title}` không làm mất `requirement`.
  - `DELETE` mục 2 (kể cả khi log của nó `done=true`) → log mục 2 bị xóa, các mục sau dồn lên, `order` các mục khác không đổi số (không đánh số lại); thêm mục mới sau đó nhận `max(order)+1`.
  - **IDOR**: `/positions/<A>/ppct/<itemId của B>` `PATCH`/`DELETE` → 404, mục của B nguyên vẹn.
  - **Đồng thời**: `Promise.all` 2 `POST` → mỗi response là 201 hoặc 409 (không 500), `order` trong DB không trùng và số mục = số 201.
  - Body sai (`periodCount: 0`, `week: 61`, thiếu `title`) → 400 `Dữ liệu gửi lên không hợp lệ: …`; HOMEROOM → 400 `Chỉ vị trí giáo viên bộ môn mới có thời khóa biểu và PPCT`; `itemId` không phải ObjectId → 404.
  - **Rollback**: `recalculateWithDefaultFrom` bị mock reject → `POST` 500 và `ppctItem.countDocuments()` không đổi.
  - Mục PPCT sửa khi position chưa có slot → 201, không có log, không lỗi.
- [ ] **Step 2: Chạy** `pnpm --filter api run test -- ppct.e2e` → FAIL.
- [ ] **Step 3: Implement** + thêm `PpctModule` vào `AppModule`.
- [ ] **Step 4: Chạy V-API** → PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ppct apps/api/src/app.module.ts
git commit -m "feat(api): add PpctModule (CRUD with recalculation)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Import Excel PPCT (preview + commit)

**Files:**
- Create: `apps/api/src/ppct/ppct-import.ts`, `ppct-import.spec.ts`, `ppct-import.e2e.spec.ts`
- Modify: `apps/api/src/ppct/ppct.controller.ts`, `ppct.service.ts`

**Interfaces:**
- Consumes: Task 9; `ExcelJS` (mẫu `StudentsService.parsePreview`), `PPCT_IMPORT_HEADERS`, `MAX_PPCT_IMPORT_ROWS`, `ppctImportCommitSchema`.
- Produces: `parsePpctWorkbook(buffer: Buffer): Promise<PpctImportPreviewRow[]>` với `PpctImportPreviewRow { rowNumber: number; week: number | null; title: string; periodCount: number | null; periodLabel: string; requirement: string; note: string; errors: string[] }`. Cột: 1 Tuần, 2 Bài học, 3 Số tiết, 4 Tiết thứ, 5 Yêu cầu cần đạt, 6 Ghi chú; bỏ dòng tiêu đề (dòng 1) và dòng trống hoàn toàn. Lỗi từng dòng (message chuẩn): `Tuần phải là số nguyên từ 1 đến 60`, `Bài học không được để trống`, `Bài học quá dài (tối đa 300 ký tự)`, `Số tiết phải là số nguyên từ 1 đến 10`, `Tiết thứ không được để trống`. `PpctService.importCommit(position: Position, rows: CreatePpctItemInput[]): Promise<PpctItem[]>`. Route: `POST positions/:positionId/ppct/import/preview` (`@UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))`, `SELF`, KHÔNG ghi DB) và `POST .../import/commit` (`SELF`, body `ppctImportCommitSchema`; transaction: `insertMany` với `order` liên tiếp sau `max(order)` hiện có + `recalculateWithDefaultFrom`). > 500 dòng dữ liệu → 400 `File có quá nhiều dòng (tối đa 500)`.

- [ ] **Step 1: Viết test fail**
  - `ppct-import.spec.ts` (workbook dựng bằng `exceljs` trong test): 3 dòng hợp lệ → `errors: []`; dòng `Tuần = 'abc'`, `Số tiết = 0`, `Bài học` rỗng, `Tiết thứ` rỗng → đúng từng message ở trên; dòng trống bị bỏ; không phải xlsx → 400 `File không đúng định dạng Excel (.xlsx)`; workbook không sheet → 400 `File Excel không có sheet nào`; 501 dòng → 400.
  - `ppct-import.e2e.spec.ts`: `preview` (supertest `.attach('file', buffer, 'ppct.xlsx')`) trả `{rows}` có dòng lỗi và KHÔNG ghi DB (`ppctItem.countDocuments()` không đổi); không file → 400 `Chưa chọn file để import`; `commit` khi position đã có 2 mục → mục mới nhận `order` 3, 4, …; commit kích hoạt tính lại (log xuất hiện khi có slot); `commit` gồm dòng sai (`periodCount: 0`) → 400 và không lưu dòng nào; HOMEROOM → 400; GVBM môn khác → 403 (chi tiết ở Task 13).
- [ ] **Step 2: Chạy** `pnpm --filter api run test -- ppct-import` → FAIL.
- [ ] **Step 3: Implement** (parser tách file riêng để test không cần HTTP).
- [ ] **Step 4: Chạy V-API** → PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ppct
git commit -m "feat(api): add PPCT Excel import preview/commit" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Sổ báo giảng theo position (đọc, tích `done`, kéo chỉnh tay, recalculate ADMIN)

**Files:**
- Create: `apps/api/src/lesson-logs/lesson-logs.service.ts`, `lesson-logs.controller.ts`, `lesson-logs.e2e.spec.ts`
- Modify: `apps/api/src/lesson-logs/lesson-logs.module.ts` (thêm controller + `LessonLogsService`, export `LessonLogsService`)

**Interfaces:**
- Consumes: `LessonLogEngineService.{assertCanMoveLog, recalculate, recalculateWithDefaultFrom}`, `runInTransaction`, `parseDateOnly`, `updateLessonLogSchema`, `recalculateLessonLogsSchema`, `minDate`.
- Produces: 

```ts
export interface LessonLogView {
  _id: string; positionId: string; ppctItemId: string; date: Date; done: boolean; isManuallyAdjusted: boolean;
  ppctItem: { order: number; week: number; periodLabel: string; title: string; periodCount: number; requirement: string; note?: string } | null;
}
LessonLogsService.listByPosition(positionId: string, range: { from?: Date; to?: Date }): Promise<LessonLogView[]>   // sắp date, order
LessonLogsService.update(positionId: string, logId: string, input: UpdateLessonLogInput): Promise<LessonLogView>
LessonLogsService.recalculate(positionId: string, fromDate?: Date): Promise<{ scheduled: number }>
```
  Route `positions/:positionId/lesson-logs` (`JwtAuthGuard, RolesGuard, PositionOwnerGuard`, `@Roles('TEACHER','ADMIN')`): `GET ?from&to` `SELF_OR_HOMEROOM` (query sai định dạng → 400 qua `parseDateOnly`; `from > to` → 400 `Ngày bắt đầu không được sau ngày kết thúc`); `PATCH :id` `SELF`; `POST recalculate` `@Roles('ADMIN')` + `@HttpCode(200)` (body tuỳ chọn `{fromDate}`; không có → `recalculateWithDefaultFrom`).
  Luật `update` (1 transaction): tìm `{_id, positionId}` (sai → 404 `Không tìm thấy buổi học`); nếu `date` khác ngày hiện tại → `assertCanMoveLog` (400/409) → `log.date = date`, `isManuallyAdjusted = true`; `done` nếu có → ghi; đổi ngày thì `engine.recalculate(positionId, minDate(ngàyCũ, ngàyMới), session)` để dồn lại phần chưa khóa; chỉ đổi `done` thì KHÔNG tính lại.

- [ ] **Step 1: Viết test fail** `lesson-logs.e2e.spec.ts` (`controllers: [LessonLogsController]`, providers `LessonLogsService`, `LessonLogEngineService`; dữ liệu: 5 mục, slot Thứ Hai+Thứ Năm, log `01-05,01-08,01-12,01-15,01-19`):
  - `GET` trả log kèm `ppctItem` đúng, sắp theo ngày; `from=2026-01-08&to=2026-01-15` trả đúng 3 log (gồm cả hai đầu); `from=2026-02-30` → 400 `Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd`; `from=2026-01-15&to=2026-01-08` → 400; không có `from/to` → tất cả.
  - `PATCH {done:true}` → 200, `done` lưu; sau đó thêm ngày nghỉ vào đúng ngày đó rồi tính lại → log vẫn giữ ngày (khóa).
  - `PATCH` log mục 1 `{date:'2026-01-22'}` (Thứ Năm hợp lệ, trống) → 200, `isManuallyAdjusted=true`, và các log chưa khóa dồn lại quanh nó: mục 1 `01-22`, mục 2 `01-05`, mục 3 `01-08`, mục 4 `01-12`, mục 5 `01-15`; `{date:'2026-01-06'}` (Thứ Ba) → 400 `Ngày này không có tiết của môn`; đổi vào một ngày nghỉ đã khai báo → 400 cùng message; với log mục 3 đã `done=true` ở `01-12` (ô duy nhất của ngày đó), đổi log mục 1 vào `01-12` → 409 `Ngày này đã có buổi học khác, không thể chuyển vào`; `{}` → 400 `Cần gửi ít nhất một trong hai trường: date hoặc done`.
  - **IDOR**: `/positions/<A>/lesson-logs/<id của log position B>` `PATCH` → 404 và log B nguyên vẹn; `:id` không phải ObjectId → 404 `Không tìm thấy buổi học`.
  - **Rollback**: `engine.recalculate` bị mock reject khi `PATCH {date}` → 500 và log vẫn ở ngày cũ, `isManuallyAdjusted` vẫn `false`.
  - ADMIN `POST .../recalculate` không body → `{scheduled: n}` và log đã sửa tay vẫn giữ; có `{fromDate:'2026-01-15'}` → chỉ log từ `01-15` được xếp lại; GVBM chủ position gọi → 403.
- [ ] **Step 2: Chạy** `pnpm --filter api run test -- lesson-logs.e2e` → FAIL.
- [ ] **Step 3: Implement** service + controller; `listByPosition` dùng 2 query (logs + PPCT items theo id) rồi ghép, không N+1.
- [ ] **Step 4: Chạy V-API** → PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lesson-logs
git commit -m "feat(api): add lesson-log read/update/recalculate endpoints" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Lưới tuần của giáo viên (`GET /timetable/me`, `GET /lesson-logs/week`)

**Files:**
- Create: `apps/api/src/lesson-logs/teacher-lesson-logs.controller.ts`, `teacher-week-views.e2e.spec.ts`
- Modify: `apps/api/src/lesson-logs/lesson-logs.service.ts`, `lesson-logs.module.ts`, `apps/api/src/timetable-slots/timetable-slots.service.ts`, `timetable-slots.controller.ts` (thêm `TimetableMeController`), `timetable-slots.module.ts`

**Interfaces:**
- Consumes: `resolveWeekStart`, `addDays`, `formatDateOnly`, `Clock` (Task 2); `LessonLogsService.listByPosition`-style mapping (Task 11).
- Produces: `LessonLogsService.listForTeacherWeek(userId: string, weekStart: Date): Promise<TeacherWeekLogView[]>` với `TeacherWeekLogView = LessonLogView & { position: { _id: string; classId: string; className: string; subject: string } }` (chỉ position `SUBJECT` mà `userId` đang giữ; log có `weekStart <= date <= weekStart+6`; sắp theo `date`, rồi `ppctItem.order`). `TimetableSlotsService.getMyWeek(userId: string, weekStart: Date): Promise<{ weekStart: string; weekEnd: string; slots: Array<TimetableSlot & { position: {...như trên} }>; lessonLogs: TeacherWeekLogView[] }>` (slot có hiệu lực giao với tuần: `effectiveFrom <= weekEnd && (effectiveTo == null || effectiveTo >= weekStart)`). Route: `GET lesson-logs/week?weekStart=` và `GET timetable/me?weekStart=` — `@Roles('TEACHER')` (ADMIN 403), `weekStart` qua `resolveWeekStart(raw, clock.now())`.

- [ ] **Step 1: Viết test fail** `teacher-week-views.e2e.spec.ts`:
  - GV X giữ Toán lớp 1 + Văn lớp 2; GV Y giữ Toán lớp 3: `GET /lesson-logs/week?weekStart=2026-01-12` của X chỉ chứa log của position của X (không có position của Y), mỗi phần tử có `position.className/subject`; `weekStart=2026-01-14` (Thứ Tư) cho đúng kết quả của tuần bắt đầu `2026-01-12`.
  - GVCN chỉ giữ HOMEROOM → `lessonLogs: []`/`slots: []` (200, không 404).
  - Không truyền `weekStart` + Clock `2026-01-11T18:00:00Z` → tuần `2026-01-12` (không lùi tuần).
  - `weekStart=2026-02-30` → 400 `Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd`.
  - `/timetable/me`: slot kết thúc (`effectiveTo`) trước tuần bị loại; slot bắt đầu giữa tuần vẫn có mặt; trả `weekStart`/`weekEnd` dạng `yyyy-mm-dd` (`2026-01-12`/`2026-01-18`).
  - Giáo viên chưa giữ vị trí nào → 200 với mảng rỗng.
- [ ] **Step 2: Chạy** `pnpm --filter api run test -- teacher-week-views` → FAIL.
- [ ] **Step 3: Implement**; `TimetableSlotsModule` import `LessonLogsModule` (lấy `LessonLogsService`, `Clock`). Route `lesson-logs/week` đặt trong controller riêng để không đụng `positions/:positionId/lesson-logs`.
- [ ] **Step 4: Chạy V-API** → PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lesson-logs apps/api/src/timetable-slots
git commit -m "feat(api): add teacher week views (timetable/me, lesson-logs/week)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Ma trận phân quyền Phase 3 (từng hàng bảng 4.4)

**Files:**
- Create: `apps/api/src/lesson-logs/phase3-permission-matrix.e2e.spec.ts`

**Interfaces:**
- Consumes: tất cả controller/service Task 7–12 (`createPhase3App` với đủ controller/provider), `register/createClass/joinSubject`.

Nhân vật mỗi test (fixture dựng mới): **GVBM** (giữ Toán lớp A), **GVCN** (GVCN lớp A), **GVBM-khác** (giữ Ngữ văn lớp A), **GV-lớp-khác** (GVCN lớp B), **ADMIN**, **STUDENT** (role đổi trực tiếp trong DB), **anon** (không token → 401).

- [ ] **Step 1: Viết test fail** — table-driven `it.each` (cột = GVBM / GVCN / GVBM-khác / GV-lớp-khác / ADMIN / STUDENT; anon luôn 401). Mỗi hàng gọi route trên position/ngày nghỉ/slot/mục/log của GVBM ở lớp A:

| Route | GVBM | GVCN | GVBM-khác | GV-lớp-khác | ADMIN | STUDENT |
|---|---|---|---|---|---|---|
| `GET /school-years/:id/holidays`, `GET .../calendar-stats` | 200 | 200 | 200 | 200 | 200 | 403 |
| `POST /holidays`, `PATCH`/`DELETE /holidays/:id` | 403 | 403 | 403 | 403 | 201/200/200 | 403 |
| `GET /positions/:p/timetable-slots`, `GET .../ppct`, `GET .../lesson-logs` | 200 | 200 | 403 | 403 | 200 | 403 |
| `POST`/`PATCH`/`DELETE .../timetable-slots[/:slotId]` | 201/200/200 | 403 | 403 | 403 | 201/200/200 | 403 |
| `POST`/`PATCH`/`DELETE .../ppct[/:itemId]`, `POST .../ppct/import/preview`, `.../import/commit` | 201/200/200/201/201 | 403 | 403 | 403 | 201/200/200/201/201 | 403 |
| `PATCH .../lesson-logs/:id` | 200 | 403 | 403 | 403 | 200 | 403 |
| `POST .../lesson-logs/recalculate` | 403 | 403 | 403 | 403 | 200 | 403 |
| `GET /timetable/me`, `GET /lesson-logs/week` | 200 | 200 | 200 | 200 | **403** | 403 |

  Kiểm thêm ngoài bảng: (i) lần gọi bị 403 KHÔNG làm thay đổi dữ liệu (đếm lại slot/mục/log trước-sau); (ii) `GET /lesson-logs/week` và `/timetable/me` của GVCN không chứa log/slot của position GVBM trong lớp mình (chỉ trả position mình giữ); (iii) giáo viên lớp khác biết đúng `positionId`/`itemId`/`slotId`/`logId` vẫn 403 trên mọi route theo position; (iv) anon → 401 mọi route.
- [ ] **Step 2: Chạy** `pnpm --filter api run test -- phase3-permission-matrix` → kỳ vọng PASS ngay nếu Task 7–12 đúng; hàng nào FAIL = lỗ hổng phân quyền → sửa guard/decorator ở task sở hữu route (không nới test).
- [ ] **Step 3: Chạy V-API** → PASS.
- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lesson-logs/phase3-permission-matrix.e2e.spec.ts
git commit -m "test(api): add Phase 3 permission matrix" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Test hiệu năng (đọc sổ báo giảng cả học kỳ < 2s, tính lại < 5s)

**Files:**
- Create: `apps/api/src/lesson-logs/lesson-logs.perf.e2e.spec.ts`

**Interfaces:**
- Consumes: `createPhase3App`, fixtures seed trực tiếp DB (`insertMany`, không qua HTTP).

- [ ] **Step 1: Viết test** (1 spec, dữ liệu lớn dựng trong `beforeAll`): năm học `2025-09-05..2026-05-31`; 30 lớp × 1 position SUBJECT (cùng 1 giáo viên giữ để dùng `/lesson-logs/week` nếu cần), mỗi position 4 slot/tuần (Thứ Hai tiết 1, Thứ Ba tiết 2, Thứ Năm tiết 3, Thứ Sáu tiết 4, hiệu lực từ `2025-09-08`) và 140 mục PPCT `periodCount=1`; chạy `recalculate` một lần để có ~140 log/position. Đo bằng `performance.now()`:
  - `POST /holidays` bởi ADMIN (nghỉ `2026-01-12..2026-01-18`, tính lại CẢ 30 position trong 1 transaction) hoàn thành **< 5000 ms**, trả 201; kiểm tra log của 1 position đã đổi.
  - `POST /positions/:p/timetable-slots` (tính lại 1 position) **< 5000 ms**.
  - `GET /positions/:p/lesson-logs?from=2025-09-05&to=2026-01-18` (học kỳ I) **< 2000 ms**, trả ≥ 60 log, đã sắp theo ngày.
- [ ] **Step 2: Chạy** `pnpm --filter api run test -- lesson-logs.perf` → PASS. Nếu vượt ngưỡng: tối ưu (nạp PPCT/log bằng 1 query mỗi position, `bulkWrite` thay vì ghi từng bản ghi) — KHÔNG nới ngưỡng của spec.
- [ ] **Step 3: Chạy V-API** → PASS.
- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lesson-logs/lesson-logs.perf.e2e.spec.ts
git commit -m "test(api): add Phase 3 performance test" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Ghi giả định + verify toàn repo + báo cáo

**Files:**
- Modify: `docs/ASSUMPTIONS.md` (thêm vào mục "Phase 3 (backend)")

- [ ] **Step 1: Ghi giả định** — thêm các bullet (ngắn, tiếng Việt) cho quyết định 1–13 ở trên, đặc biệt: log được giữ gồm cả log quá khứ; ô bị log khóa suy ra từ `date`; engine không đọc `saturdayIsSchoolDay`; năm học của engine = năm học của lớp; `fromDate` theo thao tác + ngoại lệ xếp lần đầu; tính lại giữ `_id`; PPCT chỉ thêm cuối/không đổi thứ tự, xóa mục xóa luôn log; giới hạn (`period` 1–10, `periodCount` 1–10, `week` 1–60, import 500 dòng); chỉ position SUBJECT; định nghĩa thẻ thống kê; STUDENT 403 cả `GET holidays`; "hôm nay" tính cố định UTC+7 qua `Clock` chứ không theo giờ máy chủ.
- [ ] **Step 2: Commit docs**

```bash
git add docs/ASSUMPTIONS.md
git commit -m "docs: record Phase 3 backend implementation assumptions" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Verify toàn repo** (không tạo file):

```bash
pnpm install --frozen-lockfile
pnpm run lint
pnpm run build
pnpm run test
```

  Expected: cả 4 lệnh PASS (gồm `app.module.e2e.spec.ts`, bộ test engine thuần ≥12 kịch bản, ma trận phân quyền, test hiệu năng). `git status` sạch.
- [ ] **Step 4: Báo cáo cho người dùng (tiếng Việt)**: những gì đã làm theo từng task, kết quả test/lint, các quyết định ở mục "Quyết định triển khai" và Open Questions còn mở; sau đó DỪNG chờ duyệt (quy trình dự án: không sang Phase 4 / sub-project UI khi chưa được duyệt).

---

## Kết quả review cuối

_(Để trống — điền sau bước Reviewer: Critical/Important đã sửa bằng TDD, Minor/Suggestion ghi lại tại đây.)_

---

## Tổng kết Self-Review

- **Spec coverage:** 3.1.1–5 → toàn plan (1 plan, PPCT theo position Task 9, TKB GVBM tự khai báo Task 8 + ma trận Task 13, không route STUDENT, kéo tay giữ nguyên Task 4/5/11, tính lại đồng bộ trong request ghi Task 7/8/9/10). 3.2 → quyết định 1–13 + ASSUMPTIONS (Task 15). 4.2 schema + `saturdayIsSchoolDay` → Task 3; 4.3 engine → Task 4/5; 4.4 từng hàng route → Task 7–12, từng hàng phân quyền → Task 13; 4.5 lỗi → bảng ở Global Constraints, assert ở Task 5/7/8/11; 4.6: đủ 12 kịch bản thuần (Task 4; số 8, 11 kiểm lại với `periodLabel`/`done` thật ở Task 5), idempotent (5b), Thứ Bảy bật/tắt (6, 7), slot trùng 409 (8), phân quyền (13), hiệu năng (14).
- **Step scan:** mỗi step test nêu tên + assertion/giá trị chính xác; step code nêu chữ ký + file + luật nghiệp vụ không suy ra được từ test; thân hàm chỉ xuất hiện ở mô tả thuật toán engine/`recalculate` (phần duy nhất 1 người cài đặt không tự quyết được).
- **Nhất quán tên/chữ ký:** `recalculate` / `recalculateWithDefaultFrom` / `recalculateSchoolYear` / `assertCanMoveLog` (Task 5) được dùng đúng tên ở Task 7, 8, 9, 10, 11; `LessonLogView` (Task 11) → `TeacherWeekLogView` (Task 12); `createPhase3App` (Task 7) dùng ở Task 8–14; `createFixedClock`/`seed*` (Task 5) dùng ở Task 7–14; `todayDateOnlyVN`/`resolveWeekStart`/`maxDate`/`minDate` (Task 2) dùng ở Task 5, 6, 11, 12.
- **Review Focus:** cả 5 dòng có test cụ thể ở task sở hữu (đã ghi số task cuối mỗi dòng).
- **Tỷ lệ:** code chỉ ở fixture engine (Task 4) và chữ ký; còn lại là chữ ký + test + luật.
