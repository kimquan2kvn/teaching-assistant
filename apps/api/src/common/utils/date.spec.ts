import { BadRequestException } from '@nestjs/common';
import {
  parseDateOnly,
  getIsoWeekStart,
  getIsoWeekStartVN,
  addDays,
  todayDateOnlyVN,
  toVnDayOfWeek,
  formatDateOnly,
  maxDate,
  minDate,
  resolveWeekStart,
} from './date';

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

describe('todayDateOnlyVN', () => {
  it('01:00 sáng Thứ Hai giờ VN (UTC vẫn là Chủ Nhật) ra đúng ngày Thứ Hai', () => {
    expect(todayDateOnlyVN(new Date('2026-01-11T18:00:00Z')).toISOString()).toBe('2026-01-12T00:00:00.000Z');
  });

  it('ranh giới nửa đêm giờ VN: 16:59:59Z còn trong ngày, 17:00:00Z sang ngày kế', () => {
    expect(todayDateOnlyVN(new Date('2026-01-12T16:59:59Z')).toISOString()).toBe('2026-01-12T00:00:00.000Z');
    expect(todayDateOnlyVN(new Date('2026-01-12T17:00:00Z')).toISOString()).toBe('2026-01-13T00:00:00.000Z');
  });

  it('không truyền now thì dùng giờ hiện tại, kết quả luôn là 00:00:00 UTC', () => {
    const today = todayDateOnlyVN();
    expect(today.getUTCHours()).toBe(0);
    expect(today.getUTCMinutes()).toBe(0);
    expect(today.getUTCSeconds()).toBe(0);
    expect(today.getUTCMilliseconds()).toBe(0);
  });
});

describe('toVnDayOfWeek', () => {
  it('Thứ Hai = 2, Thứ Bảy = 7, Chủ Nhật = 1', () => {
    expect(toVnDayOfWeek(parseDateOnly('2026-01-05'))).toBe(2);
    expect(toVnDayOfWeek(parseDateOnly('2026-01-10'))).toBe(7);
    expect(toVnDayOfWeek(parseDateOnly('2026-01-11'))).toBe(1);
  });
});

describe('formatDateOnly', () => {
  it('trả yyyy-mm-dd từ phần UTC của ngày', () => {
    expect(formatDateOnly(new Date('2026-01-05T00:00:00Z'))).toBe('2026-01-05');
  });
});

describe('maxDate / minDate', () => {
  const earlier = new Date('2026-01-05T00:00:00Z');
  const later = new Date('2026-01-12T00:00:00Z');

  it('trả đúng ngày lớn hơn / nhỏ hơn, không phụ thuộc thứ tự tham số', () => {
    expect(maxDate(earlier, later)).toBe(later);
    expect(maxDate(later, earlier)).toBe(later);
    expect(minDate(earlier, later)).toBe(earlier);
    expect(minDate(later, earlier)).toBe(earlier);
  });
});

describe('resolveWeekStart', () => {
  const sundayEveningUtc = new Date('2026-01-11T18:00:00Z'); // 01:00 sáng Thứ Hai 12/01 giờ VN

  it('không truyền raw thì lấy Thứ Hai của tuần chứa "hôm nay" theo giờ VN (không lùi về tuần trước)', () => {
    expect(resolveWeekStart(undefined, sundayEveningUtc).toISOString()).toBe('2026-01-12T00:00:00.000Z');
    expect(resolveWeekStart('', sundayEveningUtc).toISOString()).toBe('2026-01-12T00:00:00.000Z');
  });

  it('raw giữa tuần được chuẩn hóa về Thứ Hai', () => {
    expect(resolveWeekStart('2026-01-14', sundayEveningUtc).toISOString()).toBe('2026-01-12T00:00:00.000Z');
  });

  it('Chủ Nhật thuộc về tuần kết thúc vào ngày đó', () => {
    expect(resolveWeekStart('2026-01-18', sundayEveningUtc).toISOString()).toBe('2026-01-12T00:00:00.000Z');
  });

  it('raw sai định dạng hoặc ngày không tồn tại thì ném BadRequestException tiếng Việt', () => {
    expect(() => resolveWeekStart('2026-02-30', sundayEveningUtc)).toThrow(BadRequestException);
    expect(() => resolveWeekStart('2026-02-30', sundayEveningUtc)).toThrow(
      'Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd',
    );
    expect(() => resolveWeekStart('19/01/2026', sundayEveningUtc)).toThrow(BadRequestException);
  });
});
