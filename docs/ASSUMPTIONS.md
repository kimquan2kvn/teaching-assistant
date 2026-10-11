# Giả định (Assumptions)

Tài liệu này ghi lại các giả định kỹ thuật/hạ tầng được đưa ra khi yêu cầu gốc không chỉ định rõ.
Giả định về **nghiệp vụ** (business rules) sẽ được hỏi lại người dùng trước khi code thay vì ghi ở đây.

## Phase 0

- **Node.js**: dùng bản LTS hiện hành (20.x) cho toàn bộ monorepo.
- **Package manager**: pnpm (workspaces), version mới nhất ổn định tại thời điểm viết.
- **Git**: khởi tạo repo mới cục bộ (branch `main`), chưa gắn remote. Người dùng tự thêm remote khi cần.
- **CI**: dùng GitHub Actions vì yêu cầu chỉ ghi "CI cơ bản", không chỉ định nền tảng cụ thể. Workflow Phase 0 chỉ chạy install → lint → typecheck → build (chưa có test nghiệp vụ để chạy).
- **Validate dùng chung**: `packages/shared` dùng **zod** (không dùng class-validator), vì zod chạy được cả ở Next.js/React Native sau này còn class-validator gắn chặt với NestJS decorators. API dùng lại schema zod từ `packages/shared` qua một adapter pipe nhỏ.
- **Giao diện demo**: yêu cầu gốc có nhắc "đã có bản demo, bám theo" nhưng không có file demo nào trong thư mục dự án lúc bắt đầu. Phase 0 bám theo đúng mô tả bằng chữ (bảng màu, bố cục, font) trong yêu cầu. Nếu người dùng cung cấp demo thật (ảnh/Figma/source), sẽ điều chỉnh lại theme cho khớp ở phase sau.
- **MongoDB**: image `mongo` bản mới nhất dòng 7.x, 1 node cấu hình `--replSet rs0`, có service `mongo-init` chạy `rs.initiate()` một lần khi container Mongo sẵn sàng.
- **Schema Mongoose phase 0**: chỉ tạo các collection nền tảng mà Phase 1 cần ngay: `User, SchoolYear, Semester, Class, Position, Student`. Các collection khác trong mô hình dữ liệu gợi ý (Holiday, TimetableSlot, PpctItem, LessonLog, AttendanceRecord, ConductCatalog, ConductLog, Homework, HomeworkSubmission, Punishment, GradeColumn, GradeValue, SeatingChart, ParentNotice, Plan, Subscription, PaymentOrder, AuditLog) sẽ được thêm ở đúng phase triển khai nghiệp vụ tương ứng, tránh thiết kế thừa trước khi cần.
- **PWA**: không làm ở Phase 0 (thuộc Phase 7), `apps/web` là Next.js thường, chưa có manifest/service worker.
  Xác nhận với người dùng: "PWA" chỉ là lớp cài đặt (manifest + service worker) phủ lên **một** bản web responsive
  duy nhất (Phase 0 đã làm responsive ngay từ đầu — sidebar → drawer trên mobile) — không phải giao diện/codebase
  riêng cho mobile. Phase 7 không được tạo thêm luồng UI khác ngoài thêm khả năng cài đặt + offline cơ bản.
- **Auth thật**: chưa làm ở Phase 0 (thuộc Phase 1). `apps/api` Phase 0 chỉ có module gốc + 1 endpoint health check.

## Phase 1

- **Access/refresh token**: access token JWT 15 phút trả trong response body (FE giữ ở Redux, không persist).
  Refresh token 30 ngày trả cả trong body lẫn set qua cookie `httpOnly` `SameSite=Lax` (`Secure` chỉ bật khi
  `NODE_ENV=production` — bật cố định sẽ khiến trình duyệt bỏ cookie hoàn toàn khi chạy dev qua `http://`). Web
  dùng cookie là nguồn chính (middleware `cookie-parser` đọc `req.cookies`); endpoint `/auth/refresh` ưu tiên
  `body.refreshToken` nếu có, không thì đọc cookie — để app React Native sau này (không có cookie) vẫn dùng được
  qua body. Refresh token được lưu dạng hash (không lưu plaintext) trên `User.refreshTokenHash`, xoay vòng
  (rotate) mỗi lần refresh — kèm `jti` ngẫu nhiên để 2 lần cấp liên tiếp trong cùng 1 giây không bị trùng token —
  null khi logout hoặc khi đổi mật khẩu — cho phép thu hồi.
- **Băm mật khẩu**: dùng `argon2` (argon2id) — ưu tiên theo đúng thứ tự liệt kê trong yêu cầu gốc
  ("argon2/bcrypt"). Môi trường dev có sẵn gcc/make/python3 nên build native nếu cần sẽ không bị chặn.
- **Trường `fullName` trên `User`**: mô hình dữ liệu gợi ý trong yêu cầu gốc không liệt kê trường tên hiển thị cho
  giáo viên, nhưng hệ thống cần tên để hiển thị/ký tên (vd thông báo phụ huynh ở Phase 4) — thêm `fullName:
  string` vào `User` schema (migrate từ Phase 0), không phải quyết định nghiệp vụ gây tranh cãi, chỉ lấp lỗ hổng
  dữ liệu hiển nhiên.
- **`User.isActive`**: thêm cờ để Admin "quản lý tài khoản giáo viên" (khóa/mở tài khoản) — đăng nhập bị chặn nếu
  `isActive=false`. Không có trong mô hình gợi ý gốc nhưng cần để hiện thực đúng câu "Admin quản lý tài khoản
  giáo viên".
- **Đăng ký**: chỉ giáo viên tự đăng ký được (email/username + mật khẩu). Admin không có endpoint tự đăng ký —
  chỉ tạo qua seed script hoặc (nếu cần) một admin khác tạo trực tiếp trong DB; Phase 1 không làm UI "admin tạo
  admin" vì yêu cầu gốc không nhắc tới, tránh suy diễn nghiệp vụ.
- **SchoolYear**: Phase 1 chỉ cần vừa đủ để `Class` có `schoolYearId` hợp lệ — thêm `isCurrent: boolean` (chỉ 1
  năm học `true` tại một thời điểm), seed tạo sẵn 1 năm học hiện tại, tạo lớp mới tự gán vào năm học đang
  `isCurrent`. Toàn bộ UI quản lý lịch năm học/ngày nghỉ/thống kê là Phase 3, không làm ở đây.
- **Danh mục môn học**: yêu cầu gốc không liệt kê danh sách môn cụ thể cho vị trí SUBJECT — thêm hằng số
  `SUBJECTS` (Toán, Ngữ văn, Tiếng Anh, Vật lý, Hóa học, Sinh học, Lịch sử, Địa lý, GDCD, Tin học, Công nghệ, Thể
  dục, GDQP-AN) trong `packages/shared`, cấu hình được thêm/bớt ở phase sau nếu cần (hiện tại là hằng số tĩnh).
- **Nhận vị trí SUBJECT**: Position (cả HOMEROOM và SUBJECT) được **tạo sẵn (holderId=null)** ngay khi tạo lớp
  cho mọi môn trong danh mục `SUBJECTS`, thay vì tạo "on-demand" lúc giáo viên nhận — để việc "nhận vị trí" luôn
  là một `findOneAndUpdate` nguyên tử (filter `holderId: null`) thay vì phải xử lý nhánh insert-hay-update, đơn
  giản hoá đúng yêu cầu "chống race condition bằng unique index + transaction".
- **"Xuất dữ liệu 1 vị trí ra Excel để sao lưu"**: yêu cầu gốc nhắc tới mục này ở phần cơ chế vị trí chung, nhưng
  ở Phase 1 một vị trí SUBJECT chưa có dữ liệu nghiệp vụ nào để xuất (PPCT/sổ điểm là Phase 3-4), xuất lúc này sẽ
  gần như rỗng. Dời tính năng này sang Phase 2 (vị trí đã có điểm danh/vi phạm) để lần xuất đầu tiên có ý nghĩa,
  thay vì làm một tính năng rỗng rồi phải sửa lại.
- **Validate**: dùng lại quyết định zod ở `packages/shared` từ Phase 0 — DTO của Phase 1 là zod schema trong
  `packages/shared`, `apps/api` có 1 `ZodValidationPipe` dùng chung để validate theo schema đó.
- **Import Excel học sinh**: dùng `exceljs` (JS thuần, không cần build native, đọc/ghi .xlsx tốt).
- **Test transaction/race condition**: dùng `mongodb-memory-server` ở chế độ **replica set** (bắt buộc để test
  transaction thật, không mock).
- **Định dạng ngày sinh khi import Excel**: chấp nhận `dd/mm/yyyy` (định dạng phổ biến trong Excel tiếng Việt)
  hoặc ISO `yyyy-mm-dd`; chuỗi không khớp 1 trong 2 dạng này bị báo lỗi ở bước preview thay vì âm thầm parse sai
  (vd `new Date("15/03/2008")` tự hiểu theo kiểu Mỹ sẽ đổi ngày/tháng cho nhau).
- **Giới hạn file/khối lượng import**: file Excel tối đa 5MB, `import-confirm` tối đa 2000 dòng/lần — không có
  trong yêu cầu gốc, thêm để tránh 1 request đơn lẻ (vô tình hoặc cố ý) làm quá tải request body hoặc tạo hàng
  loạt bản ghi không giới hạn. Có thể nới nếu trường thực tế cần nhập lớp > 2000 học sinh/lần (không hợp lý với
  quy mô 1 lớp phổ thông nên chưa coi là giới hạn cần xem lại ngay).

## Phase 2

- **GVCN ghi vi phạm/điểm cộng gắn vào vị trí nào**: yêu cầu gốc viết "GVCN... Vi phạm/điểm cộng (tất cả)"
  nhưng không nói rõ "(tất cả)" là ghi-được-vào-mọi-position hay chỉ là xem-được-toàn-bộ-lớp. Chọn cách đơn
  giản, đối xứng với điểm danh (đã được người dùng xác nhận là "cả hai song song" — GVCN và GVBM ghi độc lập
  theo đúng position mình giữ): `ConductLog` do GVCN ghi luôn gắn vào position HOMEROOM của lớp (không ghi hộ
  vào position SUBJECT của giáo viên khác), nhưng GVCN vẫn ĐỌC được vi phạm/điểm cộng của mọi position trong
  lớp (route `GET /classes/:classId/conduct-logs` gộp toàn bộ, không lọc theo position) — nghĩa là "(tất cả)"
  trong yêu cầu gốc được hiểu là phạm vi XEM, không phải quyền ghi hộ môn khác. Nếu người dùng cần GVCN ghi được
  vi phạm vào đúng 1 môn cụ thể (thay vì luôn gắn HOMEROOM), cần sửa lại thiết kế này.
- **Tuần tính xếp loại rèn luyện**: tuần ISO (Thứ Hai 00:00 UTC – Chủ Nhật 23:59 UTC), không phụ thuộc cấu hình
  "Thứ Bảy có phải ngày học" (đó là khái niệm của Phase 3 cho thống kê ngày nghỉ/dạy, không phải ranh giới tuần
  dùng để reset điểm rèn luyện).
- **Số dòng chép phạt mặc định cho rule "đủ N vi phạm/tuần"**: yêu cầu gốc chỉ cho công thức số dòng của rule
  "Không làm BTVN" (20/30/40/50 theo số lần lặp), KHÔNG cho công thức cho rule chung "đủ 2 lỗi bất kỳ/tuần".
  Thêm `SchoolConfig.defaultWeeklyPunishmentLines` (mặc định 20, ADMIN cấu hình được qua
  `PATCH /school-config`), GV sửa được riêng từng chép phạt sau khi tạo qua `PATCH /punishments/:id/lines`
  (1-100) — không có quyết định nghiệp vụ nào bị khoá cứng, chỉ là 1 giá trị khởi điểm hợp lý.
- **Xếp loại rèn luyện tháng/học kỳ**: spec Phase 2 chỉ làm xếp loại THEO TUẦN (có công thức rõ: base 100 +
  tổng điểm tuần). Tháng/học kỳ (yêu cầu gốc có nhắc, mô tả là "trung bình các tuần") CHƯA làm ở Phase 2 vì
  chưa có tiêu chí test/API shape cụ thể nào được xác nhận — để lại cho lần cần dùng thật, lúc đó sẽ hỏi lại
  hình dạng API (vd FE cần trả về điểm trung bình hay cả danh sách từng tuần kèm theo).

## Sub-project 2 (UI cho Phase 1)

- **Ngày sinh học sinh trên roster — GVBM xem được, giống GVCN** (đã hỏi lại người dùng, xác nhận "Có, giống
  GVCN"): bảng danh sách học sinh hiện cột ngày sinh cho mọi vị trí được phép xem lớp (GVCN, GVBM, ADMIN),
  không ẩn field theo role ở tầng API hay FE. Chỉ khác nhau ở việc có nút "Sửa"/"Đánh dấu chuyển đi" hay không
  (chỉ GVCN + ADMIN). Nếu sau này cần siết lại (vd chỉ GVCN thấy ngày sinh), đây là thay đổi tầng API (thêm
  field-level filter theo role), không chỉ ẩn ở FE.
- **3 endpoint đọc bổ sung coi là trong phạm vi sub-project 2** (không phải việc backend ngoài phạm vi): `GET
  /positions/mine`, `GET /classes/:classId/detail`, `GET /admin/teachers/:id/positions` — thuần đọc dữ liệu,
  không thêm schema/module Mongoose mới, nhưng bắt buộc phải có thì UI mới điều hướng được theo lớp (gap này
  cũng chặn điều hướng của các module Phase 2 đã xây xong, không chỉ riêng sub-project này).

## Phase 3 (backend) — lịch năm học, PPCT, TKB, engine khớp tiết, sổ báo giảng

Chi tiết: `docs/superpowers/specs/2026-10-11-phase3-design.md` (đã duyệt 2026-10-11).

- **TKB do GVBM tự khai báo** (người dùng chọn 2026-10-11): `TimetableSlot` do GVBM của vị trí SUBJECT (và
  ADMIN) tạo/sửa/xóa; GVCN chỉ xem. TKB không "sinh từ PPCT" được vì PPCT không có thứ/tiết — engine rải PPCT
  vào các slot. Phase 3 chỉ có TKB cho giáo viên; TKB cho học sinh để Phase 5.
- **1 mục PPCT = 1 `LessonLog`** dù `periodCount > 1`: `date` là ngày của ô đầu tiên, engine chiếm đủ
  `periodCount` ô liên tiếp (có thể tràn sang ngày kế).
- **`LessonLog.done=true` cũng bị khóa** như `isManuallyAdjusted=true` khi tính lại — buổi đã tích "Đã thực
  hiện" không bị dời.
- **`Holiday` áp dụng toàn trường**, không gắn lớp/position. Thay đổi ngày nghỉ tính lại mọi position có PPCT.
- **Slot trùng bị từ chối (409)**: cùng position trùng (thứ, tiết) có hiệu lực chồng nhau, hoặc cùng giáo viên
  có 2 slot trùng ở 2 position khác nhau. (Yêu cầu gốc không nói; đây là ràng buộc hợp lý, bỏ được nếu thực tế
  có dạy ghép.)
- **Học sinh không đọc PPCT/sổ báo giảng ở Phase 3**; GVCN chỉ XEM PPCT/TKB/sổ báo giảng các môn trong lớp
  (đúng brief), chỉ GVBM của vị trí (và ADMIN) sửa.
- **PPCT hết ô trống đến cuối năm học**: phần dư không có `LessonLog`, không báo lỗi.
- **Tính lại đồng bộ trong request ghi**, không có nút "Khớp tiết lại" cho giáo viên; chỉ ADMIN có endpoint
  recalculate để sửa sự cố.
- **Log "được giữ lại" gồm cả log quá khứ**: ngoài log bị khóa (`isManuallyAdjusted`/`done`) ở `date >= fromDate`,
  mọi log có `date < fromDate` (kể cả chưa khóa) cũng được giữ nguyên và coi là mục đã xếp, engine không xếp lại
  (nếu xếp lại thì insert vi phạm unique `(positionId, ppctItemId)`).
- **`LessonLog` không lưu tiết** (chỉ có `date`) nên ô bị log khóa chiếm được suy ra từ `date`: log khóa chiếm
  `periodCount` ô TỰ DO đầu tiên có `date >= log.date`, xử lý theo thứ tự `(date, order)`. Log khóa nằm trên ngày
  không còn ô (vd vừa thành ngày nghỉ) chiếm ô tự do đầu tiên sau đó; `date` đã lưu không bị sửa. Muốn kéo-thả đúng
  từng TIẾT trong ngày có từ 2 tiết thì phải thêm `period` vào schema (chưa làm).
- **"Liên tiếp" là liên tiếp trong chuỗi ô tự do** (đã bỏ ô bị giữ chỗ). Mục không đủ `periodCount` ô tự do thì
  engine DỪNG, các mục sau cũng không xếp để giữ đúng thứ tự `order`.
- **Engine không đọc `saturdayIsSchoolDay`**: slot do giáo viên khai báo là nguồn đúng, cờ chỉ dùng cho thẻ thống
  kê. Slot Thứ Bảy (`dayOfWeek = 7`) vẫn được xếp tiết khi cờ tắt, không bị chặn lúc tạo.
- **Năm học của engine = năm học của lớp** (`Class.schoolYearId`), không phải "năm học hiện hành": ngày nghỉ lấy theo
  năm đó, `fromDate` luôn bị kẹp `>= SchoolYear.startDate`. Trùng với năm hiện hành ở mọi luồng v1, nhưng không
  404 khi không có năm hiện hành và vẫn đúng khi sửa lớp năm cũ.
- **`fromDate` khi tính lại theo từng thao tác**: ghi slot → `effectiveFrom` (PATCH lấy giá trị nhỏ hơn giữa cũ/mới;
  DELETE lấy `effectiveFrom` của slot); ghi ngày nghỉ → `startDate` (PATCH lấy min cũ/mới); ghi PPCT/import → hôm nay
  (giờ Việt Nam). NGOẠI LỆ: position chưa có log nào (xếp lần đầu) thì tính từ đầu năm học, để thứ tự nhập
  PPCT-trước/TKB-trước không làm khác kết quả. PPCT nhập giữa năm không tự lấp các buổi đã qua ngoài lần xếp đầu;
  ADMIN `POST .../recalculate` nhận `fromDate` tuỳ chọn (mặc định như PPCT) để xử lý.
- **Tính lại giữ nguyên `_id` log**: không xóa-chèn lại mà xóa log chưa khóa `date >= fromDate` của mục không còn được
  xếp, rồi upsert theo `(positionId, ppctItemId)`, để id UI đang cầm không bị mồ côi sau mỗi lần tính lại.
- **PPCT `order` do hệ thống gán**: POST luôn thêm CUỐI (`max(order)+1`), import nối tiếp sau `order` lớn nhất, PATCH
  không đổi `order`, DELETE không đánh số lại (để trống chỗ). v1 không có chèn giữa/đổi thứ tự. Xóa mục PPCT xóa
  luôn `LessonLog` của nó, kể cả log đã `done`.
- **Giới hạn đầu vào** (hợp lý, không có trong brief): `period` của slot 1–10, `periodCount` 1–10, `week` 1–60,
  `periodLabel` 1–20 ký tự (chỉ là chuỗi hiển thị, không ép regex vì mục 2 tiết có thể là `15-16`), import PPCT tối
  đa 500 dòng.
- **Slot/PPCT chỉ ghi được vào position `SUBJECT`**: ghi vào HOMEROOM trả 400; đọc position HOMEROOM trả rỗng.
- **Thẻ thống kê ngày nghỉ** (`GET school-years/:id/calendar-stats`): đếm theo ngày LỊCH, ngày nghỉ bị cắt theo khoảng
  năm học (cả Chủ Nhật nếu ngày nghỉ kéo qua). `totalHolidayDays` là hợp (mỗi ngày 1 lần dù chồng nhiều loại),
  `leHolidayDays`/`dotXuatHolidayDays` là hợp theo từng loại. `remainingTeachingDays` = số ngày từ `asOf` (mặc định
  hôm nay VN, tính cả `asOf`) đến hết năm học, trừ Chủ Nhật, trừ Thứ Bảy khi `saturdayIsSchoolDay = false`, trừ ngày
  nghỉ. Query `asOf=yyyy-mm-dd` tuỳ chọn.
- **Phân quyền đọc**: spec ghi `GET holidays`/`calendar-stats` cho "mọi user đăng nhập" nhưng cũng ghi STUDENT 403 mọi
  route Phase 3, nên chốt TEACHER/ADMIN (STUDENT 403). `GET /timetable/me` và `GET /lesson-logs/week` chỉ TEACHER
  (ADMIN cũng 403, đúng bảng phân quyền của spec).
- **"Hôm nay" tính cố định UTC+7 qua `Clock`**, không theo giờ/múi giờ máy chủ (container thường chạy UTC); ngày lưu là
  date-only 00:00 UTC. Lúc 00:00–07:00 sáng Thứ Hai giờ VN vẫn ra đúng tuần mới.
- **Mã trả về**: DELETE trả `200 { deleted: true }`; `POST .../recalculate` trả `200 { scheduled }`; các POST tạo mới
  (kể cả `import/preview`, `import/commit`) trả 201 mặc định của Nest, giống import học sinh Phase 1.

### Phát sinh khi triển khai (đã chốt trong lúc code)

- **Định dạng ngày trong API**: request nhận `yyyy-mm-dd`; response của holiday, slot, PPCT, log trả ISO đầy đủ
  `yyyy-mm-ddT00:00:00.000Z` (Date serialize, như Phase 1–2). Chỉ `weekStart`/`weekEnd` của `GET /timetable/me` là
  chuỗi `yyyy-mm-dd`.
- **`recalculate` trả `scheduled`** = số mục được xếp/xếp lại trong lần chạy đó; mục được giữ (log quá khứ, log
  khóa) không tính.
- **`assertCanMoveLog` dựng ô cả năm học** nên kéo log tới ngày NGOÀI năm học trả 400 `Ngày này không có tiết của
  môn` (cùng thông báo với ngày nghỉ/ngày không có slot); 409 chỉ khi mọi ô của ngày đó đã bị log KHÁC bị khóa chiếm.
- **Trùng giờ "cùng giáo viên" quét mọi position khác của giáo viên đó, kể cả lớp năm học cũ**: có thể 409 oan nếu
  giáo viên chưa ngừng phụ trách lớp năm cũ mà slot ở đó còn `effectiveTo = null`. Chưa xử lý (cùng nhóm với câu hỏi
  mở 6 bên dưới).
- **Kiểm tra trùng slot không an toàn tuyệt đối khi 2 request cùng position đến đồng thời**: không có unique index cho
  khoảng hiệu lực chồng nhau nên 2 transaction song song có thể cùng qua kiểm tra. Rủi ro thấp (1 GVBM/position),
  chưa xử lý.
- **Preview import PPCT không chặn position HOMEROOM** (chỉ đọc file, không đụng DB); chỉ `import/commit` mới chặn
  400. Preview báo thêm 3 lỗi dòng ngoài plan để khớp giới hạn của commit: `Tiết thứ quá dài (tối đa 20 ký tự)`,
  `Yêu cầu cần đạt quá dài (tối đa 1000 ký tự)`, `Ghi chú quá dài (tối đa 500 ký tự)`. Độ dài tối đa: title PPCT 300,
  requirement 1000, note 500, tên ngày nghỉ 200.
- **`POST .../lesson-logs/recalculate` có `@RequirePositionOwner('SELF')`** chỉ để guard kiểm position tồn tại; ADMIN
  bỏ qua kiểm tra chủ sở hữu nhưng gọi position không tồn tại vẫn nhận 403 (hành vi sẵn có của guard, không phải 404).
- **`GET calendar-stats` cần có `SchoolConfig` trong DB**, thiếu thì 404 `Chưa có cấu hình trường...` như các module
  Phase 2 (seed script có tạo config).
- **Engine giữ chỗ cho mọi log được giữ, kể cả log trước `fromDate` có `periodCount > 1`** (sửa sau review): ô dựng từ
  ngày sớm nhất của log được giữ nên bài nhiều tiết đã bắt đầu trước `fromDate` vẫn chiếm các ô sau `fromDate` của nó
  (tính lại từ bất kỳ `fromDate` nào cho cùng lịch như từ đầu năm); khi tính lại, ngày nghỉ lấy cả năm học. Log chưa
  khóa ở quá khứ mà ngày của nó không còn ô (TKB đổi ngoài luồng) không chiếm ô nào; log khóa vẫn trôi sang ô kế tiếp.
- **Câu hỏi mở của plan**: câu 1–4 (không chặn slot Thứ Bảy; `fromDate` mặc định hôm nay VN + lần xếp đầu từ đầu năm
  học; không thêm `period` vào `LessonLog`; PPCT v1 chỉ thêm cuối) người dùng đã xác nhận giữ mặc định ngày
  2026-10-11. Câu 5 (403 tiếng Anh `Forbidden resource` của guard, tồn tại từ Phase 1–2) và câu 6 (`reassign` có thể
  tạo slot trùng giờ vì kiểm tra chỉ chạy lúc ghi slot) vẫn mở, ngoài phạm vi Phase 3.
