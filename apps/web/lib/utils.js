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
