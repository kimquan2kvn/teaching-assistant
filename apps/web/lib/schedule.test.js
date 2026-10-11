import {
  HOLIDAY_TYPE_LABELS,
  formatDayMonth,
  getWeekDays,
  getWeekStart,
  isSlotActiveOn,
  monthYearOfWeek,
  shiftDateOnly,
  toDateOnly,
  weekStartForMonth,
  weekdayLabel,
} from './schedule';

// Mốc đã kiểm: 2026-01-05 là Thứ Hai, 2026-01-01 là Thứ Năm, 2026-01-18 là Chủ Nhật.

describe('toDateOnly', () => {
  test('ISO 00:00 UTC của backend → đúng ngày, không lùi/tiến theo múi giờ trình duyệt', () => {
    expect(toDateOnly('2026-01-08T00:00:00.000Z')).toBe('2026-01-08');
  });

  test('ISO cuối ngày UTC (23:30Z) vẫn thuộc ngày đó — getter giờ địa phương UTC+7 sẽ nhảy sang ngày sau', () => {
    expect(toDateOnly('2026-01-08T23:30:00.000Z')).toBe('2026-01-08');
  });

  test('chuỗi yyyy-mm-dd giữ nguyên', () => {
    expect(toDateOnly('2026-01-08')).toBe('2026-01-08');
  });

  test('Date mốc UTC → yyyy-mm-dd theo UTC', () => {
    expect(toDateOnly(new Date(Date.UTC(2026, 0, 8)))).toBe('2026-01-08');
  });

  test('rỗng / null / undefined / chuỗi rác → chuỗi rỗng', () => {
    expect(toDateOnly('')).toBe('');
    expect(toDateOnly(null)).toBe('');
    expect(toDateOnly(undefined)).toBe('');
    expect(toDateOnly('abc')).toBe('');
  });

  test('Date không hợp lệ → chuỗi rỗng', () => {
    expect(toDateOnly(new Date('abc'))).toBe('');
  });

  test('ngày không tồn tại trên lịch → chuỗi rỗng, KHÔNG bị cuộn sang ngày khác (parser của JS cuộn 30/02 thành 02/03)', () => {
    expect(toDateOnly('2026-02-30')).toBe('');
    expect(toDateOnly('2026-02-30T00:00:00.000Z')).toBe('');
    expect(toDateOnly('2026-13-01')).toBe('');
    expect(toDateOnly('2026-00-10')).toBe('');
    expect(toDateOnly('2025-02-29')).toBe('');
  });

  test('29/02 năm nhuận hợp lệ', () => {
    expect(toDateOnly('2028-02-29')).toBe('2028-02-29');
  });

  test('chuỗi không có dạng yyyy-mm-dd mà parser JS vẫn "đoán" được (vd "1" → 2001) → chuỗi rỗng', () => {
    expect(toDateOnly('1')).toBe('');
    expect(toDateOnly('2026')).toBe('');
    expect(toDateOnly('01/02/2026')).toBe('');
  });
});

describe('shiftDateOnly', () => {
  test('lùi 1 ngày', () => {
    expect(shiftDateOnly('2026-01-12', -1)).toBe('2026-01-11');
  });

  test('qua ranh giới năm', () => {
    expect(shiftDateOnly('2026-12-31', 1)).toBe('2027-01-01');
  });

  test('qua ranh giới tháng 2 năm thường', () => {
    expect(shiftDateOnly('2026-02-28', 1)).toBe('2026-03-01');
  });

  test('năm nhuận có 29/02', () => {
    expect(shiftDateOnly('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftDateOnly('2028-02-29', 1)).toBe('2028-03-01');
  });

  test('delta 0 và delta lớn', () => {
    expect(shiftDateOnly('2026-01-12', 0)).toBe('2026-01-12');
    expect(shiftDateOnly('2026-01-01', 365)).toBe('2027-01-01');
  });

  test('nhận cả ISO của backend', () => {
    expect(shiftDateOnly('2026-01-12T00:00:00.000Z', 1)).toBe('2026-01-13');
  });

  test('đi qua các ngày chuyển giờ mùa hè (Mỹ/Châu Âu) vẫn ra từng ngày liên tiếp', () => {
    expect([0, 1, 2, 3].map((i) => shiftDateOnly('2026-03-07', i))).toEqual([
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
    ]);
    expect([0, 1, 2].map((i) => shiftDateOnly('2026-03-28', i))).toEqual(['2026-03-28', '2026-03-29', '2026-03-30']);
    expect([0, 1, 2].map((i) => shiftDateOnly('2026-10-24', i))).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
    expect([0, 1, 2].map((i) => shiftDateOnly('2026-10-31', i))).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
  });

  test('đầu vào không hợp lệ → chuỗi rỗng', () => {
    expect(shiftDateOnly('', 1)).toBe('');
    expect(shiftDateOnly('abc', 1)).toBe('');
    expect(shiftDateOnly('2026-01-12', NaN)).toBe('');
  });
});

describe('getWeekStart', () => {
  test.each([
    ['Thứ Hai → chính nó', '2026-01-12', '2026-01-12'],
    ['Thứ Tư', '2026-01-14', '2026-01-12'],
    ['Thứ Bảy', '2026-01-17', '2026-01-12'],
    ['Chủ Nhật thuộc tuần của Thứ Hai ngay trước nó', '2026-01-18', '2026-01-12'],
    ['Thứ Hai tuần kế', '2026-01-19', '2026-01-19'],
    ['tuần chứa 01/01 bắt đầu từ năm trước', '2026-01-01', '2025-12-29'],
    ['Chủ Nhật 04/01 vẫn thuộc tuần bắt đầu 29/12', '2026-01-04', '2025-12-29'],
  ])('%s: %s → %s', (_label, input, expected) => {
    expect(getWeekStart(input)).toBe(expected);
  });

  test('nhận cả ISO của backend', () => {
    expect(getWeekStart('2026-01-14T00:00:00.000Z')).toBe('2026-01-12');
  });

  test('đầu vào không hợp lệ → chuỗi rỗng', () => {
    expect(getWeekStart('')).toBe('');
    expect(getWeekStart('abc')).toBe('');
  });
});

describe('getWeekDays', () => {
  test('mặc định 6 ngày Thứ 2 → Thứ 7', () => {
    expect(getWeekDays('2026-01-12')).toEqual([
      '2026-01-12',
      '2026-01-13',
      '2026-01-14',
      '2026-01-15',
      '2026-01-16',
      '2026-01-17',
    ]);
  });

  test('count = 7 kết thúc ở Chủ Nhật', () => {
    const days = getWeekDays('2026-01-12', 7);
    expect(days).toHaveLength(7);
    expect(days[6]).toBe('2026-01-18');
  });

  test('tuần đi qua ngày chuyển giờ mùa hè vẫn đủ 7 ngày liên tiếp', () => {
    expect(getWeekDays('2026-03-02', 7)).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
    ]);
  });

  test('weekStart không hợp lệ → mảng rỗng', () => {
    expect(getWeekDays('')).toEqual([]);
    expect(getWeekDays('abc')).toEqual([]);
  });
});

describe('formatDayMonth', () => {
  test("'2026-01-05' → '05/01'", () => {
    expect(formatDayMonth('2026-01-05')).toBe('05/01');
  });

  test('nhận ISO của backend, không lùi ngày', () => {
    expect(formatDayMonth('2026-12-31T00:00:00.000Z')).toBe('31/12');
  });

  test('đầu vào không hợp lệ → chuỗi rỗng', () => {
    expect(formatDayMonth('')).toBe('');
    expect(formatDayMonth('abc')).toBe('');
  });
});

describe('weekdayLabel', () => {
  test('2–7 là Thứ 2…Thứ 7, 1 là Chủ nhật', () => {
    expect(weekdayLabel(2)).toBe('Thứ 2');
    expect(weekdayLabel(7)).toBe('Thứ 7');
    expect(weekdayLabel(1)).toBe('Chủ nhật');
  });

  test('ngoài 1–7 hoặc không phải số nguyên → chuỗi rỗng', () => {
    expect(weekdayLabel(0)).toBe('');
    expect(weekdayLabel(8)).toBe('');
    expect(weekdayLabel(2.5)).toBe('');
    expect(weekdayLabel(undefined)).toBe('');
  });
});

describe('monthYearOfWeek', () => {
  test('tuần thuộc tháng chứa Thứ Năm của nó', () => {
    // Tuần 29/12/2025 – 04/01/2026 có Thứ Năm 01/01/2026 → tháng 1/2026 (không phải tháng 12/2025).
    expect(monthYearOfWeek('2025-12-29')).toEqual({ month: 1, year: 2026 });
    expect(monthYearOfWeek('2026-01-12')).toEqual({ month: 1, year: 2026 });
    // Tuần 30/03 – 05/04/2026 có Thứ Năm 02/04 → tháng 4.
    expect(monthYearOfWeek('2026-03-30')).toEqual({ month: 4, year: 2026 });
  });

  test('ngày bất kỳ trong tuần quy về tuần của nó (Thứ Bảy 31/01 thuộc tuần có Thứ Năm 29/01 → tháng 1)', () => {
    expect(monthYearOfWeek('2026-01-31')).toEqual({ month: 1, year: 2026 });
  });

  test('đầu vào không hợp lệ → NaN, không ném lỗi (không làm trắng trang)', () => {
    expect(monthYearOfWeek('abc')).toEqual({ month: NaN, year: NaN });
  });
});

describe('weekStartForMonth', () => {
  test('tuần chứa Thứ Năm đầu tiên của tháng', () => {
    expect(weekStartForMonth(2026, 1)).toBe('2025-12-29');
    expect(weekStartForMonth(2026, 2)).toBe('2026-02-02');
    expect(weekStartForMonth(2026, 9)).toBe('2026-08-31');
    expect(weekStartForMonth(2027, 1)).toBe('2027-01-04');
  });

  test('tháng ngoài 1–12 hoặc năm không phải số nguyên → chuỗi rỗng (không cuộn sang năm khác)', () => {
    expect(weekStartForMonth(2026, 0)).toBe('');
    expect(weekStartForMonth(2026, 13)).toBe('');
    expect(weekStartForMonth(2026, 1.5)).toBe('');
    expect(weekStartForMonth(NaN, 1)).toBe('');
  });

  test('năm 2 chữ số (Date.UTC tự hiểu thành 19xx) → chuỗi rỗng, không trả tuần của thế kỷ trước', () => {
    expect(weekStartForMonth(26, 1)).toBe('');
  });

  test('KHÔNG quay vòng: với mọi năm 2024–2028 và tháng 1–12, tháng ↔ tuần khứ hồi đúng và luôn ra Thứ Hai', () => {
    for (let year = 2024; year <= 2028; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const weekStart = weekStartForMonth(year, month);
        expect({ year, month, result: monthYearOfWeek(weekStart) }).toEqual({
          year,
          month,
          result: { month, year },
        });
        expect({ year, month, isMonday: getWeekStart(weekStart) === weekStart }).toEqual({
          year,
          month,
          isMonday: true,
        });
      }
    }
  });
});

describe('isSlotActiveOn', () => {
  const openEnded = { effectiveFrom: '2026-01-05T00:00:00.000Z', effectiveTo: null };
  const closed = { effectiveFrom: '2026-01-05T00:00:00.000Z', effectiveTo: '2026-01-18T00:00:00.000Z' };

  test('chưa có ngày kết thúc: trước ngày hiệu lực false, đúng ngày hiệu lực và về sau true', () => {
    expect(isSlotActiveOn(openEnded, '2026-01-04')).toBe(false);
    expect(isSlotActiveOn(openEnded, '2026-01-05')).toBe(true);
    expect(isSlotActiveOn(openEnded, '2030-01-01')).toBe(true);
  });

  test('có ngày kết thúc: ngày kết thúc còn hiệu lực, hôm sau thì hết', () => {
    expect(isSlotActiveOn(closed, '2026-01-18')).toBe(true);
    expect(isSlotActiveOn(closed, '2026-01-19')).toBe(false);
  });

  test('nhận effectiveFrom/effectiveTo dạng yyyy-mm-dd và ngày kiểm tra dạng ISO', () => {
    const slot = { effectiveFrom: '2026-01-05', effectiveTo: '2026-01-18' };
    expect(isSlotActiveOn(slot, '2026-01-18T00:00:00.000Z')).toBe(true);
    expect(isSlotActiveOn(slot, '2026-01-19T00:00:00.000Z')).toBe(false);
  });

  test('ngày kiểm tra hoặc effectiveFrom không hợp lệ → false (không coi là "mọi ngày")', () => {
    expect(isSlotActiveOn(openEnded, '')).toBe(false);
    expect(isSlotActiveOn(openEnded, 'abc')).toBe(false);
    expect(isSlotActiveOn({ effectiveFrom: '', effectiveTo: null }, '2026-01-05')).toBe(false);
    expect(isSlotActiveOn(undefined, '2026-01-05')).toBe(false);
  });
});

describe('HOLIDAY_TYPE_LABELS', () => {
  test('nhãn tiếng Việt cho 3 loại ngày nghỉ', () => {
    expect(HOLIDAY_TYPE_LABELS.DOT_XUAT).toBe('Nghỉ đột xuất');
    expect(HOLIDAY_TYPE_LABELS).toEqual({ LE: 'Nghỉ lễ', DOT_XUAT: 'Nghỉ đột xuất', KHAC: 'Khác' });
  });
});
