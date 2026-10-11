// Helper ngày/tuần/tháng cho lịch năm học, PPCT, TKB và sổ báo giảng (Phase 3).
//
// Giá trị ngày nội bộ là chuỗi 'yyyy-mm-dd'. Backend lưu ngày ở 00:00 UTC nên MỌI phép tính ở đây dùng số học
// UTC (Date.UTC / getUTC*): getter giờ địa phương sẽ lùi hoặc tiến 1 ngày tuỳ múi giờ trình duyệt (lỗi Critical
// của sub-project 3). Cũng KHÔNG đưa chuỗi tuỳ ý cho `new Date(...)`: parser của JS "đoán" chuỗi rác ('1' thành
// 2001-01-01) và cuộn ngày không tồn tại ('2026-02-30' thành 02/03/2026), nên toDateOnly kiểm lịch chặt trước.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// yyyy-mm-dd rồi hết chuỗi (ngày thuần) hoặc 'T' (ISO có giờ, vd 2026-01-08T00:00:00.000Z).
const DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})(T|$)/;

export const HOLIDAY_TYPE_LABELS = { LE: 'Nghỉ lễ', DOT_XUAT: 'Nghỉ đột xuất', KHAC: 'Khác' };

function formatUtcDate(date) {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Chỉ nhận chuỗi ĐÃ chuẩn hoá (đầu ra của toDateOnly), trả Date mốc 00:00 UTC.
function parseDateOnly(dateOnly) {
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

// Chuẩn hoá chuỗi ISO của backend / yyyy-mm-dd / Date về 'yyyy-mm-dd' theo UTC; không hợp lệ trả ''.
export function toDateOnly(value) {
  if (!value) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : formatUtcDate(value);
  if (typeof value !== 'string') return '';

  const match = DATE_PREFIX.exec(value);
  if (!match) return '';
  const [, yearText, monthText, dayText, suffix] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  // Date.UTC cuộn ngày không tồn tại sang tháng sau: so lại từng thành phần để loại 30/02, tháng 13...
  const probe = new Date(Date.UTC(year, month - 1, day));
  const isRealCalendarDay =
    probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
  if (!isRealCalendarDay) return '';

  if (suffix === '') return `${yearText}-${monthText}-${dayText}`;
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? '' : formatUtcDate(instant);
}

export function shiftDateOnly(dateStr, deltaDays) {
  const dateOnly = toDateOnly(dateStr);
  if (!dateOnly) return '';
  const shifted = new Date(parseDateOnly(dateOnly).getTime() + deltaDays * MS_PER_DAY);
  return Number.isNaN(shifted.getTime()) ? '' : formatUtcDate(shifted);
}

// Tuần = Thứ Hai → Chủ Nhật. Chủ Nhật thuộc tuần của Thứ Hai NGAY TRƯỚC nó (khớp resolveWeekStart ở backend).
export function getWeekStart(dateStr) {
  const dateOnly = toDateOnly(dateStr);
  if (!dateOnly) return '';
  // getUTCDay(): 0 = Chủ nhật … 6 = Thứ bảy.
  const daysSinceMonday = (parseDateOnly(dateOnly).getUTCDay() + 6) % 7;
  return shiftDateOnly(dateOnly, -daysSinceMonday);
}

export function getWeekDays(weekStart, count = 6) {
  const first = toDateOnly(weekStart);
  if (!first) return [];
  return Array.from({ length: count }, (_, index) => shiftDateOnly(first, index));
}

export function formatDayMonth(dateStr) {
  const dateOnly = toDateOnly(dateStr);
  if (!dateOnly) return '';
  return `${dateOnly.slice(8, 10)}/${dateOnly.slice(5, 7)}`;
}

// dayOfWeek theo backend: 2–7 = Thứ 2…Thứ 7, 1 = Chủ nhật.
export function weekdayLabel(dayOfWeek) {
  if (dayOfWeek === 1) return 'Chủ nhật';
  if (Number.isInteger(dayOfWeek) && dayOfWeek >= 2 && dayOfWeek <= 7) return `Thứ ${dayOfWeek}`;
  return '';
}

// Tuần thuộc về tháng chứa THỨ NĂM của nó (quy tắc ISO-8601): tuần 29/12/2025–04/01/2026 thuộc tháng 1/2026.
// Cùng quy tắc với weekStartForMonth nên chọn tháng rồi đọc lại ra đúng tháng đó — bộ lọc tháng/năm không "quay vòng".
// Đầu vào không hợp lệ trả NaN thay vì ném lỗi để màn hình không bị trắng.
export function monthYearOfWeek(weekStart) {
  const thursday = shiftDateOnly(getWeekStart(weekStart), 3);
  if (!thursday) return { month: NaN, year: NaN };
  return { month: Number(thursday.slice(5, 7)), year: Number(thursday.slice(0, 4)) };
}

// Thứ Hai của tuần chứa Thứ Năm đầu tiên của tháng (month 1–12, year 4 chữ số; ngoài miền đó trả '').
export function weekStartForMonth(year, month) {
  const isValidYear = Number.isInteger(year) && year >= 1000 && year <= 9999;
  const isValidMonth = Number.isInteger(month) && month >= 1 && month <= 12;
  if (!isValidYear || !isValidMonth) return '';
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysToFirstThursday = (4 - firstOfMonth.getUTCDay() + 7) % 7;
  const firstThursday = formatUtcDate(new Date(Date.UTC(year, month - 1, 1 + daysToFirstThursday)));
  return shiftDateOnly(firstThursday, -3);
}

// effectiveTo null = tiết còn hiệu lực vô thời hạn. Ngày hoặc effectiveFrom không hợp lệ → false, không bao giờ
// coi là "mọi ngày".
export function isSlotActiveOn(slot, dateStr) {
  const date = toDateOnly(dateStr);
  const from = toDateOnly(slot?.effectiveFrom);
  if (!date || !from) return false;
  const to = toDateOnly(slot.effectiveTo);
  return date >= from && (to === '' || date <= to);
}
