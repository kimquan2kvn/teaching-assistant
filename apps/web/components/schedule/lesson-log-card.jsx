'use client';

import { useId } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getPeriodKind } from '@/lib/ppct';
import { getWeekDays, getWeekStart, toDateOnly, weekdayLabel } from '@/lib/schedule';
import { cn, formatDate } from '@/lib/utils';
import { getSubjectColor } from './subject-colors';

export const MISSING_ITEM_TITLE = 'Mục PPCT không còn tồn tại';

// dayOfWeek theo backend (2-7 = Thứ 2…Thứ 7, 1 = Chủ nhật) của một ngày yyyy-mm-dd; ngày không hợp lệ trả 0.
function dayOfWeekOf(dateOnly) {
  const index = getWeekDays(getWeekStart(dateOnly), 7).indexOf(dateOnly);
  if (index === -1) return 0;
  return index === 6 ? 1 : index + 2;
}

// Thẻ một buổi báo giảng. Người sửa được (canEdit) thấy checkbox + "Chuyển ngày"; người chỉ xem (GVCN) chỉ thấy trạng
// thái. dragHandlers do bảng tuần truyền vào (chỉ khi thẻ kéo được) và được gắn thẳng lên phần tử gốc.
export function LessonLogCard({
  log,
  canEdit = false,
  busy = false,
  pendingDone,
  showPosition = false,
  showDate = false,
  onToggleDone,
  onRequestMove,
  dragHandlers,
}) {
  const titleId = useId();
  const item = log.ppctItem;
  const title = item?.title ?? MISSING_ITEM_TITLE;
  const kind = getPeriodKind(item?.periodLabel);
  // `??` chứ không `||`: pendingDone = false (đang bỏ tích) phải thắng log.done = true.
  const isDone = pendingDone ?? log.done;
  const position = showPosition ? log.position : undefined;
  const color = position ? getSubjectColor(position.subject) : undefined;
  const dateOnly = toDateOnly(log.date);

  return (
    <div
      data-log-id={log._id}
      aria-busy={busy || undefined}
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-border bg-white p-3 text-sm shadow-sm',
        color?.cell,
        dragHandlers?.draggable && 'cursor-grab',
        busy && 'opacity-60',
      )}
      {...dragHandlers}
    >
      {position && (
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', color.dot)} />
          {`${position.className} · ${position.subject}`}
        </p>
      )}

      {showDate && dateOnly && (
        <p className="font-mono text-xs text-fg-muted">{`${weekdayLabel(dayOfWeekOf(dateOnly))}, ${formatDate(dateOnly)}`}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {kind && <Badge>{kind}</Badge>}
        {item && <span className="font-mono text-xs">{item.periodLabel}</span>}
        {item?.periodCount > 1 && <span className="text-xs text-fg-muted">{`${item.periodCount} tiết`}</span>}
        {log.isManuallyAdjusted && <Badge>Đã chỉnh tay</Badge>}
      </div>

      <p id={titleId} className={cn('font-medium', !item && 'italic text-fg-muted')}>
        {title}
      </p>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        {canEdit ? (
          <>
            <label className="flex min-h-8 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand"
                aria-label={`Đã thực hiện: ${title}`}
                checked={isDone}
                disabled={busy}
                onChange={(event) => onToggleDone(log, event.target.checked)}
              />
              <span>Đã thực hiện</span>
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              aria-describedby={titleId}
              onClick={() => onRequestMove(log)}
            >
              Chuyển ngày
            </Button>
          </>
        ) : (
          <Badge variant={isDone ? 'success' : 'muted'}>{isDone ? 'Đã thực hiện' : 'Chưa thực hiện'}</Badge>
        )}
      </div>
    </div>
  );
}
