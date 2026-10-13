import { Check } from 'lucide-react';
import { MAX_PERIODS_PER_DAY } from '@so-chu-nhiem/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  formatDayMonth,
  getWeekDays,
  getWeekStart,
  isSlotActiveOn,
  toDateOnly,
  weekdayLabel,
} from '@/lib/schedule';
import { cn } from '@/lib/utils';
import { getSubjectColor } from './subject-colors';

const PERIODS = Array.from({ length: MAX_PERIODS_PER_DAY }, (_, index) => index + 1);
// Tiêu đề, nhãn tiết và mọi ô cùng một chiều cao cố định để các cột thẳng hàng với cột nhãn bên trái.
const ROW_HEIGHT = 'h-16';
const CELL_BASE = 'overflow-hidden border-b border-l-4 px-1.5 py-1 text-xs';

// Cột thứ i của lưới (0 = Thứ Hai) ứng với dayOfWeek = i + 2 theo backend (2 = Thứ 2 … 7 = Thứ 7).
const dayOfWeekAt = (index) => index + 2;

// Ngày nghỉ phủ ngày `date` khi start <= date <= end; ngày hỏng/thiếu không bao giờ được coi là phủ mọi ngày.
function holidaysOn(holidays, date) {
  return holidays.filter((holiday) => {
    const start = toDateOnly(holiday.startDate);
    const end = toDateOnly(holiday.endDate);
    return start !== '' && end !== '' && start <= date && date <= end;
  });
}

function buildColumn({ date, dayOfWeek, slots, lessonLogs, holidays }) {
  const dayHolidays = holidaysOn(holidays, date);
  const isHoliday = dayHolidays.length > 0;
  const daySlots = slots.filter((slot) => slot.dayOfWeek === dayOfWeek && isSlotActiveOn(slot, date));

  // LessonLog không có trường tiết: tên bài gắn vào ô có tiết NHỎ NHẤT của vị trí đó trong ngày (nhiều bài cùng ngày
  // cùng nằm ở ô đó). Ngày nghỉ không có buổi học nên không gắn tên bài.
  const firstPeriodByPosition = new Map();
  for (const slot of daySlots) {
    const known = firstPeriodByPosition.get(slot.positionId);
    if (known === undefined || slot.period < known) firstPeriodByPosition.set(slot.positionId, slot.period);
  }
  const logsByPosition = new Map();
  if (!isHoliday) {
    for (const log of lessonLogs) {
      if (toDateOnly(log.date) !== date) continue;
      const logs = logsByPosition.get(log.positionId) ?? [];
      logs.push(log);
      logsByPosition.set(log.positionId, logs);
    }
  }

  const cells = PERIODS.map((period) => ({
    period,
    entries: daySlots
      .filter((slot) => slot.period === period)
      .map((slot) => ({
        slot,
        logs: firstPeriodByPosition.get(slot.positionId) === period ? (logsByPosition.get(slot.positionId) ?? []) : [],
      })),
  }));
  return { date, dayOfWeek, holidays: dayHolidays, isHoliday, cells };
}

function LessonLine({ log }) {
  const title = log.ppctItem?.title;
  if (!title) return null;
  return (
    <span className="flex items-center gap-1 text-[11px] leading-tight">
      <span className="truncate" title={title}>
        {title}
      </span>
      {log.done && (
        <span role="img" aria-label="Đã thực hiện" className="shrink-0">
          <Check className="h-3 w-3" aria-hidden="true" />
        </span>
      )}
    </span>
  );
}

function EntryText({ entry }) {
  const { slot, logs } = entry;
  return (
    <>
      <span className="block truncate font-semibold">{slot.position?.subject}</span>
      <span className="block truncate">{slot.position?.className}</span>
      {logs.map((log) => (
        <LessonLine key={log._id} log={log} />
      ))}
    </>
  );
}

function GridCell({ date, period, entries, isHoliday }) {
  const cellProps = { 'data-date': date, 'data-period': period };

  if (entries.length === 0) {
    return <div {...cellProps} className={cn(ROW_HEIGHT, 'border-b border-border')} />;
  }

  // Ngày nghỉ: 1 khối "Nghỉ" trung tính cho cả ô, không hiện môn.
  if (isHoliday) {
    return (
      <div {...cellProps} className={cn(ROW_HEIGHT, CELL_BASE, getSubjectColor(undefined).cell)}>
        <span className="block font-medium">Nghỉ</span>
      </div>
    );
  }

  if (entries.length === 1) {
    const [entry] = entries;
    return (
      <div {...cellProps} className={cn(ROW_HEIGHT, CELL_BASE, getSubjectColor(entry.slot.position?.subject).cell)}>
        <EntryText entry={entry} />
      </div>
    );
  }

  // Nhiều vị trí cùng ô (dữ liệu trùng giờ): xếp chồng, mỗi khối màu theo môn của nó.
  return (
    <div {...cellProps} className={cn(ROW_HEIGHT, 'flex flex-col overflow-hidden border-b border-border text-xs')}>
      {entries.map((entry) => (
        <div
          key={entry.slot._id}
          className={cn(
            'min-h-0 flex-1 overflow-hidden border-l-4 border-t px-1.5 py-0.5 first:border-t-0',
            getSubjectColor(entry.slot.position?.subject).cell,
          )}
        >
          <EntryText entry={entry} />
        </div>
      ))}
    </div>
  );
}

function DayHeader({ date, dayOfWeek, isToday, holidays }) {
  return (
    <div
      data-date={date}
      aria-current={isToday ? 'date' : undefined}
      className={cn(
        ROW_HEIGHT,
        'flex flex-col items-center gap-0.5 overflow-hidden border-b border-border px-1 py-1 text-center',
        isToday && 'bg-brand text-black',
      )}
    >
      <div className="leading-tight">
        <span className="block text-sm font-semibold">{weekdayLabel(dayOfWeek)}</span>{' '}
        <span className="block font-mono text-xs">{formatDayMonth(date)}</span>
      </div>
      {holidays.map((holiday) => (
        // `block`: dấu "…" của truncate không áp dụng cho Badge mặc định (inline-flex) nên tên ngày nghỉ dài sẽ bị cắt cụt.
        <Badge
          key={holiday._id}
          variant={holiday.type === 'DOT_XUAT' ? 'danger' : 'muted'}
          className="block max-w-full truncate"
          title={holiday.name}
        >
          {holiday.name}
        </Badge>
      ))}
    </div>
  );
}

// Lưới tuần kiểu Google Calendar: cột trái "Tiết 1…10", 6 cột Thứ 2–Thứ 7. Thuần trình bày: ngày hôm nay và ngày đang
// xem do trang truyền vào, lưới không tự đọc đồng hồ. Dưới `md` chỉ hiện một cột (`focusedDate`), đổi bằng nút T2…T7.
export function TimetableGrid({
  weekStart,
  today,
  slots = [],
  lessonLogs = [],
  holidays = [],
  focusedDate,
  onFocusDate,
}) {
  const days = getWeekDays(getWeekStart(weekStart));
  if (days.length === 0) return null;

  const todayDate = toDateOnly(today);
  // focusedDate ngoài tuần (vd còn giữ ngày của tuần trước) thì hiện cột đầu tuần, không để điện thoại trống trơn.
  const focused = days.includes(toDateOnly(focusedDate)) ? toDateOnly(focusedDate) : days[0];
  const columns = days.map((date, index) =>
    buildColumn({ date, dayOfWeek: dayOfWeekAt(index), slots, lessonLogs, holidays }),
  );

  return (
    <Card
      role="region"
      aria-label={`Thời khóa biểu tuần ${formatDayMonth(days[0])} – ${formatDayMonth(days[days.length - 1])}`}
      className="overflow-x-auto bg-white shadow-none"
    >
      <div className="md:min-w-[608px]">
        <div className="flex gap-1 border-b border-border p-2 md:hidden">
          {days.map((date, index) => (
            <Button
              key={date}
              type="button"
              size="sm"
              variant={date === focused ? 'default' : 'outline'}
              aria-label={`Xem ${weekdayLabel(dayOfWeekAt(index))}`}
              aria-pressed={date === focused}
              className="flex-1 px-0"
              onClick={() => onFocusDate?.(date)}
            >
              {`T${dayOfWeekAt(index)}`}
            </Button>
          ))}
        </div>

        <div className="flex">
          <div className="w-16 shrink-0 md:w-20">
            <div className={cn(ROW_HEIGHT, 'border-b border-border')} />
            {PERIODS.map((period) => (
              <div
                key={period}
                className={cn(
                  ROW_HEIGHT,
                  'flex items-start justify-end border-b border-border px-1.5 pt-1 font-mono text-xs text-fg-muted',
                )}
              >
                {`Tiết ${period}`}
              </div>
            ))}
          </div>

          {columns.map((column) => (
            <div
              key={column.date}
              data-column={column.date}
              className={cn(
                'min-w-0 flex-1 flex-col border-l border-border',
                column.date === focused ? 'flex' : 'hidden md:flex',
                column.date === todayDate && 'bg-brand-soft',
              )}
            >
              <DayHeader
                date={column.date}
                dayOfWeek={column.dayOfWeek}
                isToday={column.date === todayDate}
                holidays={column.holidays}
              />
              {column.cells.map((cell) => (
                <GridCell
                  key={cell.period}
                  date={column.date}
                  period={cell.period}
                  entries={cell.entries}
                  isHoliday={column.isHoliday}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
