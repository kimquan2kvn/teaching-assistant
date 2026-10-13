'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useGetTeachersQuery, useSetTeacherActiveMutation } from '@/lib/store/admin-api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertDescription>Không tải được danh sách giáo viên</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-4 font-heading text-xl font-semibold">Quản lý giáo viên</h1>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Tên đăng nhập</TableHead>
            <TableHead>Họ tên</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead />
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {teachers?.map((teacher) => (
            <TableRow key={teacher.id}>
              <TableCell>{teacher.username}</TableCell>
              <TableCell>{teacher.fullName}</TableCell>
              <TableCell>
                <Badge variant={teacher.isActive ? 'success' : 'danger'}>
                  {teacher.isActive ? 'Hoạt động' : 'Đã khóa'}
                </Badge>
              </TableCell>
              <TableCell>
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
              </TableCell>
              <TableCell>
                <Link href={`/quan-ly-giao-vien/${teacher.id}`} className="text-brand underline">
                  Xem vị trí
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!confirmTeacher} onOpenChange={(open) => !open && setConfirmTeacher(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmTeacher?.isActive
                ? 'Khóa tài khoản giáo viên này?'
                : 'Mở khóa tài khoản giáo viên này?'}
            </DialogTitle>
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
    </div>
  );
}
