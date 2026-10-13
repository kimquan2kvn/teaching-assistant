'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSelector } from 'react-redux';
import { RoleGate } from '@/components/layout/role-gate';
import { SlotPanel } from '@/components/schedule/slot-panel';
import { TimetableGrid } from '@/components/schedule/timetable-grid';
import { useSelectedPosition } from '@/components/schedule/use-selected-position';
import { WeekNav } from '@/components/schedule/week-nav';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { getWeekDays, getWeekStart, isSlotActiveOn } from '@/lib/schedule';
import { selectCurrentUser } from '@/lib/store/auth-slice';
import { useGetSchoolYearsQuery, useGetHolidaysQuery } from '@/lib/store/school-calendar-api';
import { useGetMyPositionsQuery } from '@/lib/store/positions-api';
import { useGetMyTimetableWeekQuery } from '@/lib/store/timetable-api';
import { apiErrorMessage, cn, todayDateOnly } from '@/lib/utils';

const DENIED_TEXT =
  'Thời khóa biểu giảng dạy chỉ dành cho giáo viên. Quản trị viên khai báo/xem tiết của từng môn ở trang chi tiết lớp.';
const NO_SUBJECT_TEXT = 'Bạn chưa giữ môn nào, hãy tham gia lớp để có thời khóa biểu';
const EMPTY_WEEK_TEXT = 'Tuần này chưa có tiết nào. Khai báo tiết ở phần "Khai báo tiết" bên dưới.';
const HOLIDAY_WARNING = 'Không tải được ngày nghỉ, các ô tiết có thể chưa hiển thị đúng ngày nghỉ.';

function TeacherTimetable() {
  const currentUser = useSelector(selectCurrentUser);
  // "Hôm nay" tính theo giờ địa phương (todayDateOnly), KHÔNG toISOString: 00:00–07:00 giờ VN sẽ lùi 1 ngày.
  const today = todayDateOnly();
  const [weekStart, setWeekStart] = useState(() => getWeekStart(todayDateOnly()));
  // Ngày người dùng tự chọn bằng nút T2…T7 (chỉ có ý nghĩa dưới md); mặc định được dẫn xuất ở mỗi lần render.
  const [manualFocusedDate, setManualFocusedDate] = useState('');

  // currentData, KHÔNG phải data: lúc đổi tuần data còn là tuần trước, lưới sẽ đặt tiết cũ lên ngày của tuần mới và
  // câu "tuần này chưa có tiết nào" tính trên dữ liệu tuần cũ.
  const {
    currentData: weekData,
    isLoading,
    isFetching,
    isError,
    error,
  } = useGetMyTimetableWeekQuery({ weekStart });
  const { data: schoolYears, isError: isSchoolYearsError } = useGetSchoolYearsQuery();
  const currentYearId = schoolYears?.find((year) => year.isCurrent)?._id;
  const { data: holidays, isError: isHolidaysError } = useGetHolidaysQuery(currentYearId, {
    skip: !currentYearId,
  });
  const { data: myPositions, isError: isPositionsError, error: positionsError } = useGetMyPositionsQuery();

  const subjectPositions = useMemo(
    () => (myPositions ?? []).filter((position) => position.type === 'SUBJECT'),
    [myPositions],
  );
  const { positionId, setPositionId } = useSelectedPosition({ positions: subjectPositions, currentUser });

  const weekDays = getWeekDays(weekStart);
  const defaultFocusedDate = weekDays.includes(today) ? today : weekDays[0];
  const focusedDate = weekDays.includes(manualFocusedDate) ? manualFocusedDate : defaultFocusedDate;

  // Chưa tải xong danh sách vị trí (hoặc tải lỗi) thì không được kết luận "chưa giữ môn nào".
  const hasLoadedPositions = Array.isArray(myPositions);
  const hasNoSubject = hasLoadedPositions && subjectPositions.length === 0;
  const slots = weekData?.slots ?? [];
  // Slot nằm trong cửa sổ tuần nhưng hết/chưa hiệu lực ở mọi ngày của tuần thì lưới vẫn trống: coi là tuần chưa có tiết.
  const hasLessons = slots.some((slot) => isSlotActiveOn(slot, weekDays[slot.dayOfWeek - 2]));
  const isWeekEmpty = Boolean(weekData) && !isError && subjectPositions.length > 0 && !hasLessons;

  let weekContent;
  if (isError) {
    weekContent = (
      <Alert variant="destructive" className="mt-4">
        {apiErrorMessage(error, 'Không tải được thời khóa biểu, vui lòng thử lại')}
      </Alert>
    );
  } else if (isLoading) {
    weekContent = (
      <p role="status" className="mt-4 text-sm text-fg-muted">
        Đang tải...
      </p>
    );
  } else {
    // Đổi tuần: chưa có currentData của tuần mới thì dựng khung lưới rỗng, làm mờ và báo aria-busy.
    weekContent = (
      <div className={cn('mt-4', isFetching && 'opacity-60')} aria-busy={Boolean(isFetching)}>
        <TimetableGrid
          weekStart={weekStart}
          today={today}
          slots={slots}
          lessonLogs={weekData?.lessonLogs ?? []}
          holidays={holidays ?? []}
          focusedDate={focusedDate}
          onFocusDate={setManualFocusedDate}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="font-heading text-2xl font-semibold">Thời khóa biểu</h1>

      <div className="mt-4">
        <WeekNav weekStart={weekStart} today={today} onChange={setWeekStart} />
      </div>

      {hasNoSubject && (
        <Card className="mt-4 border-dashed shadow-none">
          <CardContent className="p-4">
            <p className="text-sm">{NO_SUBJECT_TEXT}</p>
            <Link href="/lop-hoc/tham-gia" className={cn(buttonVariants({ variant: 'default' }), 'mt-3')}>
              Tham gia lớp
            </Link>
          </CardContent>
        </Card>
      )}

      {isPositionsError && (
        <Alert variant="destructive" className="mt-4">
          {apiErrorMessage(positionsError, 'Không tải được danh sách môn, vui lòng thử lại')}
        </Alert>
      )}

      {isWeekEmpty && <p className="mt-4 text-sm text-fg-muted">{EMPTY_WEEK_TEXT}</p>}

      {(isSchoolYearsError || isHolidaysError) && (
        <Alert variant="destructive" role="status" className="mt-4">
          {HOLIDAY_WARNING}
        </Alert>
      )}

      {weekContent}

      {subjectPositions.length > 0 && (
        <section className="mt-8">
          <h2 className="font-heading text-lg font-semibold">Khai báo tiết</h2>
          <div className="mt-3 max-w-xs">
            <Label htmlFor="thoi-khoa-bieu-mon">Môn</Label>
            <NativeSelect
              id="thoi-khoa-bieu-mon"
              value={positionId}
              onChange={(event) => setPositionId(event.target.value)}
            >
              {subjectPositions.map((position) => (
                <option key={position.id} value={position.id}>
                  {`${position.class.name} — ${position.subject}`}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="mt-4">
            <SlotPanel positionId={positionId} canEdit />
          </div>
        </section>
      )}
    </div>
  );
}

export default function ThoiKhoaBieuPage() {
  return (
    <RoleGate roles={['TEACHER']} denied={<p className="p-6 text-sm text-fg-muted">{DENIED_TEXT}</p>}>
      <TeacherTimetable />
    </RoleGate>
  );
}
