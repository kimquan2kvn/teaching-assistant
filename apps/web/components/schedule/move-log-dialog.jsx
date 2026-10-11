'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toDateOnly } from '@/lib/schedule';
import { formatDate } from '@/lib/utils';
import { MISSING_ITEM_TITLE } from './lesson-log-card';

// Hộp thoại "Chuyển ngày": phương án bấm-chọn cho điện thoại và bàn phím, chuyển được sang cả tuần khác. Component cha
// chỉ render khi có buổi cần chuyển (mỗi buổi một lần mở nên ô ngày khởi tạo từ log.date, không cần đồng bộ lại).
// FE không kiểm tra ngày có tiết/có bị trùng hay không — backend trả 400/409 và `error` hiện nguyên văn.
export function MoveLogDialog({ log, error, busy = false, onClose, onSubmit }) {
  const inputId = useId();
  const currentDate = toDateOnly(log.date);
  const [value, setValue] = useState(currentDate);

  // Ô ngày rỗng/sai định dạng bị backend từ chối 400; ngày không đổi thì chẳng có gì để chuyển.
  const isEmpty = value === '';
  const canSubmit = !busy && !isEmpty && value !== currentDate;
  const position = log.position;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    const isMoved = await onSubmit(value);
    if (isMoved) onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>Chuyển ngày buổi học</DialogTitle>
        <div className="mt-2 text-sm">
          {position && <p className="text-xs text-fg-muted">{`${position.className} · ${position.subject}`}</p>}
          <p className="font-medium">{log.ppctItem?.title ?? MISSING_ITEM_TITLE}</p>
          <p className="text-fg-muted">{`Ngày hiện tại: ${formatDate(currentDate)}`}</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div>
            <Label htmlFor={inputId}>Ngày mới</Label>
            <Input
              id={inputId}
              type="date"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              required
            />
            {isEmpty && <p className="mt-1 text-xs text-fg-muted">Vui lòng chọn ngày muốn chuyển tới</p>}
          </div>

          <p className="text-xs text-fg-muted">
            Sau khi chuyển, các buổi chưa chốt của môn sẽ được xếp lại (có thể mất vài giây).
          </p>

          {busy && (
            <p role="status" className="text-sm text-fg-muted">
              Đang chuyển và xếp lại các buổi học, vui lòng đợi...
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <DialogFooter className="mt-0">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Huỷ
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSubmit}>
              Chuyển
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
