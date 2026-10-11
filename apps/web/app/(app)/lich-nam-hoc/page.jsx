'use client';

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { RoleGate } from '@/components/layout/role-gate';
import { HolidayFormDialog } from '@/components/schedule/holiday-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  useGetSchoolYearsQuery,
  useGetHolidaysQuery,
  useGetCalendarStatsQuery,
  useDeleteHolidayMutation,
} from '@/lib/store/school-calendar-api';
import { selectCurrentUser } from '@/lib/store/auth-slice';
import { HOLIDAY_TYPE_LABELS, toDateOnly } from '@/lib/schedule';
import { apiErrorMessage, formatDate } from '@/lib/utils';

// Backend đếm sẵn đúng 4 con số này; trang không tự tính gì.
const STAT_CARDS = [
  { key: 'totalHolidayDays', label: 'Tổng ngày nghỉ' },
  { key: 'leHolidayDays', label: 'Nghỉ lễ' },
  { key: 'dotXuatHolidayDays', label: 'Nghỉ đột xuất' },
  {
    key: 'remainingTeachingDays',
    label: 'Số ngày dạy còn lại',
    hint: 'Tính từ hôm nay đến hết năm học, không tính Chủ nhật và ngày nghỉ',
  },
];

const DELETE_NOTE_ID = 'delete-holiday-note';

// GET /school-years không sắp xếp: ưu tiên năm hiện hành; không có thì lấy năm có ngày bắt đầu mới nhất, để kết quả
// không phụ thuộc thứ tự backend trả về.
function pickDefaultSchoolYear(schoolYears) {
  const current = schoolYears.find((year) => year.isCurrent);
  if (current) return current;
  return schoolYears.reduce(
    (latest, year) => (!latest || toDateOnly(year.startDate) > toDateOnly(latest.startDate) ? year : latest),
    undefined,
  );
}

function formatDateRange(startDate, endDate) {
  const from = formatDate(toDateOnly(startDate));
  const to = formatDate(toDateOnly(endDate));
  return from === to ? from : `${from} – ${to}`;
}

function StatsSection({ stats, isError, error }) {
  if (isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        {apiErrorMessage(error, 'Không tải được thống kê ngày nghỉ')}
      </p>
    );
  }
  if (!stats) {
    return (
      <p role="status" className="text-sm text-fg-muted">
        Đang tải...
      </p>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STAT_CARDS.map(({ key, label, hint }) => (
        <div
          key={key}
          role="group"
          aria-labelledby={`calendar-stat-${key}`}
          className="rounded-lg border border-border p-4"
        >
          <p id={`calendar-stat-${key}`} className="text-sm text-fg-muted">
            {label}
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold">{stats[key] ?? '—'}</p>
          {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
        </div>
      ))}
    </div>
  );
}

function HolidaysTable({ holidays, isAdmin, onEdit, onDelete }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-labelledby="holidays-heading">
        <thead>
          <tr className="text-left text-fg-muted">
            <th scope="col" className="py-2 pr-4">
              Tên
            </th>
            <th scope="col" className="py-2 pr-4">
              Loại
            </th>
            <th scope="col" className="py-2 pr-4">
              Từ ngày
            </th>
            <th scope="col" className="py-2 pr-4">
              Đến ngày
            </th>
            {isAdmin && (
              <th scope="col" className="py-2 pr-4">
                Hành động
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {holidays.map((holiday) => (
            <tr key={holiday._id} className="border-t border-border">
              <td className="py-2 pr-4">{holiday.name}</td>
              <td className="py-2 pr-4">
                <Badge variant={holiday.type === 'DOT_XUAT' ? 'danger' : 'muted'}>
                  {HOLIDAY_TYPE_LABELS[holiday.type] ?? holiday.type}
                </Badge>
              </td>
              <td className="py-2 pr-4">{formatDate(toDateOnly(holiday.startDate))}</td>
              <td className="py-2 pr-4">{formatDate(toDateOnly(holiday.endDate))}</td>
              {isAdmin && (
                <td className="py-2 pr-4">
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => onEdit(holiday)}>
                      Sửa
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => onDelete(holiday)}>
                      Xóa
                    </Button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HolidaysSection({ holidays, isError, error, isAdmin, onEdit, onDelete }) {
  let body;
  if (isError) {
    body = (
      <p role="alert" className="text-sm text-danger">
        {apiErrorMessage(error, 'Không tải được danh sách ngày nghỉ')}
      </p>
    );
  } else if (!holidays) {
    body = (
      <p role="status" className="text-sm text-fg-muted">
        Đang tải...
      </p>
    );
  } else if (holidays.length === 0) {
    body = <p className="text-sm text-fg-muted">Năm học này chưa có ngày nghỉ nào</p>;
  } else {
    // Giữ nguyên thứ tự backend trả về (đã sắp theo ngày bắt đầu).
    body = <HolidaysTable holidays={holidays} isAdmin={isAdmin} onEdit={onEdit} onDelete={onDelete} />;
  }

  return (
    <section className="mt-8">
      <h2 id="holidays-heading" className="font-heading text-lg font-semibold">
        Ngày nghỉ
      </h2>
      <div className="mt-2">{body}</div>
    </section>
  );
}

function DeleteHolidayDialog({ holiday, schoolYearId, onClose }) {
  const [error, setError] = useState(null);
  const [deleteHoliday, { isLoading }] = useDeleteHolidayMutation();

  async function handleConfirm() {
    if (isLoading) return;
    setError(null);
    try {
      await deleteHoliday({ id: holiday._id, schoolYearId }).unwrap();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'Xóa ngày nghỉ thất bại, vui lòng thử lại'));
    }
  }

  // Xóa cũng làm backend tính lại sổ báo giảng (tới vài giây): đang xóa thì không cho đóng, cùng lý do với
  // HolidayFormDialog.
  function handleOpenChange(open) {
    if (!open && !isLoading) onClose();
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent aria-describedby={DELETE_NOTE_ID}>
        <DialogTitle>Xóa ngày nghỉ?</DialogTitle>
        <p id={DELETE_NOTE_ID} className="mt-2 text-sm text-fg-muted">
          {`Bạn sắp xóa ngày nghỉ "${holiday.name}" (${formatDateRange(holiday.startDate, holiday.endDate)}). Sổ báo giảng của tất cả các môn sẽ được tính lại (có thể mất vài giây).`}
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isLoading}>
              Huỷ
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? 'Đang xóa...' : 'Xóa ngày nghỉ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SchoolCalendar() {
  const currentUser = useSelector(selectCurrentUser);
  const isAdmin = currentUser?.role === 'ADMIN';

  const {
    data: schoolYearsData,
    isLoading: isYearsLoading,
    isError: isYearsError,
    error: yearsError,
  } = useGetSchoolYearsQuery();
  const [pickedYearId, setPickedYearId] = useState('');
  // null khi đóng; { holiday } khi sửa; {} khi thêm.
  const [formState, setFormState] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const schoolYears = schoolYearsData ?? [];
  const selectedYear = schoolYears.find((year) => year._id === pickedYearId) ?? pickDefaultSchoolYear(schoolYears);
  const schoolYearId = selectedYear?._id ?? '';

  // currentData (không phải data): data của RTK Query giữ kết quả của năm học trước trong lúc năm mới còn đang tải,
  // sẽ hiện nhầm số liệu năm cũ dưới tên năm mới.
  const {
    currentData: holidays,
    isError: isHolidaysError,
    error: holidaysError,
  } = useGetHolidaysQuery(schoolYearId, { skip: !schoolYearId });
  const {
    currentData: stats,
    isError: isStatsError,
    error: statsError,
  } = useGetCalendarStatsQuery(schoolYearId, { skip: !schoolYearId });

  let content;
  if (isYearsLoading) {
    content = (
      <p role="status" className="mt-4 text-sm text-fg-muted">
        Đang tải...
      </p>
    );
  } else if (isYearsError) {
    content = (
      <p role="alert" className="mt-4 text-sm text-danger">
        {apiErrorMessage(yearsError, 'Không tải được danh sách năm học')}
      </p>
    );
  } else if (!selectedYear) {
    content = <p className="mt-4 text-sm text-fg-muted">Chưa có năm học nào</p>;
  } else {
    content = (
      <>
        <div className="mt-4 max-w-xs">
          <Label htmlFor="school-year-select">Năm học</Label>
          <Select
            id="school-year-select"
            value={schoolYearId}
            onChange={(event) => setPickedYearId(event.target.value)}
          >
            {schoolYears.map((year) => (
              <option key={year._id} value={year._id}>
                {year.name}
              </option>
            ))}
          </Select>
        </div>

        <section className="mt-6">
          <StatsSection stats={stats} isError={isStatsError} error={statsError} />
        </section>

        <HolidaysSection
          holidays={holidays}
          isError={isHolidaysError}
          error={holidaysError}
          isAdmin={isAdmin}
          onEdit={(holiday) => setFormState({ holiday })}
          onDelete={setDeleteTarget}
        />
      </>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-semibold">Lịch năm học</h1>
        {isAdmin && selectedYear && (
          <Button type="button" onClick={() => setFormState({})}>
            Thêm ngày nghỉ
          </Button>
        )}
      </div>

      {content}

      {formState && (
        <HolidayFormDialog
          open
          onOpenChange={(open) => !open && setFormState(null)}
          schoolYearId={schoolYearId}
          holiday={formState.holiday}
        />
      )}
      {deleteTarget && (
        <DeleteHolidayDialog
          holiday={deleteTarget}
          schoolYearId={schoolYearId}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

export default function LichNamHocPage() {
  return (
    <RoleGate roles={['TEACHER', 'ADMIN']}>
      <SchoolCalendar />
    </RoleGate>
  );
}
