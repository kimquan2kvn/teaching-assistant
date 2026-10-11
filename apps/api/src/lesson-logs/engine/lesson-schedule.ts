import { addDays, toVnDayOfWeek } from '../../common/utils/date';

export interface Cell {
  date: Date;
  period: number;
}
export interface ScheduleSlot {
  dayOfWeek: number;
  period: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}
export interface ScheduleHoliday {
  startDate: Date;
  endDate: Date;
}
export interface SchedulePpctItem {
  id: string;
  order: number;
  periodCount: number;
}
export interface KeptLog {
  ppctItemId: string;
  date: Date;
  // Log bị khóa (isManuallyAdjusted/done). Mặc định true; chỉ log được giữ vì date < fromDate mà chưa khóa mới truyền false.
  locked?: boolean;
}
export interface ScheduleInput {
  fromDate: Date;
  yearEnd: Date;
  slots: ScheduleSlot[];
  holidays: ScheduleHoliday[];
  ppctItems: SchedulePpctItem[];
  keptLogs: KeptLog[];
}
export interface ScheduledLesson {
  ppctItemId: string;
  date: Date;
}

const cellsNeeded = (item: SchedulePpctItem): number => Math.max(1, item.periodCount);

export function buildCells(args: { slots: ScheduleSlot[]; holidays: ScheduleHoliday[]; from: Date; to: Date }): Cell[] {
  const { slots, holidays, from, to } = args;
  const cells: Cell[] = [];
  for (let day = new Date(from); day.getTime() <= to.getTime(); day = addDays(day, 1)) {
    const time = day.getTime();
    const isHoliday = holidays.some((h) => h.startDate.getTime() <= time && time <= h.endDate.getTime());
    if (isHoliday) continue;

    const dayOfWeek = toVnDayOfWeek(day);
    const periods = new Set<number>();
    for (const slot of slots) {
      const isEffective =
        slot.dayOfWeek === dayOfWeek &&
        slot.effectiveFrom.getTime() <= time &&
        (slot.effectiveTo === null || time <= slot.effectiveTo.getTime());
      if (isEffective) periods.add(slot.period);
    }
    for (const period of [...periods].sort((a, b) => a - b)) {
      cells.push({ date: day, period });
    }
  }
  return cells;
}

// LessonLog không lưu tiết (chỉ có date) nên ô bị log chiếm được suy ra từ date: lấy `periodCount` ô tự do đầu tiên có
// date >= log.date, theo thứ tự (date, order của mục) — log cùng ngày chiếm lần lượt các tiết của ngày đó.
// Log khóa nằm trên ngày không còn ô (vd vừa thành ngày nghỉ) tự trôi sang ô tự do kế tiếp; `date` đã lưu không bị sửa.
// Log không khóa (`locked: false`, chỉ được giữ vì date < fromDate) do chính engine xếp nên ngày của nó luôn có ô; nếu
// không còn (TKB bị đổi ngoài luồng) thì nó không chiếm ô nào, để không trôi sang đẩy log khác vào các ô sau fromDate.
export function reserveKeptLogs(
  cells: Cell[],
  keptLogs: KeptLog[],
  ppctItems: SchedulePpctItem[],
): { freeCells: Cell[]; placements: Map<string, Cell> } {
  const itemById = new Map(ppctItems.map((item) => [item.id, item]));
  const logs = keptLogs
    .filter((log) => itemById.has(log.ppctItemId))
    .sort((a, b) => a.date.getTime() - b.date.getTime() || itemById.get(a.ppctItemId)!.order - itemById.get(b.ppctItemId)!.order);

  const occupied = new Set<number>();
  const placements = new Map<string, Cell>();
  for (const log of logs) {
    const firstIndex = firstCellIndexOnOrAfter(cells, log.date);
    const hasCellOnItsDate = firstIndex < cells.length && cells[firstIndex].date.getTime() === log.date.getTime();
    if (log.locked === false && !hasCellOnItsDate) continue;

    let remaining = cellsNeeded(itemById.get(log.ppctItemId)!);
    for (let i = firstIndex; i < cells.length && remaining > 0; i++) {
      if (occupied.has(i)) continue;
      occupied.add(i);
      remaining--;
      if (!placements.has(log.ppctItemId)) placements.set(log.ppctItemId, cells[i]);
    }
  }

  return { freeCells: cells.filter((_, i) => !occupied.has(i)), placements };
}

function firstCellIndexOnOrAfter(cells: Cell[], date: Date): number {
  let low = 0;
  let high = cells.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (cells[mid].date.getTime() < date.getTime()) low = mid + 1;
    else high = mid;
  }
  return low;
}

// Chỉ trả các mục MỚI cần xếp. Mọi log được giữ (kể cả log chưa khóa có date < fromDate) coi là "đã xếp" để
// engine không xếp lại mục đó (tránh vi phạm unique (positionId, ppctItemId) khi insert).
// Ô được dựng từ ngày sớm nhất của log được giữ (không chỉ từ fromDate) để log nhiều tiết bắt đầu trước fromDate vẫn
// chiếm các ô sau fromDate của nó; mục mới chỉ được rải vào ô tự do có date >= fromDate.
// Mục không đủ ô tự do liên tiếp thì DỪNG hẳn — các mục sau không được xếp để giữ đúng thứ tự `order`.
// Engine không đọc saturdayIsSchoolDay: slot do giáo viên khai báo là nguồn đúng, cờ chỉ dùng cho thẻ thống kê.
export function computeLessonSchedule(input: ScheduleInput): ScheduledLesson[] {
  const { fromDate, yearEnd, slots, holidays, ppctItems, keptLogs } = input;
  const earliestKeptDate = keptLogs.reduce((earliest, log) => (log.date.getTime() < earliest.getTime() ? log.date : earliest), fromDate);
  const cells = buildCells({ slots, holidays, from: earliestKeptDate, to: yearEnd });
  const { freeCells } = reserveKeptLogs(cells, keptLogs, ppctItems);
  const assignableCells = freeCells.filter((cell) => cell.date.getTime() >= fromDate.getTime());

  const alreadyPlaced = new Set(keptLogs.map((log) => log.ppctItemId));
  const pending = ppctItems.filter((item) => !alreadyPlaced.has(item.id)).sort((a, b) => a.order - b.order);

  const scheduled: ScheduledLesson[] = [];
  let cursor = 0;
  for (const item of pending) {
    const needed = cellsNeeded(item);
    if (cursor + needed > assignableCells.length) break;
    scheduled.push({ ppctItemId: item.id, date: new Date(assignableCells[cursor].date) });
    cursor += needed;
  }
  return scheduled;
}
