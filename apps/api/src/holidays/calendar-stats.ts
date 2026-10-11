import { addDays, formatDateOnly, maxDate, minDate, toVnDayOfWeek } from '../common/utils/date';

export interface CalendarStatsInput {
  yearStart: Date;
  yearEnd: Date;
  asOf: Date;
  saturdayIsSchoolDay: boolean;
  holidays: Array<{ type: 'LE' | 'DOT_XUAT' | 'KHAC'; startDate: Date; endDate: Date }>;
}

export interface CalendarStats {
  totalHolidayDays: number;
  leHolidayDays: number;
  dotXuatHolidayDays: number;
  remainingTeachingDays: number;
}

const SATURDAY = 7;
const SUNDAY = 1;

// Đếm theo NGÀY LỊCH (hợp các khoảng, mỗi ngày 1 lần dù chồng nhiều ngày nghỉ), nên dùng Set theo từng loại.
// Ngày nghỉ vượt ngoài năm học bị cắt; Chủ Nhật nằm trong khoảng nghỉ vẫn được đếm vào tổng.
export function computeCalendarStats(input: CalendarStatsInput): CalendarStats {
  const { yearStart, yearEnd, asOf, saturdayIsSchoolDay, holidays } = input;

  const allDays = new Set<string>();
  const leDays = new Set<string>();
  const dotXuatDays = new Set<string>();

  for (const holiday of holidays) {
    const from = maxDate(holiday.startDate, yearStart);
    const to = minDate(holiday.endDate, yearEnd);
    for (let day = from; day.getTime() <= to.getTime(); day = addDays(day, 1)) {
      const key = formatDateOnly(day);
      allDays.add(key);
      if (holiday.type === 'LE') leDays.add(key);
      if (holiday.type === 'DOT_XUAT') dotXuatDays.add(key);
    }
  }

  let remainingTeachingDays = 0;
  const countFrom = maxDate(asOf, yearStart);
  for (let day = countFrom; day.getTime() <= yearEnd.getTime(); day = addDays(day, 1)) {
    const dayOfWeek = toVnDayOfWeek(day);
    const isSchoolWeekday = dayOfWeek !== SUNDAY && (dayOfWeek !== SATURDAY || saturdayIsSchoolDay);
    if (isSchoolWeekday && !allDays.has(formatDateOnly(day))) remainingTeachingDays += 1;
  }

  return {
    totalHolidayDays: allDays.size,
    leHolidayDays: leDays.size,
    dotXuatHolidayDays: dotXuatDays.size,
    remainingTeachingDays,
  };
}
