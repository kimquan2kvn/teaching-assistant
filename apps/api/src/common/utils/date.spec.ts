import { BadRequestException } from '@nestjs/common';
import { parseDateOnly, getIsoWeekStart, getIsoWeekStartVN, addDays } from './date';

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

describe('getIsoWeekStartVN', () => {
  it('sáng sớm Thứ Hai theo giờ Việt Nam (UTC+7) không bị tính lùi về tuần trước', () => {
    // 2026-01-19 (UTC) là Thứ Hai. 06:00 giờ VN ngày đó = 2026-01-18T23:00:00Z — vẫn là Chủ Nhật theo UTC,
    // nhưng đã là sáng Thứ Hai ở Việt Nam. getIsoWeekStart thuần UTC sẽ tính nhầm thành tuần trước (12/1);
    // getIsoWeekStartVN phải nhận đúng đây là tuần có Thứ Hai 19/1.
    const earlyMondayVN = new Date('2026-01-18T23:00:00.000Z');
    expect(getIsoWeekStartVN(earlyMondayVN).toISOString()).toBe('2026-01-18T17:00:00.000Z');
    expect(getIsoWeekStart(earlyMondayVN).toISOString()).not.toBe(getIsoWeekStartVN(earlyMondayVN).toISOString());
  });

  it('giữa tuần vẫn tính đúng weekStart (quy đổi sang mốc 17:00 UTC Chủ Nhật trước đó)', () => {
    const wednesdayNoonVN = new Date('2026-01-21T05:00:00.000Z'); // 12:00 giờ VN Thứ Tư
    expect(getIsoWeekStartVN(wednesdayNoonVN).toISOString()).toBe('2026-01-18T17:00:00.000Z');
  });
});

describe('addDays', () => {
  it('cộng đúng số ngày kể cả qua ranh giới tháng', () => {
    expect(addDays(new Date('2026-01-30T00:00:00.000Z'), 2).toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });
});
