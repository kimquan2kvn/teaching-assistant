'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
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
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)]">
        <DialogTitle>Xóa tiết?</DialogTitle>
        <p className="mt-2 text-sm">
          {`${weekdayLabel(slot.dayOfWeek)}, Tiết ${slot.period}, hiệu lực từ ${formatDate(slot.effectiveFrom)}`}
        </p>
        <p className="mt-2 text-sm text-fg-muted">
          {'Các buổi đã tích "Đã thực hiện" hoặc đã chỉnh tay được giữ nguyên.'}
        </p>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
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
    return (
      <p role="alert" className="text-sm text-danger">
        {apiErrorMessage(error, 'Không tải được danh sách tiết, vui lòng thử lại')}
      </p>
    );
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
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-fg-muted">
                <th className="py-2 pr-4">Thứ</th>
                <th className="py-2 pr-4">Tiết</th>
                <th className="py-2 pr-4">Hiệu lực từ</th>
                <th className="py-2 pr-4">Đến</th>
                {canEdit && <th className="py-2 pr-4">Hành động</th>}
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <tr key={slot._id} className="border-t border-border">
                  <td className="py-2 pr-4">{weekdayLabel(slot.dayOfWeek)}</td>
                  <td className="py-2 pr-4 font-mono">{`Tiết ${slot.period}`}</td>
                  <td className="py-2 pr-4 font-mono">{formatDate(slot.effectiveFrom)}</td>
                  {slot.effectiveTo ? (
                    <td className="py-2 pr-4 font-mono">{formatDate(slot.effectiveTo)}</td>
                  ) : (
                    <td className="py-2 pr-4 text-fg-muted">Chưa kết thúc</td>
                  )}
                  {canEdit && (
                    <td className="py-2 pr-4">
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setFormState({ slot })}>
                          Sửa
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setSlotToDelete(slot)}>
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
