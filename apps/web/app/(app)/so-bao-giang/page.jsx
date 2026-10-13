'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useGetTeacherWeekLessonLogsQuery } from '@/lib/store/lesson-logs-api';
import { useGetMyPositionsQuery } from '@/lib/store/positions-api';
import { RoleGate } from '@/components/layout/role-gate';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { LessonLogFeedback } from '@/components/schedule/lesson-log-feedback';
import { LessonWeekBoard } from '@/components/schedule/lesson-week-board';
import { useLessonLogActions, useMoveLogFlow } from '@/components/schedule/use-lesson-log-actions';
import { WeekNav } from '@/components/schedule/week-nav';
import { getWeekStart } from '@/lib/schedule';
import { apiErrorMessage, todayDateOnly } from '@/lib/utils';

const ALL_POSITIONS = '';
const EMPTY_WEEK_MESSAGE = 'Tuần này không có buổi học nào. Kiểm tra PPCT và thời khóa biểu của các môn.';

// GET /lesson-logs/week chỉ trả buổi của các vị trí môn giáo viên đang giữ (backend vẫn chặn từng PATCH) nên mọi thẻ
// trên trang này đều sửa được.
const CAN_EDIT_ANY_LOG = () => true;

function PageNotice({ children }) {
  return (
    <div className="p-6">
      <h1 className="font-heading text-2xl font-semibold">Sổ báo giảng</h1>
      {children}
    </div>
  );
}

function TeacherOnlyNotice() {
  return (
    <PageNotice>
      <p className="mt-2 text-sm text-fg-muted">
        Sổ báo giảng tổng hợp chỉ dành cho giáo viên. Quản trị viên xem sổ báo giảng từng môn ở trang chi tiết lớp.
      </p>
      <Link href="/lop-hoc" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">
        Đến danh sách lớp
      </Link>
    </PageNotice>
  );
}

function TeacherLessonLogs() {
  const filterId = useId();
  const [weekStart, setWeekStart] = useState(() => getWeekStart(todayDateOnly()));
  const [filterPositionId, setFilterPositionId] = useState(ALL_POSITIONS);

  const positionsQuery = useGetMyPositionsQuery();
  const subjectPositions = useMemo(
    () => (positionsQuery.data ?? []).filter((position) => position.type === 'SUBJECT'),
    [positionsQuery.data],
  );
  const hasNoSubjects = positionsQuery.data !== undefined && subjectPositions.length === 0;

  const weekQuery = useGetTeacherWeekLessonLogsQuery({ weekStart }, { skip: hasNoSubjects });
  // Vừa đổi tuần thì `data` còn là của tuần trước: chỉ dùng currentData, nếu không các buổi cũ sẽ rơi ra ngoài cột của
  // tuần mới (bảng trông như "tuần không có buổi nào") trong lúc tải.
  const weekLogs = weekQuery.currentData ?? (weekQuery.isFetching ? undefined : weekQuery.data);

  // Môn đang lọc không còn trong danh sách (vd vừa ngừng phụ trách) thì coi như không lọc nữa.
  const activeFilterId = subjectPositions.some((position) => position.id === filterPositionId)
    ? filterPositionId
    : ALL_POSITIONS;
  // Lọc phía client theo positionId của từng buổi: đổi bộ lọc không gọi lại API.
  const visibleLogs = useMemo(
    () => (weekLogs && activeFilterId ? weekLogs.filter((log) => log.positionId === activeFilterId) : weekLogs),
    [weekLogs, activeFilterId],
  );

  const actions = useLessonLogActions({
    listFetch: { isFetching: Boolean(weekQuery.isFetching), startedTimeStamp: weekQuery.startedTimeStamp },
  });
  const flow = useMoveLogFlow(actions);

  if (positionsQuery.isLoading) {
    return (
      <p role="status" className="p-6 text-sm text-fg-muted">
        Đang tải...
      </p>
    );
  }

  if (positionsQuery.isError && positionsQuery.data === undefined) {
    return (
      <PageNotice>
        <p role="alert" className="mt-2 text-sm text-danger">
          {apiErrorMessage(positionsQuery.error, 'Không tải được danh sách môn, vui lòng thử lại')}
        </p>
      </PageNotice>
    );
  }

  if (hasNoSubjects) {
    return (
      <PageNotice>
        <p className="mt-2 text-sm text-fg-muted">Bạn chưa giữ môn nào</p>
        <Link href="/lop-hoc/tham-gia" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">
          Tham gia bằng mã lớp
        </Link>
      </PageNotice>
    );
  }

  const today = todayDateOnly();

  function handleWeekChange(nextWeekStart) {
    flow.clearFeedback();
    setWeekStart(nextWeekStart);
  }

  function handleFilterChange(event) {
    flow.clearFeedback();
    setFilterPositionId(event.target.value);
  }

  function renderLogs() {
    if (weekQuery.isError) {
      return (
        <p role="alert" className="mt-4 text-sm text-danger">
          {apiErrorMessage(weekQuery.error, 'Không tải được sổ báo giảng, vui lòng thử lại')}
        </p>
      );
    }
    if (!visibleLogs) {
      return (
        <p role="status" className="mt-4 text-sm text-fg-muted">
          Đang tải...
        </p>
      );
    }

    return (
      <>
        {visibleLogs.length === 0 && <p className="mt-4 text-sm text-fg-muted">{EMPTY_WEEK_MESSAGE}</p>}
        <div className="mt-4">
          <LessonWeekBoard
            weekStart={weekStart}
            today={today}
            logs={visibleLogs}
            canEditLog={CAN_EDIT_ANY_LOG}
            busyIds={actions.busyIds}
            pending={actions.pending}
            showPosition
            onToggleDone={flow.toggleDone}
            onRequestMove={flow.requestMove}
            onDropLog={flow.dropLog}
          />
        </div>
      </>
    );
  }

  return (
    <div className="p-6">
      <h1 className="font-heading text-2xl font-semibold">Sổ báo giảng</h1>
      <p className="text-fg-muted">Các buổi dạy trong tuần của mọi lớp bạn phụ trách</p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <WeekNav weekStart={weekStart} today={today} onChange={handleWeekChange} />

        {subjectPositions.length > 1 && (
          <div className="w-56">
            <Label htmlFor={filterId}>Lớp/môn</Label>
            <Select id={filterId} value={activeFilterId} onChange={handleFilterChange}>
              <option value={ALL_POSITIONS}>Tất cả các lớp</option>
              {subjectPositions.map((position) => (
                <option key={position.id} value={position.id}>
                  {`${position.class.name} — ${position.subject}`}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-fg-muted">
        Kéo thả thẻ sang ngày khác hoặc bấm &quot;Chuyển ngày&quot; để dời buổi học.
      </p>

      <LessonLogFeedback actions={actions} flow={flow} />

      {renderLogs()}
    </div>
  );
}

export default function WeeklyLessonLogsPage() {
  return (
    <RoleGate roles={['TEACHER']} denied={<TeacherOnlyNotice />}>
      <TeacherLessonLogs />
    </RoleGate>
  );
}
