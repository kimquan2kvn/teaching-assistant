# Vai trò
Bạn là senior full-stack engineer. Hãy xây dựng "Sổ Chủ Nhiệm": web app responsive (PWA) cho giáo viên và học sinh THPT Việt Nam. Làm theo từng phase bên dưới. Hết mỗi phase thì chạy test và lint, tóm tắt những gì đã làm, rồi chờ tôi duyệt mới sang phase tiếp. Nếu gặp điểm mơ hồ thì ghi giả định vào docs/ASSUMPTIONS.md, đừng tự bịa nghiệp vụ.

# Mục tiêu & phạm vi
- Nhiều người dùng, mỗi người một tài khoản đăng nhập thật. Ba nhóm: giáo viên, học sinh, admin.
- Giao diện tiếng Việt, ngày dd/mm/yyyy, dùng tốt trên điện thoại.
- Kiến trúc API-first: backend độc lập, web chỉ gọi REST API, để sau này làm app React Native dùng lại nguyên backend. Không để logic nghiệp vụ nằm ở frontend.
- Ngoài phạm vi v1: app native (làm sau), cổng phụ huynh, tích hợp vnEdu/SMAS, OCR PDF scan, nhiều bản TKB, nộp bài bằng file đính kèm.

# Tech stack
- Frontend (apps/web): Next.js + JavaScript, Tailwind CSS, shadcn/ui, Redux Toolkit (dùng RTK Query cho gọi REST API), PWA (manifest + service worker).
- Backend (apps/api): NestJS + TypeScript, REST API, MongoDB với Mongoose, xác thực JWT (access + refresh), validate bằng zod hoặc class-validator.
- Monorepo pnpm: apps/api, apps/web, packages/shared (TypeScript, build ra JS, chứa zod schemas và hằng số dùng chung).
- docker-compose: MongoDB chạy dạng REPLICA SET một node (bắt buộc để dùng transaction). Có script seed: 1 admin, vài giáo viên, 1 lớp 11A4 với khoảng 12 học sinh kèm tài khoản.
- Test: Jest cho api (dùng mongodb-memory-server dạng replica set), bắt buộc test kỹ engine khớp tiết, tính điểm, quy tắc chép phạt, phân quyền, nhận vị trí trùng, webhook thanh toán. Playwright cho vài luồng chính ở web.
- Mọi thao tác nhiều bước ghi nhiều collection (nhận vị trí, ngừng phụ trách, gán lại, chuyển học sinh đi) phải chạy trong transaction.

# Vai trò & phân quyền (kiểm tra ở backend bằng guard, KHÔNG chỉ ẩn nút ở UI)
Vai trò hệ thống: TEACHER, STUDENT, ADMIN. Quyền của giáo viên xác định theo "vị trí" (Position):
- Position loại HOMEROOM (GVCN của 1 lớp) và loại SUBJECT (1 môn trong 1 lớp). Mỗi vị trí có tối đa 1 người giữ (holderId nullable, unique index theo lớp+môn và theo lớp+HOMEROOM). Một giáo viên giữ được nhiều vị trí.
- GVBM (giữ vị trí SUBJECT): sửa PPCT, TKB, Sổ báo giảng, Bài tập, Sổ điểm của đúng môn-lớp đó. Điểm danh. Thêm vi phạm trong môn mình. Giao bài tập kèm hạn nộp, đánh dấu và xác nhận học sinh đã nộp hay chưa. Chỉ XEM hồ sơ học sinh.
- GVCN (giữ vị trí HOMEROOM): là người DUY NHẤT sửa hồ sơ học sinh. Sửa điểm của TẤT CẢ các môn trong lớp. Điểm danh. Vi phạm/điểm cộng (tất cả). Xếp loại rèn luyện, chép phạt, sơ đồ chỗ ngồi, thông báo phụ huynh. Tạo và quản lý tài khoản học sinh của lớp mình. Xem PPCT/TKB/bài tập các môn.
- ADMIN: quản lý tài khoản giáo viên, xem/sửa/xóa mọi dữ liệu, gán lại hoặc giải phóng vị trí, quản lý gói thuê bao.
- STUDENT: chỉ xem dữ liệu của CHÍNH MÌNH (xem mục Cổng học sinh). Không bao giờ truy cập được dữ liệu học sinh khác.
- Hồ sơ học sinh của 1 lớp là MỘT bản dùng chung cho mọi giáo viên của lớp đó.

# Cơ chế vị trí & tham gia lớp
- Người tạo lớp đầu tiên: hệ thống sinh mã lớp ngắn (vd 11A4-8X2K), hỏi "Bạn có phải GVCN lớp này không?".
- Giáo viên khác nhập mã lớp + chọn môn để nhận vị trí SUBJECT. Môn đã có người giữ thì báo lỗi, không cho nhận trùng (xử lý race condition bằng unique index + transaction).
- Nút "Ngừng phụ trách" trên từng vị trí: đặt holderId = null, GIỮ NGUYÊN toàn bộ dữ liệu (PPCT, TKB, sổ điểm, hồ sơ). Giáo viên mới nhập mã + chọn môn (hoặc nhận GVCN nếu đang trống) thì kế thừa dữ liệu và sửa tiếp được.
- Dữ liệu gắn vào Position chứ không gắn vào tài khoản người dùng.
- Admin gán lại vị trí cho bất kỳ giáo viên nào (trường hợp nghỉ đột ngột).
- Học sinh chuyển lớp: chỉ GVCN lớp cũ đánh dấu status = TRANSFERRED (kèm ngày, lý do). Học sinh ẩn khỏi điểm danh/sổ điểm hiện tại nhưng giữ lịch sử. Tài khoản đăng nhập của học sinh đó bị vô hiệu. GVCN lớp mới tự tạo hồ sơ mới, không đồng bộ tự động.
- Có chức năng xuất dữ liệu 1 vị trí ra Excel để sao lưu.

# Cổng học sinh
- GVCN tạo tài khoản hàng loạt cho học sinh trong lớp: username sinh tự động (mã lớp + STT, hoặc mã học sinh), mật khẩu tạm ngẫu nhiên, BẮT BUỘC đổi mật khẩu ở lần đăng nhập đầu. GVCN in hoặc xuất danh sách tài khoản (Excel/PDF) để phát cho học sinh. GVCN có nút đặt lại mật khẩu.
- Học sinh CHỈ ĐỌC dữ liệu của mình: thời khóa biểu lớp, bài tập kèm hạn nộp, điểm danh của mình, điểm rèn luyện và xếp loại theo tuần, điểm số các môn, danh sách chép phạt và hạn nộp, sơ đồ chỗ ngồi.
- Học sinh được bấm "Đã làm xong" trên bài tập. Trạng thái này chỉ là "chờ xác nhận". GVBM xác nhận cuối cùng thì mới tính là đã nộp. Quá hạn mà chưa được xác nhận thì sinh chép phạt.
- Học sinh không sửa được gì ngoài đổi mật khẩu và bấm "Đã làm xong".
- Giao diện cổng học sinh riêng, đơn giản, ưu tiên điện thoại (route /hoc-sinh).
- Bảo vệ dữ liệu trẻ vị thành niên: rate limit đăng nhập, khóa tạm sau nhiều lần sai, có trang chính sách bảo mật và điều khoản, không thu thập dữ liệu thừa.

# Thanh toán & gói thuê bao
- Giáo viên dùng thử miễn phí N ngày (cấu hình, mặc định 30). Sau đó cần gói trả phí để tiếp tục sửa dữ liệu. Giá và chu kỳ (tháng/năm) để trong collection Plan, cấu hình được, CHƯA hard-code.
- Hết hạn: chuyển sang chế độ chỉ xem + xuất dữ liệu. Tuyệt đối không khóa hay xóa dữ liệu.
- Cổng thanh toán trong nước: MoMo, ZaloPay, VNPay. Thiết kế interface PaymentProvider với 3 adapter: createPayment(order), verifyCallback(payload), queryStatus(orderId). Thêm cổng mới không được sửa code nghiệp vụ.
- Collection: Plan, Subscription (userId, planId, status, currentPeriodEnd), PaymentOrder (provider, amount, status, providerTxnId, rawPayload, createdAt).
- Webhook/IPN của từng cổng: kiểm chữ ký (HMAC) trước khi tin, đối chiếu số tiền với đơn hàng, xử lý IDEMPOTENT (nhận lặp không cộng thời hạn hai lần), lưu rawPayload để đối soát. Thêm endpoint cho client quay lại sau thanh toán và tra lại trạng thái từ cổng.
- Chạy sandbox của cả 3 cổng ở môi trường dev. Khóa API đặt trong biến môi trường, không commit. Ghi rõ trong docs những giấy tờ cần có để lên production với từng cổng.
- Bản đầu gia hạn thủ công theo kỳ trả trước, chưa làm trừ tiền tự động định kỳ.
- Guard SubscriptionGuard áp cho các thao tác ghi của giáo viên. Admin được miễn.

# Mô hình dữ liệu gợi ý (Mongoose)
User (role, email/username, passwordHash, mustChangePassword, studentId?), SchoolYear, Semester, Class (code, name, schoolYearId), Position, Student (classId, fullName, dob, status ACTIVE|TRANSFERRED, transferDate, transferReason), Holiday (start, end, type LE|DOT_XUAT|KHAC), TimetableSlot (positionId, dayOfWeek, period, effectiveFrom, effectiveTo), PpctItem, LessonLog (sổ báo giảng, cờ done), AttendanceRecord, ConductCatalog (lỗi/điểm cộng, điểm số, cấu hình được), ConductLog, Homework (positionId, title, note, dueDate), HomeworkSubmission (studentId, studentDone, teacherConfirmed), Punishment (chép phạt), GradeColumn + GradeValue, SeatingChart (classId, effectiveFrom, seats), ParentNotice, Plan, Subscription, PaymentOrder, AuditLog.
Tham chiếu bằng ObjectId. Tạo index cho các truy vấn theo classId, positionId, studentId, ngày. Không xóa cứng học sinh, dùng status.

# Nghiệp vụ cần cài đúng
1. Lịch năm học: khai báo ngày nghỉ (nghỉ lễ / đột xuất bão lũ / khác). Thẻ thống kê: tổng ngày nghỉ, nghỉ lễ, nghỉ đột xuất, số ngày dạy còn lại (trừ Chủ nhật và ngày nghỉ; Thứ Bảy tính là ngày học nếu cấu hình bật).
2. PPCT: cột Tuần, Bài học, Số tiết, Tiết thứ, Yêu cầu cần đạt, Ghi chú. Ba loại tiết: CK đánh số 1,2,3...; TC đánh số TC1,TC2...; CĐ đánh số CĐ1,CĐ2.... Số tiết/tuần đổi được theo giai đoạn. v1: nhập tay + import Excel theo file mẫu, có màn hình xem trước để sửa trước khi lưu. Import Word/PDF để phase sau.
3. Engine khớp tiết: lấy các tiết của môn trong TKB theo từng tuần, trừ ngày nghỉ, rải lần lượt các tiết PPCT vào. Đổi TKB hoặc thêm ngày nghỉ thì tính lại từ ngày hiệu lực. Cho giáo viên kéo chỉnh tay sau khi khớp tự động. Viết test cho ít nhất 10 kịch bản (nghỉ giữa tuần, đổi TKB, tiết TC/CĐ xen kẽ, đổi số tiết/tuần).
4. Sổ báo giảng: xem theo lớp/tuần hoặc theo tuần của tất cả các lớp, tích "Đã thực hiện".
5. Thời khóa biểu: lưới tuần kiểu Google Calendar (cột giờ bên trái, 6 cột Thứ 2 đến Thứ 7, ô màu theo môn, cột hôm nay nổi bật), có điều hướng tuần trước/sau và lọc tháng/năm. v1 chỉ 1 bản TKB hiện hành, schema vẫn giữ effectiveFrom/effectiveTo để mở rộng.
6. Điểm danh: Có mặt (mặc định) / Phép / Muộn / Không phép. Lưu theo ngày, xem lại ngày cũ, thống kê.
7. Vi phạm & điểm cộng: danh mục cấu hình được, có ô tìm nhanh khi gõ. Mục "Khác" cho nhập điểm tùy ý (trừ 1 đến 50, cộng 1 đến 30).
8. Xếp loại rèn luyện theo tuần/tháng/học kỳ: mỗi tuần bắt đầu 100 điểm, cộng/trừ theo nhật ký, cho vượt 100. Ngưỡng: >=95 Xuất sắc; 90-94 Tốt; 80-89 Khá; 65-79 Đạt; 50-64 Cần rèn luyện; <50 Chưa đạt.
9. Chép phạt: tự sinh khi học sinh có từ 2 lỗi bất kỳ trong tuần (mức mặc định, cấu hình được). Riêng lỗi "Không làm BTVN" tính theo số lần lặp lại của chính lỗi đó: lần 1 chép 20, lần 2 chép 30, lần 3 chép 40, từ lần 4 chép 50 và gắn cờ báo phụ huynh. GV chỉnh số lần từ 1 đến 100. Hạn mặc định +2 ngày. Trạng thái Chưa nộp / Đã nộp / Nộp muộn. Bài tập quá hạn mà chưa được GVBM xác nhận thì tự tạo mục chép phạt (scheduled job).
10. Bài tập: GVBM giao theo lớp kèm hạn nộp, đánh dấu và xác nhận từng học sinh. Bấm vào bài là sửa được ngay.
11. Sổ điểm (Thông tư 22): chọn lớp, chọn môn. Cột TX (số cột cấu hình theo môn), GK, CK. Mỗi điểm lưu thêm ngày cho điểm và hình thức (vấn đáp, bài tập, dự án...). ĐTBmhk = (tổng TX + 2*GK + 3*CK) / (số cột TX + 5). Có xếp loại học lực Giỏi/Khá/Trung bình/Yếu. GVCN sửa được tất cả các môn trong lớp.
12. Vòng quay may mắn: random ưu tiên học sinh chưa được gọi trong tuần, xem được danh sách các buổi trước. Quay xong cho điểm ngay (vào cột TX trống kế tiếp, hết cột thì tự thêm cột "Vấn đáp") hoặc Thưởng/Phạt 1 chạm (ghi vào nhật ký vi phạm/điểm cộng).
13. Sơ đồ chỗ ngồi: kéo-thả (có phương án bấm-chọn cho điện thoại), hiển thị STT + họ tên (ngày sinh tùy chọn), lưu theo "áp dụng từ ngày" để giữ lịch sử, có in. Sơ đồ lớp học bộ môn của GVBM: làm ở phase sau.
14. Thông báo phụ huynh: tạo theo ngày/tuần/tháng/học kỳ từ nhật ký vi phạm/điểm cộng, xuất Word/PDF. Nội dung và chữ ký GVCN làm template mẫu tạm, dễ chỉnh.

# Giao diện (đã có bản demo, bám theo)
- shadcn/ui là bộ component nền. Chỉnh theme qua CSS variables trong globals.css theo bảng màu Binance trên NỀN TRẮNG: vàng #F0B90B cho nút chính/mục đang chọn; sidebar tối #1E2329 (chữ #B7BDC6, mục active chữ vàng + vạch vàng bên trái); viền #EAECEF; chữ #1E2329, chữ phụ #848E9C; xanh #0ECB81 (có mặt/điểm cộng); đỏ #F6465D (vi phạm/vắng); vàng đậm #D0980B cho hover.
- Nút chính bo tròn pill chữ đen; card bo 10px viền mảnh + bóng nhẹ; số liệu dùng font mono (IBM Plex Mono); tiêu đề IBM Plex Sans; thân Inter.
- Sidebar trái nhóm theo: Tổng quan / Nền tảng / Kế hoạch dạy học / Lớp học hằng ngày / Học tập / Khác, mỗi mục có icon line đơn giản. Trên điện thoại sidebar thu thành drawer.
- Ô tìm kiếm có icon kính lúp SVG nằm trong ô (không dùng emoji).
- Redux: auth slice, RTK Query cho API, cache theo tag để cập nhật danh sách sau khi ghi.

# Phases (dừng lại chờ duyệt sau mỗi phase)
Phase 0: khởi tạo monorepo, docker-compose (Mongo replica set), schema Mongoose, CI cơ bản, layout + theme shadcn.
Phase 1: đăng ký/đăng nhập, Admin, lớp + mã lớp, cơ chế Position (nhận/ngừng phụ trách/gán lại, có transaction), hồ sơ học sinh (+ import Excel, đánh dấu chuyển đi), guard phân quyền + test phân quyền.
Phase 2: điểm danh, vi phạm/điểm cộng, xếp loại rèn luyện, chép phạt, dashboard.
Phase 3: lịch năm học, PPCT (+ import Excel), TKB kiểu Google Calendar, engine khớp tiết, sổ báo giảng.
Phase 4: sổ điểm, bài tập + hạn nộp + tự chuyển chép phạt, vòng quay, sơ đồ chỗ ngồi, thông báo phụ huynh.
Phase 5: cổng học sinh (tạo tài khoản hàng loạt, đổi mật khẩu lần đầu, các màn hình chỉ đọc, "Đã làm xong").
Phase 6: thanh toán và thuê bao (Plan, Subscription, 3 adapter MoMo/ZaloPay/VNPay chạy sandbox, webhook idempotent, SubscriptionGuard, màn hình gói và hóa đơn).
Phase 7: PWA, xuất file, sao lưu, bảo mật (rate limit, validate, audit log), tối ưu hiệu năng, hướng dẫn deploy.

# Yêu cầu phi chức năng
- Dữ liệu học sinh là dữ liệu cá nhân của người chưa thành niên: HTTPS, băm mật khẩu (argon2/bcrypt), tách dữ liệu theo quyền, audit log cho thao tác sửa/xóa, sao lưu MongoDB hằng ngày.
- Mở sổ báo giảng cả học kỳ dưới 2 giây; tính lại khi đổi TKB dưới 5 giây.
- Mọi API có validate và trả lỗi tiếng Việt thân thiện.