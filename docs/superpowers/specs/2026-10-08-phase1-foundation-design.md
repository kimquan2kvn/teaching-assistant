# Phase 1 — Auth, Admin, Lớp & Vị trí, Hồ sơ học sinh

Ngày: 2026-10-08
Trạng thái: Approved (người dùng duyệt phạm vi trong chat trước khi viết plan)

## Bối cảnh & mục tiêu

Phase 0 đã dựng xong khung kỹ thuật (monorepo, Mongo replica set, schema nền tảng, theme/layout web). Phase 1
thêm nghiệp vụ thật đầu tiên: xác thực người dùng thật, vai trò Admin, cơ chế lớp học + mã lớp + Position
(nhận/ngừng phụ trách/gán lại có transaction chống race condition), hồ sơ học sinh (CRUD + import Excel + đánh
dấu chuyển đi), và guard phân quyền ở backend.

Toàn bộ quy tắc nghiệp vụ, mô hình dữ liệu, và các giả định kỹ thuật không có trong yêu cầu gốc đã được ghi ở
`docs/PROJECT_BRIEF.md` và `docs/ASSUMPTIONS.md` (mục "Phase 1") — spec này tham chiếu lại, không lặp lại toàn
bộ.

## Phạm vi

1. **Auth**: đăng ký giáo viên, đăng nhập, refresh token (xoay vòng + thu hồi được), đổi mật khẩu, đăng xuất.
2. **Admin**: xem danh sách giáo viên, khóa/mở tài khoản giáo viên; Admin được seed sẵn (không tự đăng ký).
3. **SchoolYear tối giản**: đủ để `Class` có năm học hợp lệ (seed tạo sẵn 1 năm học hiện tại).
4. **Class & mã lớp**: tạo lớp → sinh mã lớp ngắn, tùy chọn nhận luôn vị trí HOMEROOM lúc tạo.
5. **Position**: tạo sẵn 1 vị trí HOMEROOM + N vị trí SUBJECT (theo danh mục môn) khi tạo lớp, đều `holderId:
   null`. Nhận vị trí (nhập mã lớp + chọn môn, hoặc nhận HOMEROOM nếu đang trống), ngừng phụ trách (giữ nguyên dữ
   liệu), Admin gán lại cho giáo viên bất kỳ.
6. **Hồ sơ học sinh**: GVCN tạo/sửa (CRUD), GVBM chỉ xem; import Excel có bước xem trước; đánh dấu chuyển đi
   (status, ngày, lý do) chỉ GVCN lớp đó được làm, giữ lịch sử.
7. **Guard phân quyền**: `JwtAuthGuard`, `RolesGuard` (`@Roles(...)`), `PositionGuard` (kiểm tra người gọi đang
   giữ đúng Position cho `classId`/`subject` truyền vào) — áp cho mọi endpoint ghi dữ liệu.
8. **Test phân quyền + transaction**: Jest + `mongodb-memory-server` (replica set) — test race condition nhận vị
   trí trùng, test từng cặp (role, hành động) được phép/không được phép.

Ngoài phạm vi (phase sau): cổng học sinh/tài khoản học sinh (Phase 5), lịch năm học đầy đủ + ngày nghỉ (Phase 3),
điểm danh/vi phạm/rèn luyện (Phase 2), xuất Excel vị trí (dời sang Phase 2 — xem ASSUMPTIONS.md), thanh toán
(Phase 6).

## Kiến trúc & module

### `packages/shared` (bổ sung)

- `src/constants/subjects.ts`: `export const SUBJECTS = [...]` (danh mục môn, xem ASSUMPTIONS.md).
- `src/schemas/auth.schema.ts`: zod `registerSchema`, `loginSchema`, `changePasswordSchema`.
- `src/schemas/class.schema.ts`: zod `createClassSchema`, `joinClassSchema`.
- `src/schemas/position.schema.ts`: zod `reassignPositionSchema`.
- `src/schemas/student.schema.ts`: zod `createStudentSchema`, `updateStudentSchema`, `markTransferredSchema`.
- Mỗi schema export kèm type suy ra (`z.infer<typeof X>`) để cả `apps/api` và `apps/web` dùng chung type.

### `apps/api` — module mới

- **`auth/`**: `AuthModule`, `AuthController` (`POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`,
  `POST /auth/logout`, `POST /auth/change-password`, `GET /auth/me`), `AuthService` (hash/verify mật khẩu bằng
  `argon2`, ký/verify JWT bằng `@nestjs/jwt`, quản lý `refreshTokenHash`), `JwtStrategy` (passport-jwt) +
  `JwtAuthGuard`, `RolesGuard` + decorator `@Roles(...)`.
- **`admin/`**: `AdminController` (`GET /admin/teachers`, `PATCH /admin/teachers/:id/active`) — chỉ `ADMIN`.
- **`school-years/`**: `SchoolYearsController` (`GET /school-years`, `POST /school-years` — chỉ `ADMIN`).
- **`classes/`**: `ClassesController` (`POST /classes`, `GET /classes/:code` tra cứu theo mã) — tạo lớp trong 1
  transaction cùng lúc tạo toàn bộ Position (HOMEROOM + từng SUBJECT trong `SUBJECTS`), set `holderId` của
  HOMEROOM ngay nếu người tạo chọn "có, tôi là GVCN".
- **`positions/`**: `PositionsController` (`POST /positions/join` — nhập mã lớp + môn/HOMEROOM để nhận,
  `POST /positions/:id/release` — ngừng phụ trách, `PATCH /positions/:id/reassign` — chỉ `ADMIN`). Logic nhận vị
  trí dùng `findOneAndUpdate` nguyên tử trong 1 session (filter `holderId: null`, set `holderId`), KHÔNG dùng
  insert — vì Position đã được tạo sẵn lúc tạo lớp (xem ASSUMPTIONS.md).
- **`students/`**: `StudentsController` (`GET /classes/:classId/students`, `POST`, `PATCH /:id`,
  `POST /:id/transfer`, `POST /classes/:classId/students/import-preview`,
  `POST /classes/:classId/students/import-confirm`) — phân quyền 2 mức theo `classId`:
  - **Xem** (`GET`): yêu cầu đang giữ **bất kỳ** Position nào (HOMEROOM hoặc SUBJECT) của đúng lớp đó, hoặc
    ADMIN.
  - **Sửa/tạo/transfer/import**: yêu cầu đang giữ đúng Position **HOMEROOM** của lớp đó, hoặc ADMIN.
  Học sinh của lớp khác không ai thấy được (chưa có Student login ở Phase 1 nên 2 mức trên chỉ áp cho
  TEACHER/ADMIN).
- **`common/guards/position.guard.ts`**: `PositionGuard` + decorator `@RequirePosition('HOMEROOM' | 'ANY')` đọc
  `classId` từ route param (Phase 1 chỉ cần route param, chưa có route nào cần lấy từ query/body), kiểm tra tồn
  tại 1 `Position` của `classId` đó mà `holderId === req.user.id`, và nếu decorator là `'HOMEROOM'` thì
  `type` phải đúng `HOMEROOM`; nếu là `'ANY'` thì chấp nhận cả HOMEROOM lẫn SUBJECT. ADMIN luôn được bỏ qua guard
  này (đã có `RolesGuard` xử lý riêng trước).

### Mongoose schema sửa đổi (từ Phase 0)

- `User`: thêm `fullName: string (required)`, `isActive: boolean (default true)`, `refreshTokenHash?: string`.
- `SchoolYear`: thêm `isCurrent: boolean (default false)`, index đảm bảo tối đa 1 bản ghi `isCurrent: true`
  (partial unique index `{ isCurrent: true }` với `partialFilterExpression: { isCurrent: true }`).

### Seed script

- `apps/api/src/seed/seed.ts` (chạy bằng `ts-node`, script riêng không nằm trong luồng bootstrap app): xoá sạch
  các collection liên quan rồi tạo 1 `SchoolYear` (`isCurrent: true`), 1 `User` admin, 3 `User` giáo viên mẫu, 1
  `Class` "11A4" (đủ `Position` HOMEROOM + SUBJECT theo `SUBJECTS`, HOMEROOM gán cho 1 trong 3 giáo viên mẫu), 12
  `Student` thuộc lớp đó. In ra username/mật khẩu tạm để dùng thử (chỉ chạy ở dev, không chạy tự động trong CI).

## Nghiệp vụ cần cài đúng (trích lại để spec tự chứa, xem PROJECT_BRIEF.md để biết toàn văn)

- Mỗi giáo viên giữ được nhiều vị trí; mỗi vị trí tối đa 1 người giữ (đã có index Phase 0).
- "Ngừng phụ trách": `holderId = null`, **giữ nguyên** toàn bộ dữ liệu liên quan tới Position đó (Student hồ sơ
  không bị xoá vì nó gắn với `classId`, không gắn với Position/User).
- Admin gán lại vị trí cho bất kỳ giáo viên nào (không cần người đó tự nhận).
- Học sinh chuyển lớp: chỉ GVCN lớp cũ đánh dấu `status = TRANSFERRED` kèm ngày + lý do; ẩn khỏi danh sách mặc
  định (`GET .../students` mặc định lọc `status: ACTIVE`, có query `?status=ALL` để xem lịch sử) nhưng không
  xoá cứng.
- Import Excel: endpoint preview trả về danh sách dòng đã parse + lỗi validate từng dòng (không lưu); endpoint
  confirm nhận lại đúng payload đã xem trước (hoặc đã sửa) để lưu thật trong 1 transaction (tất cả hoặc không
  gì — nếu 1 dòng lỗi thì không lưu dòng nào, trả lỗi rõ dòng nào sai).

## Kiểm thử

- `mongodb-memory-server` **replica set** (bắt buộc cho transaction) dùng chung cho mọi test cần DB thật của
  `apps/api` — 1 instance khởi tạo trong `jest.setup` toàn cục (dùng `beforeAll`/`afterAll` ở cấp module test
  hoặc 1 global setup file), các test dọn dữ liệu giữa các case bằng cách xoá collection, không tắt/bật lại
  server mỗi file để giữ tốc độ.
- Race condition nhận vị trí: 2 request `POST /positions/join` cùng lúc cho cùng classId+subject — đúng 1 cái
  thành công, cái còn lại nhận lỗi rõ ràng (không phải lỗi 500 không rõ nghĩa).
- Ma trận phân quyền tối thiểu (role × hành động) — mỗi cặp hợp lệ/không hợp lệ phải có 1 test:
  - STUDENT gọi bất kỳ endpoint ghi nào ở Phase 1 → 403 (học sinh Phase 1 chưa có gì để làm ngoài đăng ký tài
    khoản sau này — route ghi nào tồn tại cũng phải chặn).
  - GVBM sửa hồ sơ học sinh → 403. GVBM xem hồ sơ học sinh → 200.
  - GVCN sửa hồ sơ học sinh lớp mình → 200. GVCN sửa hồ sơ học sinh lớp khác → 403.
  - Giáo viên chưa giữ vị trí nào gọi `release`/`reassign` → 403 (reassign luôn luôn chỉ ADMIN).
  - ADMIN gọi mọi endpoint ghi → 200 (trừ các hành động chỉ hợp lệ về mặt dữ liệu, vd reassign sang user không
    phải TEACHER → 400).

## Rủi ro / điểm cần lưu ý

- Pre-tạo toàn bộ Position SUBJECT theo danh mục tĩnh khi tạo lớp nghĩa là đổi `SUBJECTS` sau này (thêm/bớt môn)
  cần migration cho các lớp đã tồn tại — chấp nhận được ở v1, ghi chú lại cho phase sau.
- `argon2` cần build native — môi trường dev đã xác nhận có gcc/make/python3 (xem ASSUMPTIONS.md); CI
  (`ubuntu-latest` trên GitHub Actions) cũng có sẵn toolchain này theo mặc định.
- Refresh token rotate: nếu client gọi `/auth/refresh` 2 lần với cùng 1 token cũ (vd do mạng lag, FE gọi lại) thì
  lần 2 phải thất bại rõ ràng (refresh token đã bị thay) chứ không được phép refresh vô hạn từ 1 token cũ.

## Ngoài phạm vi (để phase sau)

- Cổng học sinh, tài khoản đăng nhập học sinh (Phase 5).
- Lịch năm học đầy đủ (ngày nghỉ, thống kê) (Phase 3).
- Xuất Excel 1 vị trí (Phase 2, xem lý do ở ASSUMPTIONS.md).
- Điểm danh, vi phạm, rèn luyện, chép phạt (Phase 2).
