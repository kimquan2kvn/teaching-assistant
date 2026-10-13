'use client';

import { useId, useState } from 'react';
import { MAX_PERIODS_PER_DAY, TIMETABLE_DAYS_OF_WEEK } from '@so-chu-nhiem/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { toDateOnly, weekdayLabel } from '@/lib/schedule';
import { useCreateTimetableSlotMutation, useUpdateTimetableSlotMutation } from '@/lib/store/timetable-api';
import { apiErrorMessage, todayDateOnly } from '@/lib/utils';

const PERIODS = Array.from({ length: MAX_PERIODS_PER_DAY }, (_, index) => index + 1);

// Giá trị ô nhập khởi tạo từ props ngay lúc form được dựng. Radix gỡ nội dung khi đóng và `key` theo tiết, nên mỗi
// lần mở (hoặc đổi sang tiết khác) là một form mới: không cần useEffect để đồng bộ lại state.
function SlotForm({ slot, isSaving, onSave }) {
  const baseId = useId();
  const [dayOfWeek, setDayOfWeek] = useState(slot?.dayOfWeek ?? TIMETABLE_DAYS_OF_WEEK[0]);
  const [period, setPeriod] = useState(slot?.period ?? 1);
  const [effectiveFrom, setEffectiveFrom] = useState(() => (slot ? toDateOnly(slot.effectiveFrom) : todayDateOnly()));
  const [effectiveTo, setEffectiveTo] = useState(() => toDateOnly(slot?.effectiveTo));
  const [error, setError] = useState(null);

  // Backend tính lại sổ báo giảng ngay trong lúc ghi (có thể vài giây): chặn gửi lần hai cả khi bấm Enter trong ô ngày.
  // Không tiền kiểm "đến ngày >= từ ngày" hay trùng tiết: backend quyết định (400/409) và message được hiện nguyên văn.
  async function handleSubmit(event) {
    event.preventDefault();
    if (isSaving) return;
    setError(null);
    try {
      await onSave({ dayOfWeek, period, effectiveFrom, effectiveTo: effectiveTo || null });
    } catch (err) {
      setError(apiErrorMessage(err, 'Lưu tiết thất bại, vui lòng thử lại'));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor={`${baseId}-day`}>Thứ</Label>
          <Select
            id={`${baseId}-day`}
            value={dayOfWeek}
            onChange={(event) => setDayOfWeek(Number(event.target.value))}
          >
            {TIMETABLE_DAYS_OF_WEEK.map((day) => (
              <option key={day} value={day}>
                {weekdayLabel(day)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`${baseId}-period`}>Tiết</Label>
          <Select
            id={`${baseId}-period`}
            value={period}
            onChange={(event) => setPeriod(Number(event.target.value))}
          >
            {PERIODS.map((value) => (
              <option key={value} value={value}>
                {`Tiết ${value}`}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor={`${baseId}-from`}>Hiệu lực từ</Label>
          <Input
            id={`${baseId}-from`}
            type="date"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor={`${baseId}-to`}>Đến ngày</Label>
          <Input
            id={`${baseId}-to`}
            type="date"
            value={effectiveTo}
            onChange={(event) => setEffectiveTo(event.target.value)}
          />
        </div>
      </div>

      <p className="text-sm text-fg-muted">Lưu tiết sẽ tự xếp lại các buổi báo giảng chưa chốt của môn</p>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <DialogFooter className="mt-0">
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={isSaving}>
            Huỷ
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? 'Đang lưu...' : 'Lưu'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function SlotFormDialog({ open, onOpenChange, positionId, slot }) {
  const [createSlot, { isLoading: isCreating }] = useCreateTimetableSlotMutation();
  const [updateSlot, { isLoading: isUpdating }] = useUpdateTimetableSlotMutation();
  const isSaving = isCreating || isUpdating;

  // Đang lưu thì không cho đóng (Esc, Huỷ, bấm ra ngoài): lỗi 400/409 trả về sau đó cần còn chỗ để hiện, và đóng rồi
  // mở lại sẽ cho gửi trùng khi lần trước chưa xong. Cùng quy tắc với HolidayFormDialog.
  function handleOpenChange(nextOpen) {
    if (!nextOpen && isSaving) return;
    onOpenChange?.(nextOpen);
  }

  async function handleSave(fields) {
    if (slot) {
      await updateSlot({ positionId, slotId: slot._id, ...fields }).unwrap();
    } else {
      await createSlot({ positionId, ...fields }).unwrap();
    }
    onOpenChange?.(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto">
        <DialogTitle>{slot ? 'Sửa tiết' : 'Thêm tiết'}</DialogTitle>
        <SlotForm key={slot?._id ?? 'new'} slot={slot} isSaving={isSaving} onSave={handleSave} />
      </DialogContent>
    </Dialog>
  );
}
