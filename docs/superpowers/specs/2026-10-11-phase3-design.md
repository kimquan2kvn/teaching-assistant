# Phase 3 (backend) — Lịch năm học, PPCT, TKB, Engine khớp tiết, Sổ báo giảng

> **TRẠNG THÁI: ĐÃ DUYỆT (2026-10-11).** Plan: `docs/superpowers/plans/2026-10-11-phase3-backend.md`.
> Giả định mục 3.2 đã được ghi vào `docs/ASSUMPTIONS.md` (mục "Phase 3 (backend)").

## 1. Tình trạng tổng dự án (tính đến 2026-10-11)

Monorepo pnpm: `apps/api` (NestJS+TS), `apps/web` (Next.js+JS), `packages/shared` (zod + hằng số dùng
chung). Quy trình chuẩn của dự án: brainstorm → viết spec (`docs/superpowers/specs/`) → viết plan
(`docs/superpowers/plans/`) → thực thi plan bằng multi-agent (Planner → hạ tầng chung tuần tự → các nhóm
tính năng độc lập chạy song song qua Coder agent → nối điều hướng tuần tự → verify toàn repo → Reviewer
agent trên model mạnh nhất review toàn diff → sửa Critical/Important bằng TDD → ghi Minor/Suggestion vào
mục "Kết quả review cuối" của plan → báo cáo tiếng Việt → chờ duyệt). Agent custom ở `.claude/agents/`:
`orchestrator`, `planner`, `coder`, `reviewer` (không dùng `designer`, theo yêu cầu người dùng).

**Đã hoàn tất và được duyệt** (backend + frontend xen kẽ theo từng sub-project):

| Sub-project | Nội dung | Spec | Plan | Commit cuối |
|---|---|---|---|---|
| Backend Phase 0 | Khởi tạo monorepo, schema, CI, theme | `2026-10-08-phase0-foundation-design.md` | `2026-10-08-phase0-foundation.md` | — |
| Backend Phase 1 (1a+1b) | Auth, Class/Position, hồ sơ học sinh | `2026-10-08-phase1-foundation-design.md` | `phase1a-auth-class-position.md` + `phase1b-student-profiles.md` | — |
| FE sub-project 1 | Nền tảng FE (auth, session, middleware) | `2026-10-08-fe-foundation-auth-design.md` | `2026-10-08-fe-foundation-auth.md` | — |
| FE sub-project 2 | UI cho Phase 1 (lớp, học sinh, vị trí) | — | `2026-10-08-phase1-ui.md` | `fd16301` |
| Backend Phase 2 (2a+2b) | Điểm danh, vi phạm, xếp loại, chép phạt | `2026-10-08-phase2-attendance-conduct-design.md` | `phase2a-...` + `phase2b-...` | — |
| FE sub-project 3 | UI cho Phase 2 (điểm danh...dashboard) | — | `2026-10-08-phase2-ui.md` | `d4ca861` |

`git log --oneline -1` hiện tại phải là `d4ca861 docs: record phase2-ui final-review results...` —
nếu khác, có commit mới hơn chưa được ghi vào bảng trên, đọc `git log` trước khi tin bảng này.

**Lưu ý lặp lại đã gặp nhiều lần, tránh tái phạm ở Phase 3:**
- Mongoose `MongooseSchema.Types.ObjectId` (không phải BSON `Types.ObjectId`) khi khai báo `@Prop`.
- Module mới quên `imports: [DatabaseModule]`.
- `new Date().toISOString().slice(0,10)` SAI cho "hôm nay" ở app chỉ dùng tại Việt Nam (UTC+7) — dùng
  `now.getFullYear()/getMonth()/getDate()` (xem `todayDateOnly()` trong `apps/web/lib/utils.js`, áp dụng
  tương tự nếu Phase 3 cần tính "hôm nay" ở backend, ví dụ mặc định `fromDate` khi tính lại engine).
- zod `.refine()`/`'custom'` issue code dễ bị switch-statement bỏ sót (đã vá ở `ZodValidationPipe`).
- `.codegraph/` đã có sẵn (SQLite index) — dùng `codegraph_explore` / MCP tool trước khi grep/đọc file.

## 2. Phạm vi Phase 3 (theo `docs/PROJECT_BRIEF.md`, mục "Nghiệp vụ cần cài đúng" 1-5)

1. **Lịch năm học**: ngày nghỉ (LE/DOT_XUAT/KHAC). Thẻ thống kê: tổng ngày nghỉ, nghỉ lễ, nghỉ đột
   xuất, số ngày dạy còn lại (trừ Chủ nhật + ngày nghỉ; Thứ Bảy tính ngày học nếu cấu hình bật).
2. **PPCT**: cột Tuần, Bài học, Số tiết, Tiết thứ, Yêu cầu cần đạt, Ghi chú. 3 loại tiết: CK(1,2,3...),
   TC(TC1,TC2...), CĐ(CĐ1,CĐ2...). v1: nhập tay + import Excel (preview trước khi lưu, giống pattern
   import học sinh ở Phase 1).
3. **Engine khớp tiết**: lấy tiết của môn trong TKB theo tuần, trừ ngày nghỉ, rải lần lượt tiết PPCT
   vào. Đổi TKB/thêm ngày nghỉ → tính lại từ ngày hiệu lực. Cho kéo chỉnh tay sau khi khớp tự động.
   **Bắt buộc ≥10 kịch bản test** (nghỉ giữa tuần, đổi TKB, tiết TC/CĐ xen kẽ, đổi số tiết/tuần...).
4. **Sổ báo giảng**: xem theo lớp/tuần hoặc theo tuần của tất cả các lớp, tích "Đã thực hiện".
5. **TKB**: lưới tuần kiểu Google Calendar (UI — thuộc sub-project 5, không phải sub-project này). v1
   chỉ 1 bản TKB hiện hành, schema giữ `effectiveFrom/effectiveTo`.

**Phạm vi sub-project này (sub-project 4) = backend thuần (schema + API + engine + test).** UI (TKB dạng
lưới Google Calendar, màn hình PPCT, sổ báo giảng) dời sang **sub-project 5**, giống cách Phase 1/2 tách
backend ra trước rồi mới làm UI.

## 3. Quyết định

### 3.1 Đã chốt với người dùng

1. **1 spec + 1 plan duy nhất** cho toàn bộ Phase 3 backend (không tách 3a/3b).
2. **PPCT thuộc về từng Position** (không dùng chung giữa các lớp cùng môn).
3. **TKB (`TimetableSlot`) do GVBM tự khai báo** cho vị trí SUBJECT mình giữ (`SELF`); ADMIN cũng sửa
   được. GVCN chỉ xem. (Người dùng chọn phương án này ngày 2026-10-11, thay cho "chỉ ADMIN sửa".)
4. **TKB phase này chỉ phục vụ giáo viên bộ môn.** Lưới TKB là dữ liệu dựng từ `TimetableSlot` +
   `LessonLog` của các vị trí giáo viên đó giữ. **TKB cho học sinh làm sau (Phase 5)**: phase này không có
   route TKB nào cho STUDENT.
5. **Kéo chỉnh tay giữ nguyên khi tính lại**: `LessonLog.isManuallyAdjusted=true` thì engine không đụng
   vào; chỉ rải lại phần PPCT chưa bị khóa. Tính lại chạy **tự động, đồng bộ** trong request ghi
   (`POST/PATCH/DELETE /holidays` → mọi position có PPCT; thao tác ghi `timetable-slots` và ghi PPCT → 1
   position). Không có nút "Khớp tiết lại" cho giáo viên.

### 3.2 Giả định đề xuất (chưa được hỏi riêng; sẽ ghi vào ASSUMPTIONS.md khi spec được duyệt)

- Một `PpctItem` ứng với đúng 1 `LessonLog` dù `periodCount > 1`. `LessonLog.date` là ngày của ô đầu tiên;
  engine chiếm đủ `periodCount` ô liên tiếp trong chuỗi thời gian, có thể tràn sang buổi/ngày kế.
- `LessonLog.done=true` cũng bị khóa như `isManuallyAdjusted=true` khi tính lại.
- `Holiday` áp dụng toàn trường (không gắn lớp/position).
- Một giáo viên không thể có 2 slot trùng (thứ, tiết) ở 2 position khác nhau trong khoảng hiệu lực chồng
  nhau → 409 "Bạn đã có tiết khác vào thời điểm này". Cùng position trùng (thứ, tiết) chồng hiệu lực → 409.
- Học sinh không đọc PPCT/sổ báo giảng ở phase này (brief chỉ liệt kê TKB lớp cho học sinh, làm ở Phase 5).
- GVCN chỉ XEM PPCT/TKB/sổ báo giảng của các môn trong lớp (đúng brief); chỉ GVBM của vị trí đó sửa.

## 4. Thiết kế

### 4.1 Kiến trúc / module

Module mới trong `apps/api/src/`: `holidays` (có thể đặt cạnh `school-years`), `timetable-slots`, `ppct`,
`lesson-logs` (chứa `LessonLogEngineService`).

```
Holiday (toàn trường) ──┐
                         ├──► Engine khớp tiết ──► LessonLog (date, done, isManuallyAdjusted)
TimetableSlot (position) ┘              ▲
                                         │
PpctItem (position, order) ─────────────┘
```

### 4.2 Schema mới (`apps/api/src/database/schemas/`)

Tham khảo schema có sẵn: `SchoolYear` (`name, startDate, endDate, isCurrent`), `Semester`, `SchoolConfig`
(doc cấu hình đơn — đọc file schema để lấy đúng pattern query).

```ts
Holiday { schoolYearId, startDate, endDate, type: 'LE'|'DOT_XUAT'|'KHAC', name }
// index: { schoolYearId: 1, startDate: 1 }

TimetableSlot { positionId, dayOfWeek /* 2-7, Thứ Hai=2 … Thứ Bảy=7 */, period, effectiveFrom, effectiveTo }
// index: { positionId: 1, dayOfWeek: 1, period: 1 }

PpctItem { positionId, order /* thứ tự rải, hệ thống gán */, week /* hiển thị, KHÔNG dùng để rải */,
           periodLabel /* "15" | "TC3" | "CĐ2" */, title, periodCount, requirement, note? }
// index: unique(positionId, order)

LessonLog { positionId, ppctItemId, date, isManuallyAdjusted (default false), done (default false) }
// index: unique(positionId, ppctItemId); { positionId: 1, date: 1 }
```

`SchoolConfig` thêm `saturdayIsSchoolDay: boolean` (default `false`), dùng cho thẻ thống kê ngày dạy.
Mongoose: dùng `MongooseSchema.Types.ObjectId` trong `@Prop`; module mới phải `imports: [DatabaseModule]`.

### 4.3 Engine `LessonLogEngineService.recalculate(positionId, fromDate)`

1. Lấy `TimetableSlot` đang hiệu lực của `positionId` và `Holiday` từ `fromDate` đến hết
   `SchoolYear.endDate` hiện tại.
2. Giữ nguyên `LessonLog` có `date >= fromDate` và (`isManuallyAdjusted=true` hoặc `done=true`) — coi là đã
   chiếm chỗ. Xóa phần còn lại để tính lại.
3. Dựng danh sách ô (ngày, tiết) trống theo thời gian từ TKB, trừ ngày thuộc `Holiday`, trừ ô đã bị chiếm.
4. Lấy `PpctItem` theo `order` tăng dần, bỏ các mục đã có `LessonLog` bị khóa, rải lần lượt, mỗi mục chiếm
   `periodCount` ô liên tiếp.
5. Bulk insert `LessonLog` mới; `date` = ngày của ô đầu tiên. Toàn bộ chạy trong transaction.
6. Phần PPCT không còn ô trống đến hết năm học: không tạo `LessonLog`, không báo lỗi.

"Hôm nay"/`fromDate` mặc định tính theo giờ địa phương (`getFullYear()/getMonth()/getDate()`), không dùng
`toISOString().slice(0,10)`.

### 4.4 API và phân quyền

Mọi route: `JwtAuthGuard + RolesGuard`; route theo vị trí thêm `PositionOwnerGuard` (ADMIN được bỏ qua).
`SubscriptionGuard` thuộc Phase 6, chưa áp dụng.

| Route | Ai gọi được |
|---|---|
| `GET /school-years/:id/holidays` | Mọi user đăng nhập |
| `GET /school-years/:id/calendar-stats` (tổng nghỉ, nghỉ lễ, nghỉ đột xuất, số ngày dạy còn lại) | Mọi user đăng nhập |
| `POST /holidays`, `PATCH /holidays/:id`, `DELETE /holidays/:id` | ADMIN; tính lại mọi position có PPCT |
| `GET /positions/:positionId/timetable-slots` | `SELF_OR_HOMEROOM` |
| `POST /positions/:positionId/timetable-slots`, `PATCH/DELETE .../:slotId` | `SELF` (GVBM) + ADMIN; tính lại 1 position từ `effectiveFrom` |
| `GET /timetable/me?weekStart=` (lưới tuần: slot + lesson log của mọi vị trí SUBJECT giáo viên giữ) | TEACHER |
| `GET /positions/:positionId/ppct` | `SELF_OR_HOMEROOM` |
| `POST/PATCH/DELETE /positions/:positionId/ppct[/:itemId]` | `SELF` + ADMIN; tính lại 1 position |
| `POST /positions/:positionId/ppct/import/preview`, `.../import/commit` | `SELF` + ADMIN (pattern import học sinh Phase 1) |
| `GET /positions/:positionId/lesson-logs?from&to` | `SELF_OR_HOMEROOM` |
| `PATCH /positions/:positionId/lesson-logs/:id` (đổi ngày → `isManuallyAdjusted=true`; tích `done`) | `SELF` + ADMIN |
| `POST /positions/:positionId/lesson-logs/recalculate` (sửa sự cố) | ADMIN |
| `GET /lesson-logs/week?weekStart=` (sổ báo giảng mọi lớp của giáo viên đang đăng nhập) | TEACHER, tự lọc theo vị trí mình giữ |

STUDENT: không route nào ở bảng trên (kể cả TKB lớp) — làm ở Phase 5.

### 4.5 Lỗi (tiếng Việt, qua filter có sẵn)

- Ngày nghỉ `endDate < startDate` → 400. Đổi ngày thủ công vào ngày nghỉ hoặc ngày/tiết không có trong TKB
  → 400 "Ngày này không có tiết của môn". Ô đã bị `LessonLog` khác chiếm → 409. Slot trùng → 409 (mục 3.2).
- Dữ liệu vị trí khác / không có quyền → 403.

### 4.6 Chiến lược test

`mongodb-memory-server` replica set như Phase 1. Test engine thuần (không DB) trước, rồi e2e với guard.

Engine ≥ 12 kịch bản:
1. Rải cơ bản: 5 mục PPCT, môn 2 tiết/tuần, không ngày nghỉ.
2. Nghỉ giữa tuần: 1 ngày lễ trùng 1 tiết, PPCT dồn lùi 1 ô.
3. Nghỉ nhiều ngày liên tiếp (cả tuần bão lũ).
4. Thêm ngày nghỉ sau khi đã rải: chỉ tính lại từ `fromDate`, phần trước không đổi.
5. Đổi TKB: tính lại từ `effectiveFrom` mới.
6. Số tiết/tuần đổi theo giai đoạn (2 rồi 3 tiết/tuần).
7. Tiết TC xen kẽ CK (`1,2,TC1,3`): giữ đúng thứ tự `order`.
8. Tiết CĐ xen kẽ; `periodLabel` không ảnh hưởng thuật toán.
9. `periodCount=2` chiếm 2 ô liên tiếp, kể cả tràn sang ngày kế.
10. `isManuallyAdjusted=true` giữ nguyên khi tính lại; phần còn lại rải quanh nó.
11. `done=true` bị khóa, không bị dời.
12. PPCT dài hơn số ô còn lại đến hết năm học: phần dư không có `LessonLog`, không lỗi.

Bổ sung: tính lại idempotent; Thứ Bảy bật/tắt; slot trùng → 409; phân quyền từng hàng ở 4.4 (GVBM môn khác
403, GVCN sửa PPCT/slot 403, STUDENT 403 mọi route, ADMIN được); hiệu năng: đọc sổ báo giảng cả học kỳ
< 2 giây, tính lại < 5 giây (1 test dữ liệu lớn).

## 5. Việc còn lại

- [x] Trình bày API + phân quyền, lỗi, chiến lược test (đã xong, đã điều chỉnh theo mục 3.1).
- [x] Người dùng duyệt file spec này (2026-10-11).
- [x] Thêm giả định mục 3.2 vào `docs/ASSUMPTIONS.md`.
- [ ] Viết plan bằng `superpowers:writing-plans` → `docs/superpowers/plans/2026-10-11-phase3-backend.md`.
- [ ] Người dùng chọn cách thực thi, rồi code theo TDD.

Giữ nguyên quy tắc dự án: không code trước khi spec và plan được duyệt (`CLAUDE.md`: gặp điểm mơ hồ thì
ghi giả định vào `docs/ASSUMPTIONS.md`, đừng tự bịa nghiệp vụ). UI (lưới TKB Google Calendar, màn hình
PPCT, sổ báo giảng) thuộc sub-project 5.
