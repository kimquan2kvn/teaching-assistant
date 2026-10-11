# Phase 3 (backend) — Lịch năm học, PPCT, TKB, Engine khớp tiết, Sổ báo giảng

> **TRẠNG THÁI: ĐANG BRAINSTORM, CHƯA HOÀN TẤT, CHƯA ĐƯỢC DUYỆT.**
> File này là điểm **handoff** để tiếp tục đúng mạch trên máy khác (hoặc phiên Claude Code khác).
> Khi mở lại: đọc `docs/PROJECT_BRIEF.md` (bối cảnh gốc dự án) + `docs/ASSUMPTIONS.md` (giả định đã
> chốt ở các phase trước) + file này, dùng skill `superpowers:brainstorming` (nhánh **kiến trúc**), rồi
> làm tiếp đúng mục "## Việc cần làm tiếp" ở cuối file — KHÔNG bắt đầu viết code hay viết plan trước khi
> mục đó được hoàn tất.

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

## 3. Quyết định đã chốt với người dùng (brainstorming, chưa ghi vào ASSUMPTIONS.md vì spec chưa duyệt)

1. **1 spec + 1 plan duy nhất** cho toàn bộ Phase 3 backend (không tách 3a/3b như Phase 1/2).
2. **PPCT thuộc về từng Position** (không dùng chung PPCT giữa các lớp cùng môn) — khớp pattern
   `TimetableSlot`/`ConductLog` đã gắn theo `positionId` xuyên suốt dự án.
3. **TKB (`TimetableSlot`) chỉ ADMIN được tạo/sửa** — GVCN/GVBM chỉ xem vị trí mình giữ.
4. **Kéo chỉnh tay giữ nguyên khi tính lại**: `LessonLog.isManuallyAdjusted=true` thì engine không đụng
   vào khi tính lại, chỉ rải lại phần PPCT chưa bị chỉnh tay. Việc **tính lại chạy tự động, đồng bộ**
   ngay trong request `POST /holidays` (ảnh hưởng mọi position có PPCT) và `PATCH /timetable-slots/:id`
   (ảnh hưởng 1 position), không cần nút "Khớp tiết lại" riêng.

**Giả định đang đề xuất, CHƯA hỏi lại người dùng** (nêu rõ để người review spec biết mà chỉnh nếu sai):
- Một `PpctItem` ứng với đúng 1 `LessonLog` dù `periodCount > 1` (bài học 2 tiết) — `LessonLog.date` là
  ngày của ô đầu tiên bị chiếm; engine vẫn chiếm đủ `periodCount` ô liên tiếp trong chuỗi thời gian khi
  rải, có thể tràn sang buổi/ngày kế nếu môn đó mỗi ngày chỉ có 1 tiết.
- `LessonLog.done=true` cũng được coi là "đã khóa" giống `isManuallyAdjusted=true` khi tính lại — buổi
  đã tích "Đã thực hiện" thì không bị dời nữa, dù không phải do GV chỉnh tay.
- `Holiday` áp dụng toàn trường (không gắn theo lớp/position).

## 4. Thiết kế đã trình bày với người dùng (đang chờ xác nhận rõ ràng — xem mục 5)

### 4.1 Kiến trúc / module

Module mới trong `apps/api/src/`: `holidays` (mở rộng `school-years` sẵn có), `timetable-slots`, `ppct`,
`lesson-logs` (chứa luôn `LessonLogEngineService` — engine khớp tiết).

```
Holiday (school-wide) ──┐
                         ├──► Engine khớp tiết ──► LessonLog (date, done, isManuallyAdjusted)
TimetableSlot (position) ┘              ▲
                                         │
PpctItem (position, order) ─────────────┘
```

### 4.2 Schema mới (`apps/api/src/database/schemas/`)

Tham khảo schema đã có: `SchoolYear` (`name, startDate, endDate, isCurrent` — unique partial index trên
`isCurrent`), `Semester` (`schoolYearId, term(1|2), startDate, endDate`), `SchoolConfig` (doc cấu hình
đơn, không có `_id` cố định biết trước — đọc file schema trước khi code để lấy đúng pattern query).

```ts
Holiday { schoolYearId, startDate, endDate, type: 'LE'|'DOT_XUAT'|'KHAC', name }
// index: { schoolYearId: 1, startDate: 1 }

TimetableSlot { positionId, dayOfWeek /* 2-7, Thứ Hai=2...Thứ Bảy=7 */, period, effectiveFrom, effectiveTo }
// index: { positionId: 1, dayOfWeek: 1, period: 1 }
// ghi: chỉ ADMIN (PositionGuard không áp — dùng AdminGuard có sẵn từ module admin/)

PpctItem { positionId, order /* thứ tự rải tiết, do hệ thống gán khi tạo/import */, week /* cột hiển thị, KHÔNG dùng để rải */, periodLabel /* "15" | "TC3" | "CĐ2" */, title, periodCount, requirement, note? }
// index: unique(positionId, order)

LessonLog { positionId, ppctItemId, date, isManuallyAdjusted (default false), done (default false) }
// index: unique(positionId, ppctItemId); index: { positionId: 1, date: 1 }
```

`SchoolConfig` thêm field `saturdayIsSchoolDay: boolean` (default `false`) — dùng cho thẻ thống kê "số
ngày dạy còn lại" của lịch năm học.

### 4.3 Thuật toán `LessonLogEngineService.recalculate(positionId, fromDate)`

1. Lấy `TimetableSlot` đang hiệu lực của `positionId`, và `Holiday` toàn trường từ `fromDate` trở đi
   (đến hết `SchoolYear.endDate` hiện tại).
2. Trong `LessonLog` hiện có của `positionId` với `date >= fromDate`: **giữ nguyên** (coi là đã chiếm
   chỗ) các bản ghi có `isManuallyAdjusted=true` **hoặc** `done=true`. Xóa phần còn lại để tính lại.
3. Dựng danh sách (ngày, tiết) còn trống theo thứ tự thời gian từ TKB, trừ ngày rơi vào `Holiday`, trừ
   ngày/tiết đã bị chiếm ở bước 2.
4. Lấy `PpctItem` theo `order` tăng dần, bỏ qua các mục đã có `LessonLog` bị khóa ở bước 2 (so theo
   `ppctItemId`), rải lần lượt vào danh sách ô trống — mỗi mục chiếm `periodCount` ô liên tiếp.
5. Ghi `LessonLog` mới (bulk insert) cho phần vừa rải; `date` = ngày của ô đầu tiên bị chiếm.

**Trigger**: `PositionsController`/`HolidaysController` gọi `recalculate()` đồng bộ ngay trong handler
của `POST /holidays` (lặp qua MỌI position đang có ≥1 `PpctItem` trong trường) và
`PATCH /timetable-slots/:id` (chỉ 1 position, `fromDate` = `effectiveFrom` mới của slot vừa sửa).

### 4.4 Phần CHƯA trình bày (API endpoints chi tiết + bảng phân quyền) — việc tiếp theo, xem mục 5

## 5. Việc cần làm tiếp (theo đúng skill `superpowers:brainstorming`, nhánh kiến trúc)

- [ ] Trình bày **API endpoints + bảng phân quyền** (REST route cho từng module 4.2, ai gọi được —
  ADMIN/GVCN/GVBM/ANY — theo đúng mô hình Position+Guard đã dùng xuyên suốt dự án) — **CHƯA làm**.
- [ ] Trình bày **error handling + testing strategy** tóm tắt (đặc biệt: enumerate rõ ≥10 kịch bản test
  engine theo yêu cầu gốc, dùng `mongodb-memory-server` replica set như Phase 1).
- [ ] Hỏi lại người dùng 2 giả định ở mục 3 nếu thấy cần (hiện đang để mặc định hợp lý, không chặn tiến
  độ — chỉ hỏi nếu người review thấy rủi ro nghiệp vụ thật).
- [ ] Viết toàn bộ spec hoàn chỉnh vào **chính file này** (thay phần "TRẠNG THÁI" ở đầu bằng
  "ĐÃ DUYỆT") sau khi người dùng xác nhận từng phần.
- [ ] Spec self-review (placeholder/mâu thuẫn/phạm vi/mơ hồ) theo skill.
- [ ] Người dùng duyệt file spec cuối cùng.
- [ ] Dùng skill `superpowers:writing-plans` viết plan vào `docs/superpowers/plans/2026-10-11-phase3-backend.md`.
- [ ] Người dùng chọn cách thực thi (đã luôn dùng mô hình multi-agent orchestrator ở các sub-project
  trước — khả năng cao tiếp tục vậy) rồi mới bắt đầu code thật (TDD, theo đúng flow ở mục 1).

**KHÔNG bỏ qua các bước trên dù máy khác/phiên khác muốn "code nhanh"** — Phase 3 có engine khớp tiết là
phần rủi ro nghiệp vụ cao nhất dự án, spec/plan rõ ràng trước khi code là bắt buộc theo quy tắc của
chính dự án này (`CLAUDE.md`: "Nếu gặp điểm mơ hồ thì ghi giả định vào docs/ASSUMPTIONS.md, đừng tự bịa
nghiệp vụ").
