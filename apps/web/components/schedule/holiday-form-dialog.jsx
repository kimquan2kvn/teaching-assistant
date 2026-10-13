'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useCreateHolidayMutation, useUpdateHolidayMutation } from '@/lib/store/school-calendar-api';
import { HOLIDAY_TYPE_LABELS, toDateOnly } from '@/lib/schedule';
import { apiErrorMessage } from '@/lib/utils';

const NOTE_ID = 'holiday-form-note';

// Các trường nằm ở component con được dựng lại (remount) mỗi lần dialog mở và mỗi lần đổi ngày nghỉ (key), nên giá
// trị khởi tạo luôn lấy từ props và không giữ chữ gõ dở hay thông báo lỗi của lần mở trước.
function HolidayForm({ holiday, isSaving, onSave }) {
  const [name, setName] = useState(holiday?.name ?? '');
  const [type, setType] = useState(holiday?.type ?? 'LE');
  const [startDate, setStartDate] = useState(toDateOnly(holiday?.startDate));
  const [endDate, setEndDate] = useState(toDateOnly(holiday?.endDate));
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSaving) return;
    setError(null);
    try {
      await onSave({ name, type, startDate, endDate });
    } catch (err) {
      setError(apiErrorMessage(err, 'Lưu ngày nghỉ thất bại, vui lòng thử lại'));
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <Label htmlFor="holiday-form-name">Tên</Label>
        <Input
          id="holiday-form-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={200}
          required
        />
      </div>
      <div className="mb-4">
        <Label htmlFor="holiday-form-type">Loại</Label>
        <Select id="holiday-form-type" value={type} onChange={(event) => setType(event.target.value)}>
          {Object.entries(HOLIDAY_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      {/* Cố ý không đặt min/max: ngày kết thúc phải >= ngày bắt đầu do backend kiểm và trả 400. */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="holiday-form-start-date">Từ ngày</Label>
          <Input
            id="holiday-form-start-date"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="holiday-form-end-date">Đến ngày</Label>
          <Input
            id="holiday-form-end-date"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            required
          />
        </div>
      </div>
      <p id={NOTE_ID} className="text-xs text-fg-muted">
        Lưu ngày nghỉ sẽ tự tính lại sổ báo giảng của tất cả các môn (có thể mất vài giây)
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <DialogFooter>
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

// Tạo khi không có `holiday`, sửa khi có.
export function HolidayFormDialog({ open, onOpenChange, schoolYearId, holiday }) {
  const [createHoliday, { isLoading: isCreating }] = useCreateHolidayMutation();
  const [updateHoliday, { isLoading: isUpdating }] = useUpdateHolidayMutation();
  const isSaving = isCreating || isUpdating;

  // Ghi ngày nghỉ làm backend tính lại sổ báo giảng của mọi môn (tới vài giây). Đang lưu thì không cho đóng: lỗi
  // 400/409 trả về sau đó cần còn chỗ để hiện, và đóng rồi mở lại sẽ cho gửi trùng khi lần trước chưa xong.
  function handleOpenChange(nextOpen) {
    if (!nextOpen && isSaving) return;
    onOpenChange?.(nextOpen);
  }

  async function handleSave(fields) {
    if (holiday) {
      await updateHoliday({ id: holiday._id, schoolYearId, ...fields }).unwrap();
    } else {
      await createHoliday({ schoolYearId, ...fields }).unwrap();
    }
    onOpenChange?.(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-describedby={NOTE_ID} className="max-h-[90vh] overflow-y-auto">
        <DialogTitle>{holiday ? 'Sửa ngày nghỉ' : 'Thêm ngày nghỉ'}</DialogTitle>
        <HolidayForm key={holiday?._id ?? 'new'} holiday={holiday} isSaving={isSaving} onSave={handleSave} />
      </DialogContent>
    </Dialog>
  );
}
