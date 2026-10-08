# Sổ Chủ Nhiệm — Bản mô tả gốc dự án

> Tài liệu này lưu lại nguyên văn yêu cầu nghiệp vụ/kỹ thuật đầy đủ do người dùng cung cấp lúc khởi tạo dự án
> (2026-10-08), dùng làm nguồn tham chiếu "sự thật" (source of truth) cho toàn bộ các phase. Các spec riêng từng
> phase trong `docs/superpowers/specs/` sẽ trích dẫn lại phần liên quan thay vì chép lại toàn bộ.

## Vai trò

Senior full-stack engineer xây dựng "Sổ Chủ Nhiệm": web app responsive (PWA) cho giáo viên và học sinh THPT Việt
Nam. Làm theo từng phase, hết mỗi phase chạy test + lint, tóm tắt, chờ duyệt mới sang phase tiếp. Điểm mơ hồ ghi
vào `docs/ASSUMPTIONS.md`, không tự bịa nghiệp vụ.

## Mục tiêu & phạm vi

- Nhiều người dùng, mỗi người một tài khoản đăng nhập thật. Ba nhóm: giáo viên, học sinh, admin.
- Giao diện tiếng Việt, ngày dd/mm/yyyy, dùng tốt trên điện thoại.
- Kiến trúc API-first: backend độc lập, web chỉ gọi REST API, để sau này làm app React Native dùng lại nguyên
  backend. Không để logic nghiệp vụ nằm ở frontend.
- Ngoài phạm vi v1: app native (làm sau), cổng phụ huynh, tích hợp vnEdu/SMAS, OCR PDF scan, nhiều bản TKB, nộp
  bài bằng file đính kèm.

## Tech stack

- Frontend (apps/web): Next.js + JavaScript, Tailwind CSS, shadcn/ui, Redux Toolkit (RTK Query cho REST API),
  PWA (manifest + service worker).
- Backend (apps/api): NestJS + TypeScript, REST API, MongoDB với Mongoose, JWT (access + refresh), validate bằng
  zod hoặc class-validator.
- Monorepo pnpm: apps/api, apps/web, packages/shared (TypeScript, build ra JS, zod schemas + hằng số dùng chung).
- docker-compose: MongoDB replica set một node (bắt buộc để dùng transaction). Script seed: 1 admin, vài giáo
  viên, 1 lớp 11A4 với khoảng 12 học sinh kèm tài khoản.
- Test: Jest cho api (mongodb-memory-server dạng replica set) — test kỹ engine khớp tiết, tính điểm, quy tắc chép
  phạt, phân quyền, nhận vị trí trùng, webhook thanh toán. Playwright cho vài luồng chính ở web.
- Mọi thao tác nhiều bước ghi nhiều collection phải chạy trong transaction.

## Vai trò & phân quyền (kiểm tra ở backend bằng guard, KHÔNG chỉ ẩn nút ở UI)

Vai trò hệ thống: TEACHER, STUDENT, ADMIN. Quyền giáo viên xác định theo "vị trí" (Position):
- Position loại HOMEROOM (GVCN của 1 lớp) và loại SUBJECT (1 môn trong 1 lớp). Mỗi vị trí tối đa 1 người giữ
  (holderId nullable, unique index theo lớp+môn và theo lớp+HOMEROOM). Một giáo viên giữ được nhiều vị trí.
- GVBM (giữ vị trí SUBJECT): sửa PPCT, TKB, Sổ báo giảng, Bài tập, Sổ điểm của đúng môn-lớp đó. Điểm danh. Thêm
  vi phạm trong môn mình. Giao bài tập kèm hạn nộp, đánh dấu/xác nhận nộp. Chỉ XEM hồ sơ học sinh.
- GVCN (giữ vị trí HOMEROOM): DUY NHẤT sửa hồ sơ học sinh. Sửa điểm tất cả các môn trong lớp. Điểm danh. Vi
  phạm/điểm cộng (tất cả). Xếp loại rèn luyện, chép phạt, sơ đồ chỗ ngồi, thông báo phụ huynh. Tạo/quản lý tài
  khoản học sinh lớp mình. Xem PPCT/TKB/bài tập các môn.
- ADMIN: quản lý tài khoản giáo viên, xem/sửa/xóa mọi dữ liệu, gán lại/giải phóng vị trí, quản lý gói thuê bao.
- STUDENT: chỉ xem dữ liệu của CHÍNH MÌNH. Không bao giờ truy cập dữ liệu học sinh khác.
- Hồ sơ học sinh của 1 lớp là MỘT bản dùng chung cho mọi giáo viên của lớp đó.

## Cơ chế vị trí & tham gia lớp

- Người tạo lớp đầu tiên: hệ thống sinh mã lớp ngắn (vd 11A4-8X2K), hỏi "Bạn có phải GVCN lớp này không?".
- Giáo viên khác nhập mã lớp + chọn môn để nhận vị trí SUBJECT. Môn đã có người giữ thì báo lỗi, không cho nhận
  trùng (unique index + transaction chống race condition).
- Nút "Ngừng phụ trách": đặt holderId = null, GIỮ NGUYÊN toàn bộ dữ liệu. Giáo viên mới nhập mã + chọn môn (hoặc
  nhận GVCN nếu đang trống) thì kế thừa dữ liệu, sửa tiếp được.
- Dữ liệu gắn vào Position, không gắn vào tài khoản người dùng.
- Admin gán lại vị trí cho bất kỳ giáo viên nào (nghỉ đột ngột).
- Học sinh chuyển lớp: chỉ GVCN lớp cũ đánh dấu status = TRANSFERRED (kèm ngày, lý do). Ẩn khỏi điểm danh/sổ điểm
  hiện tại nhưng giữ lịch sử. Tài khoản học sinh bị vô hiệu. GVCN lớp mới tự tạo hồ sơ mới, không đồng bộ tự động.
- Xuất dữ liệu 1 vị trí ra Excel để sao lưu.

## Cổng học sinh

- GVCN tạo tài khoản hàng loạt: username tự sinh (mã lớp + STT hoặc mã học sinh), mật khẩu tạm ngẫu nhiên, BẮT
  BUỘC đổi mật khẩu lần đầu. GVCN in/xuất danh sách tài khoản (Excel/PDF). Nút đặt lại mật khẩu.
- Học sinh CHỈ ĐỌC dữ liệu của mình: TKB lớp, bài tập + hạn nộp, điểm danh của mình, điểm rèn luyện + xếp loại
  theo tuần, điểm số các môn, danh sách chép phạt + hạn nộp, sơ đồ chỗ ngồi.
- Học sinh bấm "Đã làm xong" trên bài tập → trạng thái "chờ xác nhận". GVBM xác nhận cuối mới tính đã nộp. Quá
  hạn chưa xác nhận → tự sinh chép phạt.
- Học sinh không sửa được gì ngoài đổi mật khẩu và bấm "Đã làm xong".
- Giao diện cổng học sinh riêng, đơn giản, ưu tiên điện thoại (route /hoc-sinh).
- Bảo vệ dữ liệu trẻ vị thành niên: rate limit đăng nhập, khóa tạm sau nhiều lần sai, trang chính sách bảo
  mật/điều khoản, không thu thập dữ liệu thừa.

## Thanh toán & gói thuê bao

- Dùng thử miễn phí N ngày (mặc định 30, cấu hình được). Hết hạn cần gói trả phí để tiếp tục sửa dữ liệu.
- Giá/chu kỳ (tháng/năm) trong collection Plan, cấu hình được, không hard-code.
- Hết hạn: chuyển chỉ xem + xuất dữ liệu. Không khóa/xóa dữ liệu.
- Cổng trong nước: MoMo, ZaloPay, VNPay. Interface `PaymentProvider`: `createPayment(order)`, `verifyCallback
  (payload)`, `queryStatus(orderId)`. Thêm cổng mới không sửa code nghiệp vụ.
- Collection: Plan, Subscription (userId, planId, status, currentPeriodEnd), PaymentOrder (provider, amount,
  status, providerTxnId, rawPayload, createdAt).
- Webhook/IPN: kiểm chữ ký HMAC trước khi tin, đối chiếu số tiền, xử lý IDEMPOTENT, lưu rawPayload đối soát.
  Endpoint cho client tra lại trạng thái sau khi quay lại từ cổng thanh toán.
- Sandbox cả 3 cổng ở dev. API key trong biến môi trường, không commit. Docs ghi rõ giấy tờ cần có lên production
  từng cổng.
- Bản đầu gia hạn thủ công theo kỳ trả trước, chưa trừ tiền tự động định kỳ.
- `SubscriptionGuard` áp cho thao tác ghi của giáo viên. Admin miễn.

## Mô hình dữ liệu gợi ý (Mongoose)

User (role, email/username, passwordHash, mustChangePassword, studentId?), SchoolYear, Semester, Class (code,
name, schoolYearId), Position, Student (classId, fullName, dob, status ACTIVE|TRANSFERRED, transferDate,
transferReason), Holiday (start, end, type LE|DOT_XUAT|KHAC), TimetableSlot (positionId, dayOfWeek, period,
effectiveFrom, effectiveTo), PpctItem, LessonLog (sổ báo giảng, cờ done), AttendanceRecord, ConductCatalog
(lỗi/điểm cộng, điểm số, cấu hình được), ConductLog, Homework (positionId, title, note, dueDate),
HomeworkSubmission (studentId, studentDone, teacherConfirmed), Punishment (chép phạt), GradeColumn + GradeValue,
SeatingChart (classId, effectiveFrom, seats), ParentNotice, Plan, Subscription, PaymentOrder, AuditLog. Tham
chiếu ObjectId. Index theo classId, positionId, studentId, ngày. Không xóa cứng học sinh, dùng status.

## Nghiệp vụ cần cài đúng

1. Lịch năm học: ngày nghỉ (lễ/đột xuất/khác). Thẻ thống kê: tổng ngày nghỉ, nghỉ lễ, nghỉ đột xuất, số ngày dạy
   còn lại (trừ Chủ nhật + ngày nghỉ; Thứ Bảy tính ngày học nếu cấu hình bật).
2. PPCT: cột Tuần, Bài học, Số tiết, Tiết thứ, Yêu cầu cần đạt, Ghi chú. Ba loại tiết: CK (1,2,3...), TC (TC1,
   TC2...), CĐ (CĐ1, CĐ2...). Số tiết/tuần đổi theo giai đoạn. v1: nhập tay + import Excel theo mẫu, màn hình xem
   trước trước khi lưu. Import Word/PDF để phase sau.
3. Engine khớp tiết: lấy tiết của môn trong TKB theo tuần, trừ ngày nghỉ, rải lần lượt tiết PPCT vào. Đổi TKB
   hoặc thêm ngày nghỉ → tính lại từ ngày hiệu lực. Cho kéo chỉnh tay sau khi khớp tự động. Test ít nhất 10 kịch
   bản (nghỉ giữa tuần, đổi TKB, tiết TC/CĐ xen kẽ, đổi số tiết/tuần).
4. Sổ báo giảng: xem theo lớp/tuần hoặc theo tuần của tất cả các lớp, tích "Đã thực hiện".
5. TKB: lưới tuần kiểu Google Calendar (giờ bên trái, 6 cột Thứ 2-7, ô màu theo môn, cột hôm nay nổi bật), điều
   hướng tuần trước/sau, lọc tháng/năm. v1 chỉ 1 bản TKB hiện hành, schema giữ effectiveFrom/effectiveTo.
6. Điểm danh: Có mặt (mặc định)/Phép/Muộn/Không phép. Lưu theo ngày, xem lại ngày cũ, thống kê.
7. Vi phạm & điểm cộng: danh mục cấu hình được, ô tìm nhanh. Mục "Khác" nhập điểm tùy ý (trừ 1-50, cộng 1-30).
8. Xếp loại rèn luyện tuần/tháng/học kỳ: mỗi tuần bắt đầu 100 điểm, cộng/trừ theo nhật ký, cho vượt 100. Ngưỡng:
   >=95 Xuất sắc; 90-94 Tốt; 80-89 Khá; 65-79 Đạt; 50-64 Cần rèn luyện; <50 Chưa đạt.
9. Chép phạt: tự sinh khi học sinh có từ 2 lỗi bất kỳ trong tuần (mặc định, cấu hình được). Riêng "Không làm
   BTVN" tính theo số lần lặp lỗi đó: lần 1 chép 20, lần 2 chép 30, lần 3 chép 40, từ lần 4 chép 50 + cờ báo phụ
   huynh. GV chỉnh số lần 1-100. Hạn mặc định +2 ngày. Trạng thái Chưa nộp/Đã nộp/Nộp muộn. Bài tập quá hạn chưa
   GVBM xác nhận → tự tạo chép phạt (scheduled job).
10. Bài tập: GVBM giao theo lớp kèm hạn nộp, đánh dấu/xác nhận từng học sinh. Bấm vào bài sửa được ngay.
11. Sổ điểm (Thông tư 22): chọn lớp/môn. Cột TX (số cột cấu hình theo môn), GK, CK. Mỗi điểm lưu ngày cho điểm +
    hình thức (vấn đáp, bài tập, dự án...). ĐTBmhk = (tổng TX + 2*GK + 3*CK) / (số cột TX + 5). Xếp loại học lực
    Giỏi/Khá/Trung bình/Yếu. GVCN sửa được tất cả môn trong lớp.
12. Vòng quay may mắn: random ưu tiên học sinh chưa được gọi trong tuần, xem danh sách buổi trước. Quay xong cho
    điểm ngay (cột TX trống kế tiếp, hết cột tự thêm "Vấn đáp") hoặc Thưởng/Phạt 1 chạm (ghi nhật ký vi
    phạm/điểm cộng).
13. Sơ đồ chỗ ngồi: kéo-thả (bấm-chọn cho điện thoại), hiển thị STT + họ tên (ngày sinh tùy chọn), lưu theo "áp
    dụng từ ngày" giữ lịch sử, có in. Sơ đồ lớp học bộ môn của GVBM: phase sau.
14. Thông báo phụ huynh: tạo theo ngày/tuần/tháng/học kỳ từ nhật ký vi phạm/điểm cộng, xuất Word/PDF. Nội dung +
    chữ ký GVCN là template mẫu tạm, dễ chỉnh.

## Giao diện

- shadcn/ui nền. Theme qua CSS variables trong globals.css, bảng màu Binance trên NỀN TRẮNG: vàng #F0B90B (nút
  chính/mục đang chọn); sidebar tối #1E2329 (chữ #B7BDC6, active chữ vàng + vạch vàng trái); viền #EAECEF; chữ
  #1E2329, chữ phụ #848E9C; xanh #0ECB81 (có mặt/điểm cộng); đỏ #F6465D (vi phạm/vắng); vàng đậm #D0980B hover.
- Nút chính bo tròn pill chữ đen; card bo 10px viền mảnh + bóng nhẹ; số liệu font mono (IBM Plex Mono); tiêu đề
  IBM Plex Sans; thân Inter.
- Sidebar trái nhóm: Tổng quan / Nền tảng / Kế hoạch dạy học / Lớp học hằng ngày / Học tập / Khác, icon line đơn
  giản. Điện thoại: sidebar thu thành drawer.
- Ô tìm kiếm có icon kính lúp SVG trong ô (không emoji).
- Redux: auth slice, RTK Query cho API, cache theo tag cập nhật danh sách sau khi ghi.

## Phases (dừng lại chờ duyệt sau mỗi phase)

- Phase 0: khởi tạo monorepo, docker-compose (Mongo replica set), schema Mongoose, CI cơ bản, layout + theme
  shadcn.
- Phase 1: đăng ký/đăng nhập, Admin, lớp + mã lớp, cơ chế Position (nhận/ngừng phụ trách/gán lại, transaction),
  hồ sơ học sinh (+ import Excel, đánh dấu chuyển đi), guard phân quyền + test phân quyền.
- Phase 2: điểm danh, vi phạm/điểm cộng, xếp loại rèn luyện, chép phạt, dashboard.
- Phase 3: lịch năm học, PPCT (+ import Excel), TKB kiểu Google Calendar, engine khớp tiết, sổ báo giảng.
- Phase 4: sổ điểm, bài tập + hạn nộp + tự chuyển chép phạt, vòng quay, sơ đồ chỗ ngồi, thông báo phụ huynh.
- Phase 5: cổng học sinh (tạo tài khoản hàng loạt, đổi mật khẩu lần đầu, màn hình chỉ đọc, "Đã làm xong").
- Phase 6: thanh toán và thuê bao (Plan, Subscription, 3 adapter MoMo/ZaloPay/VNPay sandbox, webhook idempotent,
  SubscriptionGuard, màn hình gói và hóa đơn).
- Phase 7: PWA, xuất file, sao lưu, bảo mật (rate limit, validate, audit log), tối ưu hiệu năng, hướng dẫn deploy.

## Yêu cầu phi chức năng

- Dữ liệu học sinh là dữ liệu cá nhân người chưa thành niên: HTTPS, băm mật khẩu (argon2/bcrypt), tách dữ liệu
  theo quyền, audit log cho thao tác sửa/xóa, sao lưu MongoDB hằng ngày.
- Mở sổ báo giảng cả học kỳ dưới 2 giây; tính lại khi đổi TKB dưới 5 giây.
- Mọi API có validate và trả lỗi tiếng Việt thân thiện.
