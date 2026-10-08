'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useGetTeachersQuery, useSetTeacherActiveMutation } from '@/lib/store/admin-api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';

export default function QuanLyGiaoVienPage() {
  const { data: teachers, isLoading, isError } = useGetTeachersQuery();
  const [setTeacherActive] = useSetTeacherActiveMutation();
  const [confirmTeacher, setConfirmTeacher] = useState(null);
  const [error, setError] = useState(null);

  async function handleConfirm() {
    if (!confirmTeacher) return;
    setError(null);
    try {
      await setTeacherActive({ id: confirmTeacher.id, isActive: !confirmTeacher.isActive }).unwrap();
      setConfirmTeacher(null);
    } catch (err) {
      setError(err?.data?.message ?? 'Thao tác thất bại, vui lòng thử lại');
    }
  }

  if (isLoading) {
    return <p className="p-4 text-sm text-fg-muted">Đang tải...</p>;
  }

  if (isError) {
    return <p className="p-4 text-sm text-danger">Không tải được danh sách giáo viên</p>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-4 font-heading text-xl font-semibold">Quản lý giáo viên</h1>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-fg-muted">
              <th className="py-2 font-medium">Tên đăng nhập</th>
              <th className="py-2 font-medium">Họ tên</th>
              <th className="py-2 font-medium">Trạng thái</th>
              <th className="py-2 font-medium" />
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {teachers?.map((teacher) => (
              <tr key={teacher.id} className="border-b border-border">
                <td className="py-2">{teacher.username}</td>
                <td className="py-2">{teacher.fullName}</td>
                <td className="py-2">
                  <Badge variant={teacher.isActive ? 'success' : 'danger'}>
                    {teacher.isActive ? 'Hoạt động' : 'Đã khóa'}
                  </Badge>
                </td>
                <td className="py-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setError(null);
                      setConfirmTeacher(teacher);
                    }}
                  >
                    {teacher.isActive ? 'Khóa' : 'Mở khóa'}
                  </Button>
                </td>
                <td className="py-2">
                  <Link href={`/quan-ly-giao-vien/${teacher.id}`} className="text-brand underline">
                    Xem vị trí
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!confirmTeacher} onOpenChange={(open) => !open && setConfirmTeacher(null)}>
        <DialogContent>
          <DialogTitle>
            {confirmTeacher?.isActive
              ? 'Khóa tài khoản giáo viên này?'
              : 'Mở khóa tài khoản giáo viên này?'}
          </DialogTitle>
          {error && <p className="text-sm text-danger">{error}</p>}
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
    </div>
  );
}
