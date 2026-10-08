'use client';

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useGetClassDetailQuery } from '@/lib/store/classes-api';
import { useReleasePositionMutation } from '@/lib/store/positions-api';
import { selectCurrentUser } from '@/lib/store/auth-slice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';

// HOMEROOM không có subject (chỉ 1 vị trí/lớp) nên hiện nhãn cố định "Chủ nhiệm"; SUBJECT hiện thẳng tên môn
// đã lưu ở backend (vd "Toán"), không có bảng tra cứu riêng nào khác cần gọi thêm.
function positionLabel(position) {
  return position.type === 'HOMEROOM' ? 'Chủ nhiệm' : position.subject;
}

function ReleasePositionButton({ position }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const [releasePosition] = useReleasePositionMutation();

  async function handleConfirm() {
    setError(null);
    try {
      await releasePosition(position.id).unwrap();
      setOpen(false);
    } catch (err) {
      setError(err?.data?.message ?? 'Ngừng phụ trách thất bại, vui lòng thử lại');
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Ngừng phụ trách
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Ngừng phụ trách?</DialogTitle>
        <p className="text-sm text-fg-muted">Bạn sẽ không còn phụ trách vị trí này.</p>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Huỷ
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleConfirm}>
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ClassDetailPage({ params }) {
  const { classId } = params;
  const currentUser = useSelector(selectCurrentUser);
  const { data, isLoading, isError, error } = useGetClassDetailQuery(classId);

  if (isLoading) {
    return <div className="p-6 text-fg-muted">Đang tải...</div>;
  }

  if (isError) {
    // 403 nghĩa là user không giữ vị trí nào của lớp này (vd gõ nhầm URL) — phải phân biệt rõ với 404 (lớp
    // không tồn tại) thay vì gộp chung 1 trang lỗi, để tránh hiểu lầm "lớp này không tồn tại" khi thực ra lớp
    // vẫn tồn tại nhưng mình không có quyền xem.
    if (error?.status === 403) {
      return (
        <div className="p-6">
          <h1 className="font-heading text-xl font-semibold">Bạn không có quyền xem lớp này</h1>
        </div>
      );
    }
    return (
      <div className="p-6">
        <h1 className="font-heading text-xl font-semibold">Không tìm thấy lớp</h1>
      </div>
    );
  }

  const { class: klass, positions } = data;

  return (
    <div className="p-6">
      <h1 className="font-heading text-2xl font-semibold">{klass.name}</h1>
      <p className="text-fg-muted">{klass.code}</p>

      <ul className="mt-4 flex flex-col gap-2">
        {positions.map((position) => (
          <li
            key={position.id}
            className="flex items-center justify-between gap-4 border-b border-border py-3"
          >
            <span className="w-32 shrink-0">{positionLabel(position)}</span>
            <span className="flex-1">
              {position.holder ? position.holder.fullName : <Badge variant="muted">Trống</Badge>}
            </span>
            {position.holder?.id === currentUser?.id && <ReleasePositionButton position={position} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
