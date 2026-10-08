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
- **Auth thật**: chưa làm ở Phase 0 (thuộc Phase 1). `apps/api` Phase 0 chỉ có module gốc + 1 endpoint health check.
