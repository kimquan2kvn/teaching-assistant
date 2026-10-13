import {
  MAX_PERIODS_PER_DAY,
  MAX_PPCT_IMPORT_ROWS,
  MAX_PPCT_PERIOD_COUNT,
  MAX_PPCT_WEEK,
  PPCT_IMPORT_HEADERS,
  TIMETABLE_DAYS_OF_WEEK,
} from '@so-chu-nhiem/shared';

// CỔNG: apps/web import @so-chu-nhiem/shared qua packages/shared/dist. Nếu dist chưa build lại sau khi backend
// Phase 3 thêm hằng số, import thiếu export KHÔNG báo lỗi mà ra `undefined` âm thầm — mọi task FE dùng các hằng
// số này (PPCT, TKB, import Excel) sẽ sai ngầm. Test này fail cho tới khi chạy
// `pnpm --filter @so-chu-nhiem/shared run build` trên nhánh đã có backend Task 1 — đó là chủ đích.
describe('hằng số Phase 3 của @so-chu-nhiem/shared (cổng build)', () => {
  test('TIMETABLE_DAYS_OF_WEEK là Thứ 2 → Thứ 7 (Chủ nhật = 1 không bao giờ có tiết)', () => {
    expect(TIMETABLE_DAYS_OF_WEEK).toEqual([2, 3, 4, 5, 6, 7]);
  });

  test('MAX_PERIODS_PER_DAY = 10', () => {
    expect(MAX_PERIODS_PER_DAY).toBe(10);
  });

  test('MAX_PPCT_WEEK = 60', () => {
    expect(MAX_PPCT_WEEK).toBe(60);
  });

  test('MAX_PPCT_PERIOD_COUNT = 10', () => {
    expect(MAX_PPCT_PERIOD_COUNT).toBe(10);
  });

  test('MAX_PPCT_IMPORT_ROWS = 500', () => {
    expect(MAX_PPCT_IMPORT_ROWS).toBe(500);
  });

  test('PPCT_IMPORT_HEADERS là 6 tiêu đề cột của file mẫu import PPCT, đúng thứ tự', () => {
    expect(PPCT_IMPORT_HEADERS).toEqual(['Tuần', 'Bài học', 'Số tiết', 'Tiết thứ', 'Yêu cầu cần đạt', 'Ghi chú']);
  });
});
