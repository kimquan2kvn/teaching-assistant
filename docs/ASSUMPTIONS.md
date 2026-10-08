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
