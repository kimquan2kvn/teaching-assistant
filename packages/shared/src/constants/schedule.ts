// dayOfWeek theo getUTCDay()+1: Thứ Hai=2 ... Thứ Bảy=7. Chủ Nhật=1 không bao giờ là ngày học.
export const TIMETABLE_DAYS_OF_WEEK = [2, 3, 4, 5, 6, 7] as const;
export const MAX_PERIODS_PER_DAY = 10;
export const MAX_PPCT_WEEK = 60;
export const MAX_PPCT_PERIOD_COUNT = 10;
export const MAX_PPCT_IMPORT_ROWS = 500;
export const PPCT_IMPORT_HEADERS = ['Tuần', 'Bài học', 'Số tiết', 'Tiết thứ', 'Yêu cầu cần đạt', 'Ghi chú'] as const;
