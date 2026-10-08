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

// Hiển thị điểm có dấu: số dương thêm "+" phía trước, số âm giữ nguyên dấu "-" có sẵn, 0 → "0" (không thêm +).
export function formatSignedPoints(points) {
  if (points > 0) return `+${points}`;
  return String(points);
}
