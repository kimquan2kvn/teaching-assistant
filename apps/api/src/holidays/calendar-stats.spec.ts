import { CalendarStatsInput, computeCalendarStats } from './calendar-stats';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const holiday = (type: 'LE' | 'DOT_XUAT' | 'KHAC', start: string, end: string) => ({
  type,
  startDate: d(start),
  endDate: d(end),
});

// Năm học nhỏ 2026-01-05 (Thứ Hai) .. 2026-01-18 (Chủ Nhật): 10 ngày Thứ Hai-Thứ Sáu,
// 2 Thứ Bảy (01-10, 01-17), 2 Chủ Nhật (01-11, 01-18).
const run = (over: Partial<CalendarStatsInput> = {}) =>
  computeCalendarStats({
    yearStart: d('2026-01-05'),
    yearEnd: d('2026-01-18'),
    asOf: d('2026-01-05'),
    saturdayIsSchoolDay: false,
    holidays: [],
    ...over,
  });

describe('computeCalendarStats', () => {
  it('1. nghỉ lễ + nghỉ đột xuất tách rời: đếm từng loại và số ngày dạy còn lại', () => {
    const holidays = [holiday('LE', '2026-01-08', '2026-01-09'), holiday('DOT_XUAT', '2026-01-12', '2026-01-13')];
    expect(run({ holidays })).toEqual({ totalHolidayDays: 4, leHolidayDays: 2, dotXuatHolidayDays: 2, remainingTeachingDays: 6 });
    expect(run({ holidays, saturdayIsSchoolDay: true })).toEqual({
      totalHolidayDays: 4,
      leHolidayDays: 2,
      dotXuatHolidayDays: 2,
      remainingTeachingDays: 8,
    });
  });

  it('2. hai ngày nghỉ khác loại chồng nhau chỉ tính 1 lần vào tổng (hợp kéo qua Chủ Nhật)', () => {
    const holidays = [holiday('LE', '2026-01-08', '2026-01-10'), holiday('DOT_XUAT', '2026-01-09', '2026-01-11')];
    // Hợp = 01-08..01-11 (Thứ Năm, Sáu, Bảy, Chủ Nhật) = 4 ngày; mỗi loại 3 ngày.
    expect(run({ holidays })).toEqual({ totalHolidayDays: 4, leHolidayDays: 3, dotXuatHolidayDays: 3, remainingTeachingDays: 8 });
    expect(run({ holidays, saturdayIsSchoolDay: true })).toEqual({
      totalHolidayDays: 4,
      leHolidayDays: 3,
      dotXuatHolidayDays: 3,
      remainingTeachingDays: 9,
    });
  });

  it('3. hai ngày nghỉ cùng loại chồng nhau chỉ tính 1 lần vào loại đó', () => {
    const holidays = [holiday('LE', '2026-01-08', '2026-01-09'), holiday('LE', '2026-01-09', '2026-01-12')];
    // Hợp = 01-08..01-12 (Thứ Năm, Sáu, Bảy, Chủ Nhật, Thứ Hai) = 5 ngày; trừ 3 ngày Thứ Hai-Thứ Sáu (08, 09, 12).
    expect(run({ holidays })).toEqual({ totalHolidayDays: 5, leHolidayDays: 5, dotXuatHolidayDays: 0, remainingTeachingDays: 7 });
  });

  it('4. loại KHAC chỉ vào tổng và số ngày dạy còn lại, không vào lễ/đột xuất', () => {
    const holidays = [holiday('KHAC', '2026-01-14', '2026-01-14')];
    expect(run({ holidays })).toEqual({ totalHolidayDays: 1, leHolidayDays: 0, dotXuatHolidayDays: 0, remainingTeachingDays: 9 });
    expect(run({ holidays, saturdayIsSchoolDay: true })).toEqual({
      totalHolidayDays: 1,
      leHolidayDays: 0,
      dotXuatHolidayDays: 0,
      remainingTeachingDays: 11,
    });
  });

  it('5. ngày nghỉ vượt ngoài năm học bị cắt theo khoảng năm học', () => {
    const result = run({ holidays: [holiday('LE', '2026-01-16', '2026-01-25')] });
    // Còn 01-16..01-18 (Thứ Sáu, Bảy, Chủ Nhật) = 3 ngày; chỉ Thứ Sáu 01-16 trừ vào ngày dạy.
    expect(result).toEqual({ totalHolidayDays: 3, leHolidayDays: 3, dotXuatHolidayDays: 0, remainingTeachingDays: 9 });
  });

  it('6. ngày nghỉ nằm trước đầu năm học bị cắt phía đầu', () => {
    const result = run({ holidays: [holiday('LE', '2026-01-01', '2026-01-06')] });
    // Còn 01-05..01-06 (Thứ Hai, Thứ Ba) = 2 ngày.
    expect(result).toEqual({ totalHolidayDays: 2, leHolidayDays: 2, dotXuatHolidayDays: 0, remainingTeachingDays: 8 });
  });

  it('7. ngày nghỉ hoàn toàn ngoài năm học không được tính', () => {
    const holidays = [holiday('LE', '2025-12-20', '2025-12-31'), holiday('DOT_XUAT', '2026-02-01', '2026-02-03')];
    expect(run({ holidays })).toEqual({ totalHolidayDays: 0, leHolidayDays: 0, dotXuatHolidayDays: 0, remainingTeachingDays: 10 });
  });

  it('8. chỉ có ngày nghỉ rơi vào Chủ Nhật: tính vào tổng nhưng không trừ số ngày dạy', () => {
    const result = run({ holidays: [holiday('LE', '2026-01-11', '2026-01-11')] });
    expect(result).toEqual({ totalHolidayDays: 1, leHolidayDays: 1, dotXuatHolidayDays: 0, remainingTeachingDays: 10 });
  });

  it('9. không có ngày nghỉ: thẻ thống kê toàn 0, số ngày dạy theo cờ Thứ Bảy', () => {
    expect(run()).toEqual({ totalHolidayDays: 0, leHolidayDays: 0, dotXuatHolidayDays: 0, remainingTeachingDays: 10 });
    expect(run({ saturdayIsSchoolDay: true })).toEqual({
      totalHolidayDays: 0,
      leHolidayDays: 0,
      dotXuatHolidayDays: 0,
      remainingTeachingDays: 12,
    });
  });

  it('10. asOf giữa năm học: đếm từ asOf (tính cả asOf) đến hết năm học', () => {
    expect(run({ asOf: d('2026-01-12') }).remainingTeachingDays).toBe(5);
    expect(run({ asOf: d('2026-01-12'), saturdayIsSchoolDay: true }).remainingTeachingDays).toBe(6);
  });

  it('11. asOf sau cuối năm học: không còn ngày dạy', () => {
    expect(run({ asOf: d('2026-01-19') }).remainingTeachingDays).toBe(0);
    expect(run({ asOf: d('2026-01-19'), saturdayIsSchoolDay: true }).remainingTeachingDays).toBe(0);
  });

  it('12. asOf trước đầu năm học: tính từ đầu năm học', () => {
    expect(run({ asOf: d('2025-12-01') }).remainingTeachingDays).toBe(10);
    expect(run({ asOf: d('2025-12-01'), saturdayIsSchoolDay: true }).remainingTeachingDays).toBe(12);
  });

  it('13. ngày nghỉ trước asOf vẫn tính vào tổng nhưng không ảnh hưởng số ngày dạy còn lại', () => {
    const result = run({ asOf: d('2026-01-12'), holidays: [holiday('LE', '2026-01-08', '2026-01-09')] });
    expect(result).toEqual({ totalHolidayDays: 2, leHolidayDays: 2, dotXuatHolidayDays: 0, remainingTeachingDays: 5 });
  });

  it('14. ngày nghỉ rơi đúng asOf bị trừ khỏi số ngày dạy còn lại', () => {
    const result = run({ asOf: d('2026-01-12'), holidays: [holiday('DOT_XUAT', '2026-01-12', '2026-01-12')] });
    expect(result).toEqual({ totalHolidayDays: 1, leHolidayDays: 0, dotXuatHolidayDays: 1, remainingTeachingDays: 4 });
  });

  it('15. ngày nghỉ Thứ Bảy chỉ trừ số ngày dạy khi Thứ Bảy là ngày học', () => {
    const holidays = [holiday('LE', '2026-01-10', '2026-01-10')];
    expect(run({ holidays }).remainingTeachingDays).toBe(10);
    expect(run({ holidays, saturdayIsSchoolDay: true }).remainingTeachingDays).toBe(11);
  });
});
