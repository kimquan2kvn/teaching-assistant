'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSelector } from 'react-redux';
import { useGetClassDetailQuery } from '@/lib/store/classes-api';
import { useGetStudentsQuery } from '@/lib/store/students-api';
import {
  useGetClassPunishmentsQuery,
  useUpdatePunishmentStatusMutation,
  useUpdatePunishmentLinesMutation,
} from '@/lib/store/punishments-api';
import { selectCurrentUser } from '@/lib/store/auth-slice';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { cn, formatDate, buildIdNameMap } from '@/lib/utils';

// Nhãn/giá trị lấy NGUYÊN VĂN từ CLAUDE.md mục 9 ("Trạng thái Chưa nộp / Đã nộp / Nộp muộn"), KHÔNG tự nghĩ
// chữ khác. `value: undefined` cho tab "Tất cả" vì BE coi status là optional (không truyền = không lọc).
const STATUS_TABS = [
  { value: undefined, label: 'Tất cả' },
  { value: 'PENDING', label: 'Chưa nộp' },
  { value: 'SUBMITTED', label: 'Đã nộp' },
  { value: 'LATE', label: 'Nộp muộn' },
];

const STATUS_LABELS = { PENDING: 'Chưa nộp', SUBMITTED: 'Đã nộp', LATE: 'Nộp muộn' };
const STATUS_BADGE_VARIANTS = { PENDING: 'muted', SUBMITTED: 'success', LATE: 'danger' };

// "Quá hạn" chỉ có ý nghĩa khi còn PENDING — đã nộp (kể cả nộp muộn) thì hạn nộp cũ không còn là vấn đề cần
// cảnh báo trực quan nữa. dueDate là mốc UTC-midnight (giống dob) nên so bằng mốc UTC-midnight của "hôm nay",
// không dùng giờ địa phương (tránh lệch ngày y hệt lý do formatDate dùng timeZone:'UTC').
function isPunishmentOverdue(punishment) {
  if (punishment.status !== 'PENDING') return false;
  const due = new Date(punishment.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const now = new Date();
  const todayUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return due.getTime() < todayUtcMidnight;
}

function StatusDialog({ punishment, classId, onOpenChange }) {
  const [status, setStatus] = useState(punishment.status);
  const [error, setError] = useState(null);
  const [updatePunishmentStatus, { isLoading }] = useUpdatePunishmentStatusMutation();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      await updatePunishmentStatus({ id: punishment._id, classId, status }).unwrap();
      onOpenChange(false);
    } catch (err) {
      setError(err?.data?.message ?? 'Cập nhật trạng thái thất bại, vui lòng thử lại');
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Đổi trạng thái chép phạt</DialogTitle>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div>
            <Label htmlFor="punishment-status">Trạng thái mới</Label>
            <Select id="punishment-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="PENDING">Chưa nộp</option>
              <option value="SUBMITTED">Đã nộp</option>
              <option value="LATE">Nộp muộn</option>
            </Select>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Huỷ
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isLoading}>
              Xác nhận
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LinesDialog({ punishment, classId, onOpenChange }) {
  const [lines, setLines] = useState(String(punishment.lines));
  const [error, setError] = useState(null);
  const [updatePunishmentLines, { isLoading }] = useUpdatePunishmentLinesMutation();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      await updatePunishmentLines({ id: punishment._id, classId, lines: Number(lines) }).unwrap();
      onOpenChange(false);
    } catch (err) {
      setError(err?.data?.message ?? 'Cập nhật số dòng thất bại, vui lòng thử lại');
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Sửa số dòng chép phạt</DialogTitle>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div>
            <Label htmlFor="punishment-lines">Số dòng mới</Label>
            <Input
              id="punishment-lines"
              type="number"
              min={1}
              max={100}
              value={lines}
              onChange={(e) => setLines(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Huỷ
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isLoading}>
              Xác nhận
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ChepPhatPage() {
  const { classId } = useParams();
  const currentUser = useSelector(selectCurrentUser);
  const [statusFilter, setStatusFilter] = useState(undefined);
  const [statusDialogTarget, setStatusDialogTarget] = useState(null);
  const [linesDialogTarget, setLinesDialogTarget] = useState(null);

  const { data: detail } = useGetClassDetailQuery(classId);
  // status: 'ALL' để ghép tên cả học sinh đã chuyển lớp nhưng chép phạt cũ vẫn còn (xem "Quyết định thiết kế
  // quan trọng" của plan — vi-pham/chep-phat/dashboard đều cần roster đầy đủ, khác trang xếp loại).
  const { data: students } = useGetStudentsQuery({ classId, status: 'ALL' });
  const {
    data: punishments,
    isLoading: punishmentsLoading,
    isError: punishmentsIsError,
    error: punishmentsError,
  } = useGetClassPunishmentsQuery({ classId, status: statusFilter });

  // isHomeroom suy ra từ CHÍNH dữ liệu đã fetch ở useGetClassDetailQuery — ĐÚNG pattern đã dùng ở
  // hoc-sinh/page.jsx của sub-project 2, tái dùng y hệt, không phát minh lại.
  const isHomeroom = useMemo(() => {
    const homeroom = detail?.positions?.find((p) => p.type === 'HOMEROOM');
    return Boolean(currentUser && homeroom?.holder?.id === currentUser.id);
  }, [detail, currentUser]);
  const canManage = isHomeroom || currentUser?.role === 'ADMIN';

  const studentNameById = useMemo(() => buildIdNameMap(students, 'fullName'), [students]);

  if (punishmentsIsError) {
    return (
      <div className="p-6">
        <h1 className="font-heading text-xl font-semibold">
          {punishmentsError?.status === 403 ? 'Bạn không có quyền xem lớp này' : 'Không tìm thấy lớp'}
        </h1>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="font-heading text-2xl font-semibold">Chép phạt</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.label}
            type="button"
            size="sm"
            variant={statusFilter === tab.value ? 'default' : 'outline'}
            aria-pressed={statusFilter === tab.value}
            onClick={() => setStatusFilter(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {punishmentsLoading ? (
        <p className="mt-4 text-sm text-fg-muted">Đang tải...</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-fg-muted">
                <th className="py-2 pr-4">Học sinh</th>
                <th className="py-2 pr-4">Lý do</th>
                <th className="py-2 pr-4">Số dòng</th>
                <th className="py-2 pr-4">Hạn nộp</th>
                <th className="py-2 pr-4">Trạng thái</th>
                <th className="py-2 pr-4">Thông báo phụ huynh</th>
                {canManage && <th className="py-2 pr-4">Hành động</th>}
              </tr>
            </thead>
            <tbody>
              {(punishments ?? []).map((punishment) => {
                const overdue = isPunishmentOverdue(punishment);
                return (
                  <tr key={punishment._id} className="border-t border-border">
                    <td className="py-2 pr-4">{studentNameById.get(String(punishment.studentId)) ?? ''}</td>
                    <td className="py-2 pr-4">{punishment.reason}</td>
                    <td className="py-2 pr-4 font-mono">{punishment.lines}</td>
                    <td className={cn('py-2 pr-4', overdue && 'text-danger')}>
                      {formatDate(punishment.dueDate)}
                      {overdue && <span className="ml-1 text-xs font-medium">(Quá hạn)</span>}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={STATUS_BADGE_VARIANTS[punishment.status]}>
                        {STATUS_LABELS[punishment.status]}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4">
                      {punishment.notifyParent && <Badge variant="danger">Đã báo phụ huynh</Badge>}
                    </td>
                    {canManage && (
                      <td className="flex gap-2 py-2 pr-4">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setStatusDialogTarget(punishment)}
                        >
                          Đổi trạng thái
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setLinesDialogTarget(punishment)}
                        >
                          Sửa số dòng
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {statusDialogTarget && (
        <StatusDialog
          punishment={statusDialogTarget}
          classId={classId}
          onOpenChange={(open) => !open && setStatusDialogTarget(null)}
        />
      )}
      {linesDialogTarget && (
        <LinesDialog
          punishment={linesDialogTarget}
          classId={classId}
          onOpenChange={(open) => !open && setLinesDialogTarget(null)}
        />
      )}
    </div>
  );
}
