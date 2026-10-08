'use client';

import { useState } from 'react';
import { useGetTeacherPositionsQuery, useGetTeachersQuery } from '@/lib/store/admin-api';
import { useReassignPositionMutation } from '@/lib/store/positions-api';
import { Dialog, DialogContent, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// HOMEROOM không có tên môn riêng (chỉ có 1 GVCN/lớp) nên hiện nhãn cố định "Chủ nhiệm";
// SUBJECT hiện thẳng tên môn trả về từ backend (đã là tiếng Việt sẵn, không cần map lại).
function positionTypeLabel(position) {
  return position.type === 'HOMEROOM' ? 'Chủ nhiệm' : position.subject;
}

export default function TeacherPositionsPage({ params }) {
  const { teacherId } = params;
  const { data: positions, isLoading, error, refetch } = useGetTeacherPositionsQuery(teacherId);
  const { data: teachers } = useGetTeachersQuery();
  const [reassignPosition, { isLoading: isReassigning }] = useReassignPositionMutation();

  const [activePosition, setActivePosition] = useState(null);
  const [targetTeacherId, setTargetTeacherId] = useState('');
  const [reassignError, setReassignError] = useState(null);

  // Tránh tự gán vị trí cho chính giáo viên đang xem trang: backend không cấm nhưng làm vậy sẽ không có
  // tác dụng gì (vẫn giữ nguyên vị trí) và dễ gây nhầm lẫn khi thao tác nhanh.
  const otherTeachers = (teachers ?? []).filter((t) => t.id !== teacherId);

  function openReassignDialog(position) {
    setReassignError(null);
    setTargetTeacherId('');
    setActivePosition(position);
  }

  function closeDialog() {
    setActivePosition(null);
  }

  async function handleReassign(e) {
    e.preventDefault();
    if (!targetTeacherId) return;
    setReassignError(null);
    try {
      await reassignPosition({
        positionId: activePosition.id,
        teacherId: targetTeacherId,
        classId: activePosition.class.id,
        oldTeacherId: teacherId,
      }).unwrap();
      closeDialog();
      // Response của reassign không cho biết "giáo viên cũ" là ai nên không thể tự suy ra cache nào cần
      // invalidate thêm ở phía danh sách đang xem — refetch thẳng chính query này là đủ (danh sách ngắn đi 1).
      refetch();
    } catch (err) {
      setReassignError(err?.data?.message ?? 'Gán lại thất bại, vui lòng thử lại');
    }
  }

  return (
    <div className="p-6">
      <h1 className="font-heading text-2xl font-semibold">Vị trí đang giữ</h1>

      <div className="mt-6">
        {isLoading && <p role="status">Đang tải...</p>}

        {!isLoading && error && (
          <p className="text-sm text-danger">
            {error?.data?.message ?? 'Không tải được danh sách vị trí, vui lòng thử lại'}
          </p>
        )}

        {!isLoading && !error && positions?.length === 0 && (
          <p className="text-fg-muted">Giáo viên này chưa giữ vị trí nào.</p>
        )}

        {!isLoading && !error && positions?.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2">
            {positions.map((position) => (
              <li key={position.id} className="rounded-lg border border-border p-4">
                <p className="font-heading text-lg font-semibold">{position.class.name}</p>
                <p className="mt-1 text-sm text-fg-muted">{positionTypeLabel(position)}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => openReassignDialog(position)}
                >
                  Gán lại cho giáo viên khác
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={Boolean(activePosition)} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogTitle>Gán lại vị trí cho giáo viên khác</DialogTitle>
          <form onSubmit={handleReassign} className="mt-4 flex flex-col gap-4">
            <div>
              <Label htmlFor="targetTeacher">Giáo viên mới</Label>
              <Select
                id="targetTeacher"
                value={targetTeacherId}
                onChange={(e) => setTargetTeacherId(e.target.value)}
              >
                <option value="">-- Chọn giáo viên --</option>
                {otherTeachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </Select>
            </div>

            {reassignError && <p className="text-sm text-danger">{reassignError}</p>}

            <DialogFooter>
              <DialogClose className={cn(buttonVariants({ variant: 'outline' }))}>Huỷ</DialogClose>
              <Button type="submit" disabled={!targetTeacherId || isReassigning}>
                Xác nhận
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
