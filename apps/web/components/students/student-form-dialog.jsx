'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useCreateStudentMutation, useUpdateStudentMutation } from '@/lib/store/students-api';

// `<input type="date">` luôn trả về chuỗi ISO yyyy-mm-dd hoặc rỗng, nhưng dob prefill từ API là ISO
// datetime đầy đủ (vd "2010-03-01T00:00:00.000Z") — phải cắt về 10 ký tự đầu để input date hiểu được.
function toDateInputValue(dob) {
  return dob ? String(dob).slice(0, 10) : '';
}

export function StudentFormDialog({ classId, student, open, onOpenChange }) {
  const isEditMode = Boolean(student);
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [error, setError] = useState(null);

  const [createStudent] = useCreateStudentMutation();
  const [updateStudent] = useUpdateStudentMutation();

  // Đồng bộ lại fields mỗi khi dialog MỞ (hoặc đổi sang học sinh khác trong khi đang mở) — không reset vào
  // state riêng theo mount, tránh bug giữ nguyên dữ liệu/studentId của lần mở trước khi dialog được tái dùng
  // để sửa một học sinh khác.
  useEffect(() => {
    if (!open) return;
    setFullName(student?.fullName ?? '');
    setDob(toDateInputValue(student?.dob));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, student?._id]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    try {
      if (isEditMode) {
        await updateStudent({ classId, studentId: student._id, fullName, dob }).unwrap();
      } else {
        await createStudent({ classId, fullName, dob }).unwrap();
      }
      onOpenChange?.(false);
    } catch (err) {
      setError(err?.data?.message ?? 'Lưu hồ sơ thất bại, vui lòng thử lại');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{isEditMode ? 'Sửa hồ sơ học sinh' : 'Thêm học sinh'}</DialogTitle>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <Label htmlFor="student-form-full-name">Họ và tên</Label>
            <Input
              id="student-form-full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="student-form-dob">Ngày sinh</Label>
            <Input
              id="student-form-dob"
              type="date"
              value={dob}
              onChange={(event) => setDob(event.target.value)}
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Huỷ
              </Button>
            </DialogClose>
            <Button type="submit">{isEditMode ? 'Lưu' : 'Thêm'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
