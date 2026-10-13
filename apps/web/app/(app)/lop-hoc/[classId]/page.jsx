'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSelector } from 'react-redux';
import { useGetClassDetailQuery } from '@/lib/store/classes-api';
import { useReleasePositionMutation } from '@/lib/store/positions-api';
import { selectCurrentUser } from '@/lib/store/auth-slice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';

// Các trang con của 1 lớp cụ thể (5 trang Phase 2 + 3 trang Phase 3 theo môn-lớp) — nơi người dùng THỰC SỰ đi vào
// sau khi chọn lớp từ /lop-hoc.
const CLASS_FEATURE_TABS = [
  { label: 'Điểm danh', segment: 'diem-danh' },
  { label: 'Vi phạm & điểm cộng', segment: 'vi-pham' },
  { label: 'Xếp loại rèn luyện', segment: 'xep-loai' },
  { label: 'Chép phạt', segment: 'chep-phat' },
  { label: 'Bảng điều khiển', segment: 'bang-dieu-khien' },
  { label: 'Phân phối chương trình', segment: 'ppct' },
  { label: 'Thời khóa biểu môn', segment: 'thoi-khoa-bieu' },
  { label: 'Sổ báo giảng', segment: 'so-bao-giang' },
];

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
        <DialogHeader>
          <DialogTitle>Ngừng phụ trách?</DialogTitle>
          <DialogDescription>Bạn sẽ không còn phụ trách vị trí này.</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
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

      <nav className="mt-4 flex flex-wrap gap-2 border-b border-border pb-3">
        {CLASS_FEATURE_TABS.map(({ label, segment }) => (
          <Link
            key={segment}
            href={`/lop-hoc/${classId}/${segment}`}
            className="rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-black/5 hover:text-fg"
          >
            {label}
          </Link>
        ))}
      </nav>

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
