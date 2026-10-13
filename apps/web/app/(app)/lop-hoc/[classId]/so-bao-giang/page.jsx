'use client';

import { useId, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useGetClassDetailQuery } from '@/lib/store/classes-api';
import { useGetPositionLessonLogsQuery } from '@/lib/store/lesson-logs-api';
import { selectCurrentUser } from '@/lib/store/auth-slice';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { LessonLogCard } from '@/components/schedule/lesson-log-card';
import { LessonLogFeedback } from '@/components/schedule/lesson-log-feedback';
import { LessonWeekBoard } from '@/components/schedule/lesson-week-board';
import { useLessonLogActions, useMoveLogFlow } from '@/components/schedule/use-lesson-log-actions';
import { useSelectedPosition } from '@/components/schedule/use-selected-position';
import { WeekNav } from '@/components/schedule/week-nav';
import { getWeekStart, shiftDateOnly, toDateOnly } from '@/lib/schedule';
import {
  apiErrorMessage,
  canEditPosition,
  formatDate,
  getReadableSubjectPositions,
  todayDateOnly,
} from '@/lib/utils';

const MODES = [
  { value: 'week', label: 'Theo tuần' },
  { value: 'all', label: 'Toàn bộ' },
];

const EMPTY_MESSAGE =
  'Chưa có buổi báo giảng nào. Hãy nhập PPCT và khai báo thời khóa biểu của môn để hệ thống tự xếp ngày dạy.';
const EMPTY_WEEK_MESSAGE =
  'Tuần này không có buổi học nào. Kiểm tra PPCT và thời khóa biểu của môn nếu bạn mong đợi có buổi.';

// Nhóm theo Thứ Hai của tuần chứa buổi học: Chủ nhật thuộc tuần của Thứ Hai ngay trước nó (getWeekStart lo việc đó).
function groupByWeek(logs) {
  const weeks = new Map();
  for (const log of logs) {
    const weekStart = getWeekStart(toDateOnly(log.date));
    if (!weeks.has(weekStart)) weeks.set(weekStart, []);
    weeks.get(weekStart).push(log);
  }
  return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b));
}

// Chế độ "Toàn bộ": mọi buổi của môn, nhóm theo tuần. Không kéo-thả (cả học kỳ không vừa một bảng) — dùng "Chuyển ngày".
function AllLogsList({ logs, canEdit, busyIds, pending, onToggleDone, onRequestMove }) {
  const weeks = useMemo(() => groupByWeek(logs), [logs]);

  return (
    <div className="mt-4 flex flex-col gap-6">
      {weeks.map(([weekStart, weekLogs]) => (
        <section key={weekStart}>
          <h2 className="font-heading text-base font-semibold">
            {`Tuần ${formatDate(weekStart)} – ${formatDate(shiftDateOnly(weekStart, 6))}`}
          </h2>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {weekLogs.map((log) => (
              <li key={log._id}>
                <LessonLogCard
                  log={log}
                  canEdit={canEdit}
                  busy={busyIds.has(log._id)}
                  pendingDone={pending.get(log._id)}
                  showDate
                  onToggleDone={onToggleDone}
                  onRequestMove={onRequestMove}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function PageMessage({ children }) {
  return (
    <div className="p-6">
      <h1 className="font-heading text-xl font-semibold">{children}</h1>
    </div>
  );
}

export default function ClassLessonLogsPage({ params, searchParams }) {
  const { classId } = params;
  const currentUser = useSelector(selectCurrentUser);
  const { data: detail, isLoading, isError, error } = useGetClassDetailQuery(classId);

  const subjectSelectId = useId();
  const [mode, setMode] = useState('week');
  const [weekStart, setWeekStart] = useState(() => getWeekStart(todayDateOnly()));

  // Môn lấy theo quyền đọc: GVCN/ADMIN thấy mọi môn, GVBM chỉ môn mình giữ (môn khác backend trả 403).
  const positions = useMemo(
    () => getReadableSubjectPositions(detail?.positions, currentUser),
    [detail, currentUser],
  );
  const { positionId, position, setPositionId } = useSelectedPosition({
    positions,
    currentUser,
    initialId: searchParams?.positionId,
  });

  // "Toàn bộ" không gửi from/to; "Theo tuần" gửi đủ Thứ Hai → Chủ Nhật (7 ngày: Chủ nhật vẫn có thể chứa buổi chuyển tay).
  const logsArgs =
    mode === 'week' ? { positionId, from: weekStart, to: shiftDateOnly(weekStart, 6) } : { positionId };
  const logsQuery = useGetPositionLessonLogsQuery(logsArgs, { skip: !positionId });
  // Vừa đổi tuần thì `data` còn là của tuần trước: chỉ dùng currentData, nếu không các buổi cũ sẽ rơi ra ngoài cột
  // của tuần mới (bảng trông như "tuần không có buổi nào") trong lúc tải.
  const logs = logsQuery.currentData ?? (logsQuery.isFetching ? undefined : logsQuery.data);

  const actions = useLessonLogActions({
    listFetch: { isFetching: Boolean(logsQuery.isFetching), startedTimeStamp: logsQuery.startedTimeStamp },
  });
  const flow = useMoveLogFlow(actions);

  // Providers khôi phục user bất đồng bộ: user null là "chưa biết" chứ chưa phải "không giữ môn nào".
  if (isLoading || !currentUser) {
    return (
      <div role="status" className="p-6 text-fg-muted">
        Đang tải...
      </div>
    );
  }

  if (isError) {
    if (error?.status === 403) return <PageMessage>Bạn không có quyền xem lớp này</PageMessage>;
    if (error?.status === 404) return <PageMessage>Không tìm thấy lớp</PageMessage>;
    return <PageMessage>{apiErrorMessage(error, 'Không tải được thông tin lớp, vui lòng thử lại')}</PageMessage>;
  }

  if (positions.length === 0) {
    return <PageMessage>Bạn chưa giữ môn nào trong lớp này</PageMessage>;
  }

  const canEdit = canEditPosition(position, currentUser);
  const today = todayDateOnly();
  const isWeekMode = mode === 'week';

  function handlePositionChange(event) {
    flow.clearFeedback();
    setPositionId(event.target.value);
  }

  function handleModeChange(nextMode) {
    flow.clearFeedback();
    setMode(nextMode);
  }

  function handleWeekChange(nextWeekStart) {
    flow.clearFeedback();
    setWeekStart(nextWeekStart);
  }

  function renderLogs() {
    if (logsQuery.isError) {
      return (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>
            {apiErrorMessage(logsQuery.error, 'Không tải được sổ báo giảng, vui lòng thử lại')}
          </AlertDescription>
        </Alert>
      );
    }
    if (!logs) {
      return (
        <p role="status" className="mt-4 text-sm text-fg-muted">
          Đang tải...
        </p>
      );
    }

    return (
      <>
        {logs.length === 0 && (
          <p className="mt-4 text-sm text-fg-muted">{isWeekMode ? EMPTY_WEEK_MESSAGE : EMPTY_MESSAGE}</p>
        )}
        {isWeekMode ? (
          <div className="mt-4">
            <LessonWeekBoard
              weekStart={weekStart}
              today={today}
              logs={logs}
              canEditLog={() => canEdit}
              busyIds={actions.busyIds}
              pending={actions.pending}
              onToggleDone={flow.toggleDone}
              onRequestMove={flow.requestMove}
              onDropLog={flow.dropLog}
            />
          </div>
        ) : (
          <AllLogsList
            logs={logs}
            canEdit={canEdit}
            busyIds={actions.busyIds}
            pending={actions.pending}
            onToggleDone={flow.toggleDone}
            onRequestMove={flow.requestMove}
          />
        )}
      </>
    );
  }

  return (
    <div className="p-6">
      <h1 className="font-heading text-2xl font-semibold">Sổ báo giảng</h1>
      <p className="text-fg-muted">{detail.class.name}</p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        {positions.length > 1 ? (
          <div className="w-48">
            <Label htmlFor={subjectSelectId}>Môn</Label>
            <NativeSelect id={subjectSelectId} value={positionId} onChange={handlePositionChange}>
              {positions.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.subject}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : (
          <p className="flex h-10 items-center gap-2 text-sm">
            <span className="text-fg-muted">Môn:</span>
            <span className="font-medium">{position.subject}</span>
          </p>
        )}

        <div role="group" aria-label="Chế độ xem" className="flex gap-2">
          {MODES.map(({ value, label }) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={mode === value ? 'default' : 'outline'}
              aria-pressed={mode === value}
              onClick={() => handleModeChange(value)}
            >
              {label}
            </Button>
          ))}
        </div>

        {isWeekMode && <WeekNav weekStart={weekStart} today={today} onChange={handleWeekChange} />}
      </div>

      {isWeekMode && canEdit && (
        <p className="mt-3 text-xs text-fg-muted">
          Kéo thả thẻ sang ngày khác hoặc bấm &quot;Chuyển ngày&quot; để dời buổi học.
        </p>
      )}

      <LessonLogFeedback actions={actions} flow={flow} />

      {renderLogs()}
    </div>
  );
}
