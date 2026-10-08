import { BadRequestException } from '@nestjs/common';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateOnly(input: string): Date {
  const match = DATE_ONLY_PATTERN.exec(input ?? '');
  if (!match) {
    throw new BadRequestException('Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd');
  }
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const rolledOver =
    date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d);
  if (rolledOver) {
    throw new BadRequestException('Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd');
  }
  return date;
}

export function getIsoWeekStart(date: Date): Date {
  const isoDay = date.getUTCDay() === 0 ? 7 : date.getUTCDay(); // Chủ Nhật (0) -> 7, Thứ Hai -> 1
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - (isoDay - 1));
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

// Dùng cho mốc thời gian SERVER ghi nhận ("bây giờ"), KHÔNG dùng cho 1 chuỗi ngày (yyyy-mm-dd) người dùng tự
// chọn — chuỗi ngày đã là 1 ngày lịch không mơ hồ, không cần quy đổi múi giờ. `getIsoWeekStart` thuần UTC tính
// sai cho khoảng 00:00-07:00 giờ Việt Nam mỗi sáng Thứ Hai (vẫn còn là Chủ Nhật theo UTC) — hàm này quy đổi
// sang giờ Việt Nam (UTC+7) trước khi tìm ranh giới tuần, rồi quy đổi ngược lại thành mốc UTC thật.
export function getIsoWeekStartVN(date: Date): Date {
  const shifted = new Date(date.getTime() + VIETNAM_UTC_OFFSET_MS);
  const weekStartShifted = getIsoWeekStart(shifted);
  return new Date(weekStartShifted.getTime() - VIETNAM_UTC_OFFSET_MS);
}
