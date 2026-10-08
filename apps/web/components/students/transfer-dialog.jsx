'use client';

import { useState } from 'react';
import { useTransferStudentMutation } from '@/lib/store/students-api';
import { Dialog, DialogContent, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Props: open (bool), onOpenChange(bool) — điều khiển ẩn/hiện từ component cha (vd roster page);
// classId/studentId — tham số bắt buộc cho mutation; studentName — chỉ để hiển thị trong tiêu đề.
export function TransferDialog({ open, onOpenChange, classId, studentId, studentName }) {
  const [transferDate, setTransferDate] = useState(todayIso);
  const [transferReason, setTransferReason] = useState('');
  const [error, setError] = useState(null);
  const [transferStudent, { isLoading }] = useTransferStudentMutation();

  async function handleSubmit(e) {
    e.preventDefault();
    // Check tay song song với required ở Textarea: required đã chặn hầu hết trường hợp ở trình duyệt thật, nhưng
    // check tay ở đây đảm bảo ổn định cho cả môi trường test (jsdom không luôn enforce constraint validation).
    if (!transferReason.trim()) {
      return;
    }
    setError(null);
    try {
      await transferStudent({ classId, studentId, transferDate, transferReason }).unwrap();
      setTransferReason('');
      onOpenChange(false);
    } catch (err) {
      setError(err?.data?.message ?? 'Đánh dấu chuyển đi thất bại, vui lòng thử lại');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Đánh dấu chuyển đi{studentName ? ` — ${studentName}` : ''}</DialogTitle>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div>
            <Label htmlFor="transferDate">Ngày chuyển đi</Label>
            <Input
              id="transferDate"
              type="date"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="transferReason">Lý do chuyển đi</Label>
            <Textarea
              id="transferReason"
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
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
