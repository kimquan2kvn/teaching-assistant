import {
  MAX_PERIODS_PER_DAY,
  MAX_PPCT_IMPORT_ROWS,
  MAX_PPCT_PERIOD_COUNT,
  MAX_PPCT_WEEK,
  PPCT_IMPORT_HEADERS,
  TIMETABLE_DAYS_OF_WEEK,
} from './schedule';

describe('hằng số TKB/PPCT', () => {
  it('TKB chỉ có Thứ Hai (2) đến Thứ Bảy (7); Chủ Nhật (1) không phải ngày học', () => {
    expect([...TIMETABLE_DAYS_OF_WEEK]).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('giới hạn tiết/tuần/số dòng import đúng quyết định đã duyệt', () => {
    expect(MAX_PERIODS_PER_DAY).toBe(10);
    expect(MAX_PPCT_WEEK).toBe(60);
    expect(MAX_PPCT_PERIOD_COUNT).toBe(10);
    expect(MAX_PPCT_IMPORT_ROWS).toBe(500);
  });

  it('header file mẫu import PPCT đúng thứ tự cột của brief', () => {
    expect([...PPCT_IMPORT_HEADERS]).toEqual(['Tuần', 'Bài học', 'Số tiết', 'Tiết thứ', 'Yêu cầu cần đạt', 'Ghi chú']);
  });
});
