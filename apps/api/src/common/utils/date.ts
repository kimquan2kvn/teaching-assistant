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
