'use client';

import { useState } from 'react';
import { formatDayMonth, getWeekDays, getWeekStart, toDateOnly, weekdayLabel } from '@/lib/schedule';
import { cn } from '@/lib/utils';
import { LessonLogCard } from './lesson-log-card';

const NO_BUSY_IDS = new Set();
const NO_PENDING = new Map();
const CANNOT_EDIT = () => false;

// Tailwind chỉ nhận class viết nguyên văn nên số cột không được ghép chuỗi.
const GRID_CLASS = {
  6: 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6',
  7: 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-7',
};

function groupByDate(logs) {
  const groups = new Map();
  for (const log of logs) {
    const dateOnly = toDateOnly(log.date);
    if (!groups.has(dateOnly)) groups.set(dateOnly, []);
    groups.get(dateOnly).push(log);
  }
  return groups;
}

// Bảng tuần của sổ báo giảng: mỗi ngày một cột, thẻ buổi học kéo-thả HTML5 sang cột khác (máy tính; điện thoại dùng nút
// "Chuyển ngày" trên thẻ). Chỉ phát onDropLog — không tự đổi vị trí thẻ: cột chỉ đổi khi backend xác nhận và danh sách
// được tải lại, nên ngày không có tiết (400) hay ngày bị trùng (409) không để lại trạng thái sai trên bảng.
export function LessonWeekBoard({
  weekStart,
  today,
  logs,
  canEditLog = CANNOT_EDIT,
  busyIds = NO_BUSY_IDS,
  pending = NO_PENDING,
  showPosition = false,
  onToggleDone,
  onRequestMove,
  onDropLog,
}) {
  // Buổi đang được kéo nằm trong state (không đọc lại từ dataTransfer: jsdom/Safari không đáng tin ở dragover/drop).
  const [draggingLog, setDraggingLog] = useState(null);
  const [dropDate, setDropDate] = useState(null);

  const weekDays = getWeekDays(getWeekStart(weekStart), 7);
  const logsByDate = groupByDate(logs);
  // Chủ nhật không có tiết trong TKB; chỉ hiện cột khi có buổi rơi vào đó (vd chuyển tay) để không nuốt mất buổi nào.
  const columns = logsByDate.has(weekDays[6]) ? weekDays : weekDays.slice(0, 6);
  const todayDate = toDateOnly(today);

  function handleDragStart(event, log) {
    if (event.dataTransfer) {
      // Firefox chỉ bắt đầu kéo khi dataTransfer có dữ liệu.
      event.dataTransfer.setData('text/plain', log._id);
      event.dataTransfer.effectAllowed = 'move';
    }
    setDraggingLog(log);
  }

  function handleDragEnd() {
    setDraggingLog(null);
    setDropDate(null);
  }

  function handleDragOver(event, date) {
    // Không preventDefault thì trình duyệt không cho thả vào cột này.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    // Viền nổi bật chỉ cho cột có thể chuyển tới; cột ngày cũ của chính buổi đang kéo thì thả vào là không làm gì.
    const isMoveTarget = draggingLog && toDateOnly(draggingLog.date) !== date;
    if (isMoveTarget && dropDate !== date) setDropDate(date);
  }

  function handleDragLeave(event, date) {
    // dragleave cũng bắn khi con trỏ đi từ cột vào thẻ con của chính cột đó: chỉ bỏ viền khi thật sự rời cột.
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setDropDate((current) => (current === date ? null : current));
  }

  function handleDrop(event, date) {
    event.preventDefault();
    const log = draggingLog;
    handleDragEnd();
    if (!log) return;
    // Thả lại đúng ngày cũ là không làm gì: không gọi API (backend sẽ vẫn tính lại).
    if (toDateOnly(log.date) === date) return;
    onDropLog(log, date);
  }

  function getDragHandlers(log, isEditable) {
    if (!isEditable || busyIds.has(log._id)) return undefined;
    return { draggable: true, onDragStart: (event) => handleDragStart(event, log), onDragEnd: handleDragEnd };
  }

  return (
    <div className={GRID_CLASS[columns.length]}>
      {columns.map((date) => {
        const dayOfWeek = date === weekDays[6] ? 1 : weekDays.indexOf(date) + 2;
        const isToday = date === todayDate;
        const columnLogs = logsByDate.get(date) ?? [];

        return (
          <div
            key={date}
            data-column={date}
            onDragOver={(event) => handleDragOver(event, date)}
            onDragLeave={(event) => handleDragLeave(event, date)}
            onDrop={(event) => handleDrop(event, date)}
            className={cn(
              'flex min-h-24 flex-col gap-2 rounded-lg border border-border p-2',
              isToday && 'bg-brand-soft',
              dropDate === date && 'ring-2 ring-brand',
            )}
          >
            <h2 aria-current={isToday ? 'date' : undefined} className="font-heading text-sm font-semibold">
              {`${weekdayLabel(dayOfWeek)} ${formatDayMonth(date)}`}
            </h2>

            {columnLogs.length === 0 ? (
              <p className="py-4 text-center text-xs text-fg-muted">Không có buổi học</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {columnLogs.map((log) => {
                  const isEditable = canEditLog(log);
                  return (
                    <li key={log._id}>
                      <LessonLogCard
                        log={log}
                        canEdit={isEditable}
                        busy={busyIds.has(log._id)}
                        pendingDone={pending.get(log._id)}
                        showPosition={showPosition}
                        onToggleDone={onToggleDone}
                        onRequestMove={onRequestMove}
                        dragHandlers={getDragHandlers(log, isEditable)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
