'use client';

import { useState } from 'react';
import { MAX_PPCT_PERIOD_COUNT, MAX_PPCT_WEEK } from '@so-chu-nhiem/shared';
import { Dialog, DialogContent, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useCreatePpctItemMutation, useUpdatePpctItemMutation } from '@/lib/store/ppct-api';
import {
  PPCT_NOTE_MAX_LENGTH,
  PPCT_PERIOD_LABEL_MAX_LENGTH,
  PPCT_REQUIREMENT_MAX_LENGTH,
  PPCT_TITLE_MAX_LENGTH,
  toCommitRow,
  validatePpctRow,
} from '@/lib/ppct';
import { apiErrorMessage } from '@/lib/utils';

function toFormValues(item) {
  return {
    week: item ? String(item.week) : '',
    periodLabel: item?.periodLabel ?? '',
    title: item?.title ?? '',
    periodCount: item ? String(item.periodCount) : '1',
    requirement: item?.requirement ?? '',
    note: item?.note ?? '',
  };
}

// Form nằm trong DialogContent (Radix gỡ nội dung khi đóng) nên mỗi lần mở là một lần khởi tạo state mới từ `item`:
// không cần effect đồng bộ, và không thể sót dữ liệu/itemId của lần mở trước.
function PpctItemForm({ positionId, item, onOpenChange }) {
  const isEditMode = Boolean(item);
  const [values, setValues] = useState(() => toFormValues(item));
  const [errors, setErrors] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [createPpctItem] = useCreatePpctItemMutation();
  const [updatePpctItem] = useUpdatePpctItemMutation();

  function handleChange(field) {
    return (event) => setValues((previous) => ({ ...previous, [field]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const validationErrors = validatePpctRow(values);
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;

    const row = toCommitRow(values);
    setIsSaving(true);
    try {
      if (isEditMode) {
        // PATCH: vắng khóa `note` thì backend giữ ghi chú cũ, chỉ `note: ''` mới xóa — toCommitRow bỏ khóa khi trống.
        await updatePpctItem({ positionId, itemId: item._id, ...row, note: values.note.trim() }).unwrap();
      } else {
        await createPpctItem({ positionId, ...row }).unwrap();
      }
      onOpenChange?.(false);
    } catch (err) {
      setErrors([apiErrorMessage(err, 'Lưu mục PPCT thất bại, vui lòng thử lại')]);
    } finally {
      setIsSaving(false);
    }
  }

  // noValidate: toàn bộ kiểm tra do validatePpctRow đảm nhiệm để thông báo luôn là tiếng Việt, không phải
  // bong bóng gợi ý mặc định của trình duyệt (phụ thuộc ngôn ngữ máy).
  return (
    <form onSubmit={handleSubmit} noValidate className="mt-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="ppct-item-week">Tuần</Label>
          <Input
            id="ppct-item-week"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_PPCT_WEEK}
            value={values.week}
            onChange={handleChange('week')}
          />
        </div>
        <div>
          <Label htmlFor="ppct-item-period-label">Tiết thứ</Label>
          <Input
            id="ppct-item-period-label"
            placeholder="1, TC1, CĐ1"
            maxLength={PPCT_PERIOD_LABEL_MAX_LENGTH}
            value={values.periodLabel}
            onChange={handleChange('periodLabel')}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="ppct-item-title">Bài học</Label>
        <Input
          id="ppct-item-title"
          maxLength={PPCT_TITLE_MAX_LENGTH}
          value={values.title}
          onChange={handleChange('title')}
        />
      </div>
      <div>
        <Label htmlFor="ppct-item-period-count">Số tiết</Label>
        <Input
          id="ppct-item-period-count"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_PPCT_PERIOD_COUNT}
          value={values.periodCount}
          onChange={handleChange('periodCount')}
        />
      </div>
      <div>
        <Label htmlFor="ppct-item-requirement">Yêu cầu cần đạt</Label>
        <Textarea
          id="ppct-item-requirement"
          maxLength={PPCT_REQUIREMENT_MAX_LENGTH}
          value={values.requirement}
          onChange={handleChange('requirement')}
        />
      </div>
      <div>
        <Label htmlFor="ppct-item-note">Ghi chú</Label>
        <Textarea
          id="ppct-item-note"
          maxLength={PPCT_NOTE_MAX_LENGTH}
          value={values.note}
          onChange={handleChange('note')}
        />
      </div>

      {errors.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 text-sm text-danger">
          {errors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      <DialogFooter className="mt-2">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Huỷ
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isSaving}>
          {isEditMode ? 'Lưu' : 'Thêm'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// `item` có thì là sửa, không có là thêm mới. Thêm mới luôn nối vào cuối PPCT (backend quyết định thứ tự).
export function PpctItemDialog({ open, onOpenChange, positionId, item }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogTitle>{item ? 'Sửa mục PPCT' : 'Thêm mục PPCT'}</DialogTitle>
        <PpctItemForm positionId={positionId} item={item} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}
