# Phase 2 — Điểm danh, Vi phạm/Điểm cộng, Xếp loại rèn luyện, Chép phạt, Dashboard

Ngày: 2026-10-08
Trạng thái: Approved (người dùng duyệt phạm vi trong chat trước khi viết plan)

## Bối cảnh & mục tiêu

Phase 1 đã xong: auth, Admin, lớp + mã lớp, cơ chế Position (nhận/ngừng phụ trách/gán lại), hồ sơ học sinh,
guard phân quyền theo Position. Phase 2 xây nghiệp vụ "lớp học hằng ngày" đầu tiên trên nền Position đó: điểm
danh, ghi nhận vi phạm/điểm cộng, tính xếp loại rèn luyện, tự động sinh chép phạt, và 1 dashboard tổng quan theo
lớp.

Phase 2 KHÔNG phụ thuộc TKB/khớp tiết (Phase 3) hay Homework (Phase 4) — những phần của yêu cầu gốc nhắc tới 2
tính năng đó (điểm danh theo tiết học cụ thể; "bài tập quá hạn chưa xác nhận → tự chép phạt") được dời sang đúng
phase xây tính năng nền tương ứng, xem mục "Ngoài phạm vi".

Các quyết định nghiệp vụ đã được người dùng xác nhận trực tiếp trong chat (không tự suy diễn):
- Điểm danh làm **cả hai song song**: GVCN điểm danh "chính thức" theo ngày cho vị trí HOMEROOM, GVBM điểm danh
  độc lập theo đúng vị trí SUBJECT của mình.
- Danh mục vi phạm/điểm cộng do **ADMIN cấu hình toàn trường** (dùng chung mọi lớp).
- Chép phạt Phase 2 **chỉ làm phần không phụ thuộc Homework** (rule tuần + rule "Không làm BTVN" lặp lại); job
  tự động theo bài tập quá hạn dời sang Phase 4.
- Dashboard là **tổng quan theo lớp** (không phải theo từng học sinh).

## Phạm vi

1. **Điểm danh**: `AttendanceRecord` theo từng Position (1 bản ghi/học sinh/position/ngày). GVBM ghi cho đúng vị
   trí môn mình giữ; GVCN ghi cho vị trí HOMEROOM của lớp mình, và được XEM (không sửa) điểm danh của mọi vị trí
   SUBJECT khác trong lớp. Mặc định "Có mặt" nếu không ghi gì khác — chỉ cần lưu bản ghi cho học sinh vắng/trễ/có
   phép.
2. **Danh mục vi phạm/điểm cộng**: `ConductCatalogItem` do ADMIN CRUD, dùng chung toàn trường. Mỗi mục có điểm
   (âm = vi phạm, dương = điểm cộng) và cờ `specialRule` đánh dấu mục "Không làm BTVN" để chép phạt nhận diện
   đúng mục này dù tên hiển thị bị admin đổi sau này.
3. **Ghi nhận vi phạm/điểm cộng**: `ConductLog` gắn vào 1 Position cụ thể (ai ghi thì gắn vào position người đó
   đang giữ — GVBM gắn vào vị trí môn mình, GVCN gắn vào vị trí HOMEROOM). Mục "Khác" cho nhập điểm tùy ý (vi
   phạm -1..-50, điểm cộng +1..+30) không cần chọn từ danh mục.
4. **Xếp loại rèn luyện**: tính theo tuần ISO (Thứ Hai–Chủ Nhật), base 100 + tổng điểm `ConductLog` trong tuần đó
   của học sinh (không giới hạn trên). Xếp loại theo ngưỡng cố định trong yêu cầu gốc. Tháng/học kỳ = trung bình
   các tuần rơi vào khoảng đó. Tính khi đọc (aggregation), không lưu sẵn.
5. **Chép phạt tự động** (2 cơ chế độc lập, chạy ngay trong transaction khi ghi `ConductLog`, không cần job nền):
   - **Rule theo tuần**: lần đầu tiên số vi phạm (điểm âm) trong tuần của 1 học sinh chạm ngưỡng cấu hình (mặc
     định 2) → tạo 1 `Punishment` chung cho tuần đó. Vi phạm tiếp theo cùng tuần không tạo thêm.
   - **Rule "Không làm BTVN"**: mỗi lần ghi đúng mục có `specialRule: 'HOMEWORK_NOT_DONE'` → tạo 1 `Punishment`
     mới, số dòng tính theo số lần đã ghi mục này của học sinh đó từ trước tới nay (lần 1→20, lần 2→30, lần
     3→40, từ lần 4→50 + cờ `notifyParent`). GV sửa được số dòng (1-100) sau khi tạo. Hạn nộp = ngày ghi + N
     ngày (mặc định 2, cấu hình được).
   - GV cập nhật trạng thái chép phạt: Chưa nộp (mặc định) / Đã nộp / Nộp muộn.
6. **Cấu hình trường** (`SchoolConfig`, singleton, ADMIN sửa): ngưỡng vi phạm/tuần để tự sinh chép phạt (mặc định
   2), số ngày hạn nộp mặc định (mặc định 2).
7. **Dashboard theo lớp**: bất kỳ ai giữ 1 Position của lớp xem được — tổng điểm danh hôm nay theo trạng thái,
   vi phạm/điểm cộng gần đây, phân bố xếp loại rèn luyện tuần hiện tại của cả lớp, danh sách chép phạt đang chờ
   xử lý.

Ngoài phạm vi (phase sau): điểm danh theo tiết học cụ thể + TKB (Phase 3), job tự động "bài tập quá hạn → chép
phạt" + toàn bộ Homework (Phase 4), tạo chép phạt thủ công ngoài 2 cơ chế tự động trên (chưa có trong yêu cầu gốc
cho Phase 2, để dành nếu cần sau), xuất Word/PDF thông báo phụ huynh (Phase 4), cổng học sinh xem điểm
danh/rèn luyện của chính mình (Phase 5).

## Kiến trúc & module

### `packages/shared` (bổ sung)

- `src/constants/conduct.ts`: `CONDUCT_RATING_THRESHOLDS` (ngưỡng xếp loại), `MAX_VIOLATION_POINTS = 50`,
  `MAX_MERIT_POINTS = 30`, `HOMEWORK_NOT_DONE_LINES_BY_OCCURRENCE = [20, 30, 40, 50]` (từ lần 4 trở đi dùng giá
  trị cuối + cờ `notifyParent`).
- `src/schemas/attendance.schema.ts`: zod `markAttendanceSchema` (mảng `{studentId, status}`, áp dụng cho 1
  position + 1 ngày trong 1 lần gọi).
- `src/schemas/conduct.schema.ts`: zod `createConductCatalogItemSchema`, `updateConductCatalogItemSchema`,
  `createConductLogSchema` (`{studentId, catalogItemId}` HOẶC `{studentId, points, note}` cho mục "Khác").
- `src/schemas/punishment.schema.ts`: zod `updatePunishmentStatusSchema`, `updatePunishmentLinesSchema`.
- `src/schemas/school-config.schema.ts`: zod `updateSchoolConfigSchema`.

### `apps/api` — module mới

- **`common/guards/position-owner.guard.ts`** (mới): các route điểm danh/vi phạm bên dưới nhận `:positionId`
  trên URL (không phải `:classId` như `PositionGuard` của Phase 1 yêu cầu). Guard mới: tra `Position` theo
  `_id` để biết `classId`/`holderId` của nó, cho qua nếu `holderId === req.user.id` (đúng chủ vị trí), hoặc —
  với route đánh dấu cho phép GVCN xem — tra thêm Position HOMEROOM cùng `classId` xem có phải `req.user.id`
  không. ADMIN luôn qua. Gắn `request.position` (đã fetch sẵn) vào request để controller/service dùng lại,
  tránh truy vấn Position 2 lần trong cùng 1 request.
- **`attendance/`**: `AttendanceController`
  - `PUT /positions/:positionId/attendance?date=yyyy-mm-dd` — ghi đè toàn bộ bản ghi điểm danh của position đó
    trong ngày (chỉ cần gửi học sinh KHÔNG "Có mặt"; học sinh không có trong payload = Có mặt). Guard: đúng
    người đang giữ `positionId` đó, hoặc ADMIN.
  - `GET /positions/:positionId/attendance?date=yyyy-mm-dd` — xem điểm danh 1 position/1 ngày. Guard: đúng người
    giữ `positionId` đó, HOẶC GVCN (giữ HOMEROOM) của cùng lớp, HOẶC ADMIN.
  - `GET /classes/:classId/attendance/summary?date=yyyy-mm-dd` — tổng hợp điểm danh mọi position trong lớp theo
    ngày (dùng cho dashboard). Guard: đang giữ bất kỳ Position nào của lớp, hoặc ADMIN (dùng lại
    `@RequirePosition('ANY')` của Phase 1).
- **`conduct/`**: `ConductCatalogController` (ADMIN CRUD `/conduct-catalog`), `ConductLogController`
  - `POST /positions/:positionId/conduct-logs` — ghi 1 vi phạm/điểm cộng, gắn vào `positionId` đó. Guard: đúng
    người giữ `positionId` đó, hoặc ADMIN. Trả về cả `Punishment` mới nếu rule nào đó vừa kích hoạt.
  - `GET /classes/:classId/conduct-logs?studentId=&from=&to=` — xem lịch sử, mọi vị trí trong lớp gộp lại. Guard:
    giữ bất kỳ Position nào của lớp, hoặc ADMIN.
  - `GET /classes/:classId/conduct-rating?week=yyyy-Www` (hoặc `?month=`/`?semester=`) — xếp loại rèn luyện tính
    theo yêu cầu. Guard: giữ bất kỳ Position nào của lớp, hoặc ADMIN.
- **`punishments/`**: `PunishmentsController`
  - `GET /classes/:classId/punishments?status=` — danh sách chép phạt của lớp. Guard: giữ bất kỳ Position nào
    của lớp, hoặc ADMIN.
  - `PATCH /punishments/:id/status` — cập nhật Chưa nộp/Đã nộp/Nộp muộn. Guard: GVCN (HOMEROOM) của lớp chứa học
    sinh đó, hoặc ADMIN — IDOR check tương tự `StudentsService.findInClassOrThrow` ở Phase 1 (không tin
    `classId` trên URL/body, tự tra lại `Punishment.classId`).
  - `PATCH /punishments/:id/lines` — GV sửa số dòng chép phạt (1-100). Guard: như trên.
- **`school-config/`**: `SchoolConfigController` (`GET /school-config` mọi TEACHER/ADMIN đọc được để FE hiển thị
  đúng ngưỡng; `PATCH /school-config` chỉ ADMIN).
- **`dashboard/`**: `DashboardController`
  - `GET /classes/:classId/dashboard` — gộp cả 4 nguồn trên (điểm danh hôm nay, vi phạm/điểm cộng gần đây, phân
    bố xếp loại rèn luyện tuần, chép phạt đang chờ) thành 1 response duy nhất, tránh FE phải gọi 4 endpoint rồi
    tự ráp. Guard: giữ bất kỳ Position nào của lớp, hoặc ADMIN.

### Mongoose schema mới

- `AttendanceRecord`: `classId, positionId, studentId, date (Date, chỉ phần ngày — lưu 00:00 UTC), status (enum
  PRESENT|EXCUSED|LATE|UNEXCUSED, default PRESENT), recordedBy (userId)`. Unique index
  `(positionId, studentId, date)`.
- `ConductCatalogItem`: `label, kind (enum VIOLATION|MERIT), points (số dương, dấu suy ra từ `kind` lúc dùng),
  specialRule? (enum, hiện chỉ có `HOMEWORK_NOT_DONE`), isActive (default true, ADMIN "xoá" = tắt chứ không xoá
  cứng vì đã có log tham chiếu tới)`.
- `ConductLog`: `classId, positionId, studentId, catalogItemId? (null nếu dùng mục "Khác"), points (số đã có
  dấu, âm/dương), note?, date (Date), weekStart (Date, 00:00 UTC của Thứ Hai trong tuần chứa `date` — field suy
  diễn, lưu sẵn để index/aggregate theo tuần không phải tính lại mỗi query), recordedBy`. Index
  `(studentId, weekStart)`, index `(classId, date)`.
- `Punishment`: `studentId, classId, kind (enum WEEKLY_THRESHOLD|HOMEWORK_REPEAT), reason, lines (1-100),
  dueDate, status (enum PENDING|SUBMITTED|LATE, default PENDING), notifyParent (default false),
  triggerConductLogId, weekStart? (chỉ set cho kind=WEEKLY_THRESHOLD, dùng unique index chống tạo trùng)`. Unique
  index `(studentId, weekStart)` với `partialFilterExpression: { kind: 'WEEKLY_THRESHOLD' }` — đây chính là cơ
  chế chống tạo-trùng cho rule theo tuần (thay vì query-rồi-check, dựa vào race-condition-safe unique index +
  transaction, nhất quán với cách Position chống nhận trùng ở Phase 1).
- `SchoolConfig`: singleton (1 document duy nhất, seed sẵn), `weeklyViolationThreshold (default 2),
  defaultPunishmentDueDays (default 2)`.

## Nghiệp vụ cần cài đúng (trích lại để spec tự chứa)

- Xếp loại rèn luyện theo ngưỡng: ≥95 Xuất sắc; 90-94 Tốt; 80-89 Khá; 65-79 Đạt; 50-64 Cần rèn luyện; <50 Chưa
  đạt. Điểm có thể vượt 100 (không chặn trên).
- Chép phạt rule "Không làm BTVN": đếm theo LỊCH SỬ TOÀN THỜI GIAN của học sinh đó với đúng mục catalog có
  `specialRule: 'HOMEWORK_NOT_DONE'` (không reset theo tuần/học kỳ) — lần 1→20 dòng, lần 2→30, lần 3→40, lần 4
  trở đi→50 + báo phụ huynh.
- GVBM chỉ sửa được PPCT/TKB/sổ điểm/bài tập của đúng môn-lớp mình giữ (Phase 3-4, nhắc lại để nhất quán khi
  Phase 2 thiết kế guard) — Phase 2 tương tự: GVBM chỉ ghi điểm danh/vi phạm vào ĐÚNG position của mình, không
  được ghi hộ môn khác hay HOMEROOM.
- GVCN DUY NHẤT sửa hồ sơ học sinh (đã làm ở Phase 1) — Phase 2 không mở thêm quyền sửa hồ sơ học sinh nào khác.

## Kiểm thử

- Transaction: ghi `ConductLog` đủ ngưỡng vi phạm/tuần → đúng 1 `Punishment` được tạo trong CÙNG transaction;
  ghi tiếp vi phạm thứ 3, 4... cùng tuần → không tạo thêm `Punishment` loại `WEEKLY_THRESHOLD` (unique index
  `(studentId, weekStart)` bắt lỗi trùng, service phải bắt lỗi `11000` và coi là "đã tồn tại, bỏ qua" chứ không
  throw ra ngoài).
- Rule "Không làm BTVN": ghi 4 lần liên tiếp (có thể khác tuần) → đúng dãy số dòng 20/30/40/50, lần thứ 4 có
  `notifyParent: true`, các lần trước `false`.
- Phân quyền: GVBM ghi điểm danh/vi phạm vào vị trí KHÔNG phải của mình → 403. GVCN xem (không sửa) điểm danh vị
  trí SUBJECT của lớp mình → 200 cho GET, 403 cho PUT. GVCN lớp A không sửa được trạng thái chép phạt của học
  sinh lớp B (dù biết đúng id chép phạt) — IDOR test tương tự Phase 1.
- Xếp loại rèn luyện: test tính đúng theo ranh giới tuần ISO (1 vi phạm ghi đúng 23:59 Chủ Nhật vs 00:00 Thứ Hai
  phải rơi vào 2 tuần khác nhau).
- Dashboard: 1 test tổng hợp xác nhận response gộp đủ 4 phần, không cần test lại logic chi tiết từng phần (đã
  test riêng ở module tương ứng).

## Rủi ro / điểm cần lưu ý

- `weekStart` là field suy diễn lưu sẵn trên `ConductLog` — nếu sau này đổi định nghĩa "tuần" (vd Phase 3 cho
  cấu hình Thứ Bảy là ngày học) sẽ cần migration lại field này cho dữ liệu cũ. Chấp nhận được ở v1.
- Chép phạt rule theo tuần dựa vào unique index để chống race condition thay vì transaction+query trước — đơn
  giản hơn và nhất quán với pattern Position ở Phase 1, nhưng nghĩa là lỗi `11000` ở đây là tín hiệu "bình
  thường" (đã có rồi) chứ không phải lỗi thật, cần phân biệt rõ trong code (không lẫn với lỗi trùng dữ liệu khác
  nếu sau này thêm unique index khác vào cùng collection).

## Ngoài phạm vi (để phase sau)

- Điểm danh/vi phạm gắn theo tiết học cụ thể trong TKB (Phase 3).
- Job tự động "bài tập quá hạn chưa xác nhận → tự tạo chép phạt" (Phase 4, cần Homework/HomeworkSubmission).
- Tạo chép phạt thủ công (ngoài 2 cơ chế tự động) — chưa có trong yêu cầu gốc cho Phase 2.
- Thông báo phụ huynh (xuất Word/PDF) — Phase 4. Phase 2 chỉ lưu cờ `notifyParent` trên `Punishment`, chưa làm
  gì với cờ đó ngoài hiển thị.
- Cổng học sinh xem điểm danh/rèn luyện của chính mình — Phase 5.
