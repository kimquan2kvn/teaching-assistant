import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Định dạng ngày kiểu Việt Nam dd/mm/yyyy, dùng cho các cột "Ngày sinh"/ngày tháng hiển thị trên UI.
// timeZone: 'UTC' để tránh lệch ngày: các ngày lưu DB (vd ngày sinh) là mốc UTC-midnight, nếu format theo
// giờ địa phương (múi giờ âm so với UTC) sẽ hiển thị lùi lại 1 ngày so với giá trị thật đã lưu.
export function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

// Tra ObjectId thô (chưa populate) ra tên hiển thị: dùng chung cho roster học sinh (_id → fullName) lẫn
// danh mục vi phạm (_id → label) — cùng 1 hình dạng bài toán, truyền tên field cần đọc làm tham số thứ 2.
export function buildIdNameMap(items, nameField) {
  const map = new Map();
  for (const item of items ?? []) {
    map.set(String(item._id), item[nameField]);
  }
  return map;
}

// Suy ra các vị trí (Position) trong 1 lớp mà currentUser ghi được, từ response useGetClassDetailQuery.
// ADMIN được quyền ghi vào BẤT KỲ vị trí nào nên trả nguyên mảng đầu vào; vai trò khác chỉ trả các vị trí mà
// chính họ đang giữ (holder.id === currentUser.id) — khớp @RequirePositionOwner('SELF') ở BE.
export function getMyPositionsInClass(positions, currentUser) {
  const all = positions ?? [];
  if (currentUser?.role === 'ADMIN') return all;
  if (!currentUser) return [];
  return all.filter((position) => position.holder?.id === currentUser.id);
}

// Ngày hôm nay theo giờ ĐỊA PHƯƠNG của trình duyệt (yyyy-mm-dd) — KHÔNG dùng new Date().toISOString() (UTC
// thuần): từ 00:00-07:00 giờ Việt Nam (UTC+7), toISOString() trả về NGÀY HÔM TRƯỚC, đúng lúc giáo viên điểm
// danh đầu giờ sáng — đã gây bug thật (phát hiện ở review sub-project 3): trang điểm danh mặc định sai ngày,
// lưu đè/xoá nhầm bản ghi của ngày trước đó.
export function todayDateOnly() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Hiển thị điểm có dấu: số dương thêm "+" phía trước, số âm giữ nguyên dấu "-" có sẵn, 0 → "0" (không thêm +).
export function formatSignedPoints(points) {
  if (points > 0) return `+${points}`;
  return String(points);
}

const FORBIDDEN_MESSAGE = 'Bạn không có quyền thực hiện thao tác này';
// 413 đến từ cả upload file (multer, giới hạn 5MB) lẫn body JSON (commit import) hoặc reverse proxy, nên câu dự phòng
// phải trung tính, không nhắc riêng "file" hay con số 5MB.
const PAYLOAD_TOO_LARGE_MESSAGE = 'Dữ liệu hoặc file gửi lên quá lớn';
const UNREADABLE_UPLOAD_MESSAGE = 'Không đọc được file tải lên, vui lòng chọn lại file';

function containsNonAscii(text) {
  return Array.from(text).some((char) => char.charCodeAt(0) > 0x7f);
}

// Thông báo lỗi hiển thị cho người dùng từ lỗi RTK Query (`err` của `.unwrap()`). 403 do guard của Nest trả
// message tiếng Anh ("Forbidden resource"), còn 403 do service chủ động ném (vd "Bạn không giữ vị trí này") đã là
// tiếng Việt: message có ký tự ngoài ASCII được coi là tiếng Việt và giữ nguyên, ngược lại thay bằng câu cố định.
// Cùng quy tắc cho 413 (multer trả "File too large"), kể cả khi reverse proxy chặn trước bằng trang HTML — khi đó
// RTK Query báo PARSING_ERROR và mã thật nằm ở `originalStatus`. Upload multipart hỏng, multer/busboy trả message
// tiếng Anh bắt đầu bằng "Multipart" (vd "Multipart: Boundary not found"), cũng đổi sang câu cố định.
// Mã khác: hiện nguyên văn message của backend; thiếu/rỗng/không phải chuỗi (lỗi mạng, ...) thì dùng `fallback`.
export function apiErrorMessage(err, fallback) {
  const message = err?.data?.message;
  const hasMessage = typeof message === 'string' && message !== '';
  const hasVietnameseMessage = hasMessage && containsNonAscii(message);
  if (err?.status === 403) {
    return hasVietnameseMessage ? message : FORBIDDEN_MESSAGE;
  }
  if (err?.status === 413 || err?.originalStatus === 413) {
    return hasVietnameseMessage ? message : PAYLOAD_TOO_LARGE_MESSAGE;
  }
  if (hasMessage && message.startsWith('Multipart')) return UNREADABLE_UPLOAD_MESSAGE;
  return hasMessage ? message : fallback;
}

function isPositionHolder(position, currentUser) {
  return Boolean(currentUser?.id) && position?.holder?.id === currentUser.id;
}

// Có hiện control SỬA PPCT/TKB/sổ báo giảng của vị trí này không (chỉ ẩn/hiện UI — backend vẫn là nơi chặn thật).
// ADMIN sửa mọi vị trí SUBJECT, GVBM chỉ sửa vị trí SUBJECT mình giữ (khớp @RequirePositionOwner('SELF')); vị trí
// HOMEROOM không có PPCT/TKB nên không ai sửa được, kể cả GVCN và ADMIN.
export function canEditPosition(position, currentUser) {
  if (!position || !currentUser) return false;
  if (position.type !== 'SUBJECT') return false;
  return currentUser.role === 'ADMIN' || isPositionHolder(position, currentUser);
}

// Các vị trí SUBJECT của 1 lớp (response useGetClassDetailQuery) mà currentUser ĐỌC được: ADMIN và GVCN của lớp
// đọc mọi môn, GVBM chỉ đọc môn mình giữ (môn khác backend trả 403 nên không đưa vào bộ chọn). Không bao giờ có
// HOMEROOM trong kết quả.
export function getReadableSubjectPositions(positions, currentUser) {
  if (!currentUser) return [];
  const all = positions ?? [];
  const subjects = all.filter((position) => position.type === 'SUBJECT');
  const isHomeroomHolder = all.some(
    (position) => position.type === 'HOMEROOM' && isPositionHolder(position, currentUser),
  );
  if (currentUser.role === 'ADMIN' || isHomeroomHolder) return subjects;
  return subjects.filter((position) => isPositionHolder(position, currentUser));
}
