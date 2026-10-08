import { BadRequestException } from '@nestjs/common';
import { parseDateOnly, getIsoWeekStart } from './date';

describe('parseDateOnly', () => {
  it('parse đúng yyyy-mm-dd thành 00:00 UTC', () => {
    const d = parseDateOnly('2026-01-15');
    expect(d.toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  it('từ chối chuỗi không đúng định dạng hoặc ngày không hợp lệ', () => {
    expect(() => parseDateOnly('15/01/2026')).toThrow(BadRequestException);
    expect(() => parseDateOnly('2026-02-30')).toThrow(BadRequestException);
    expect(() => parseDateOnly('')).toThrow(BadRequestException);
  });
});

describe('getIsoWeekStart', () => {
  it('Chủ Nhật 23:59:59 UTC và Thứ Hai 00:00:00 UTC ngay sau đó rơi vào 2 tuần khác nhau', () => {
    // 2026-01-18 là Chủ Nhật, 2026-01-19 là Thứ Hai (xác nhận qua lịch ISO).
    const sunday = new Date('2026-01-18T23:59:59.000Z');
    const monday = new Date('2026-01-19T00:00:00.000Z');
    expect(getIsoWeekStart(sunday).toISOString()).not.toBe(getIsoWeekStart(monday).toISOString());
    expect(getIsoWeekStart(monday).toISOString()).toBe('2026-01-19T00:00:00.000Z');
  });

  it('bất kỳ ngày nào trong cùng 1 tuần ISO trả về cùng 1 weekStart', () => {
    const tuesday = new Date('2026-01-20T10:00:00.000Z');
    const sunday = new Date('2026-01-25T23:00:00.000Z');
    expect(getIsoWeekStart(tuesday).toISOString()).toBe(getIsoWeekStart(sunday).toISOString());
  });
});
