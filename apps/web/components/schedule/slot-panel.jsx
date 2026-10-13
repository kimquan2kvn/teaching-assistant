'use client';

import { useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toDateOnly, weekdayLabel } from '@/lib/schedule';
import { useDeleteTimetableSlotMutation, useGetPositionTimetableSlotsQuery } from '@/lib/store/timetable-api';
import { apiErrorMessage, formatDate } from '@/lib/utils';
import { SlotFormDialog } from './slot-form-dialog';

// Thứ, rồi Tiết, rồi ngày bắt đầu hiệu lực (yyyy-mm-dd so sánh được như chuỗi).
function compareSlots(a, b) {
  if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
  if (a.period !== b.period) return a.period - b.period;
  const fromA = toDateOnly(a.effectiveFrom);
  const fromB = toDateOnly(b.effectiveFrom);
  if (fromA === fromB) return 0;
  return fromA < fromB ? -1 : 1;
}

function DeleteSlotDialog({ positionId, slot, onOpenChange }) {
  const [error, setError] = useState(null);
  const [deleteSlot, { isLoading }] = useDeleteTimetableSlotMutation();

  // Đang xóa thì không cho đóng (Esc, Huỷ, bấm ra ngoài): lỗi trả về sau đó cần còn chỗ để hiện.
  function handleOpenChange(nextOpen) {
    if (!nextOpen && isLoading) return;
    onOpenChange(nextOpen);
  }

  async function handleConfirm() {
    if (isLoading) return;
    setError(null);
    try {
      await deleteSlot({ positionId, slotId: slot._id }).unwrap();
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, 'Xóa tiết thất bại, vui lòng thử lại'));
    }
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle>Xóa tiết?</DialogTitle>
          <DialogDescription className="text-foreground">
            {`${weekdayLabel(slot.dayOfWeek)}, Tiết ${slot.period}, hiệu lực từ ${formatDate(slot.effectiveFrom)}`}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-fg-muted">
          {'Các buổi đã tích "Đã thực hiện" hoặc đã chỉnh tay được giữ nguyên.'}
        </p>
        {error && <Alert variant="destructive">{error}</Alert>}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isLoading}>
              Huỷ
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? 'Đang xóa...' : 'Xác nhận'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Bảng tiết đã khai báo của 1 vị trí môn. `canEdit` chỉ ẩn/hiện control (quyền thật do guard backend chặn).
export function SlotPanel({ positionId, canEdit }) {
  // null khi đóng; { slot } khi mở — slot là undefined lúc thêm mới.
  const [formState, setFormState] = useState(null);
  const [slotToDelete, setSlotToDelete] = useState(null);
  // currentData, KHÔNG phải data: lúc đổi môn data còn là tiết của môn trước, bảng sẽ hiện tiết môn cũ kèm Sửa/Xóa
  // gửi slotId môn cũ tới positionId môn mới. currentData giữ nguyên khi làm mới cùng môn nên bảng/hộp thoại không nháy.
  const { currentData, isError, error } = useGetPositionTimetableSlotsQuery(positionId, { skip: !positionId });
  // Sắp trên bản sao: dữ liệu RTK Query bị đóng băng, sort tại chỗ sẽ ném lỗi.
  const slots = useMemo(() => [...(currentData ?? [])].sort(compareSlots), [currentData]);

  if (isError) {
    return <Alert variant="destructive">{apiErrorMessage(error, 'Không tải được danh sách tiết, vui lòng thử lại')}</Alert>;
  }

  if (currentData === undefined) {
    return (
      <p role="status" className="text-sm text-fg-muted">
        Đang tải...
      </p>
    );
  }

  return (
    <div>
      {canEdit && (
        <div className="flex justify-end">
          <Button type="button" onClick={() => setFormState({})}>
            Thêm tiết
          </Button>
        </div>
      )}

      {slots.length === 0 ? (
        <p className="mt-4 text-sm text-fg-muted">Môn này chưa khai báo tiết nào</p>
      ) : (
        <Table className="mt-4">
          <TableHeader>
            <TableRow className="text-left">
              <TableHead>Thứ</TableHead>
              <TableHead>Tiết</TableHead>
              <TableHead>Hiệu lực từ</TableHead>
              <TableHead>Đến</TableHead>
              {canEdit && <TableHead>Hành động</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {slots.map((slot) => (
              <TableRow key={slot._id}>
                <TableCell>{weekdayLabel(slot.dayOfWeek)}</TableCell>
                <TableCell className="font-mono">{`Tiết ${slot.period}`}</TableCell>
                <TableCell className="font-mono">{formatDate(slot.effectiveFrom)}</TableCell>
                {slot.effectiveTo ? (
                  <TableCell className="font-mono">{formatDate(slot.effectiveTo)}</TableCell>
                ) : (
                  <TableCell className="text-fg-muted">Chưa kết thúc</TableCell>
                )}
                {canEdit && (
                  <TableCell>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setFormState({ slot })}>
                        Sửa
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setSlotToDelete(slot)}>
                        Xóa
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {formState && (
        <SlotFormDialog
          open
          onOpenChange={(isOpen) => !isOpen && setFormState(null)}
          positionId={positionId}
          slot={formState.slot}
        />
      )}
      {slotToDelete && (
        <DeleteSlotDialog
          positionId={positionId}
          slot={slotToDelete}
          onOpenChange={(isOpen) => !isOpen && setSlotToDelete(null)}
        />
      )}
    </div>
  );
}
