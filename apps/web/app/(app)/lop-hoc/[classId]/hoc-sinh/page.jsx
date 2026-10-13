'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSelector } from 'react-redux';
import { useGetClassDetailQuery } from '@/lib/store/classes-api';
import { useGetStudentsQuery } from '@/lib/store/students-api';
import { selectCurrentUser } from '@/lib/store/auth-slice';
import { Button, buttonVariants } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, formatDate } from '@/lib/utils';
import { StudentFormDialog } from '@/components/students/student-form-dialog';
import { TransferDialog } from '@/components/students/transfer-dialog';

export default function HocSinhPage() {
  const { classId } = useParams();
  const currentUser = useSelector(selectCurrentUser);
  const [showTransferred, setShowTransferred] = useState(false);
  // { mode: 'create' | 'edit', student? } — null khi dialog đang đóng.
  const [formDialogState, setFormDialogState] = useState(null);
  const [transferTarget, setTransferTarget] = useState(null);

  const { data: detail } = useGetClassDetailQuery(classId);
  const {
    data: students,
    isLoading: studentsLoading,
    isError: studentsIsError,
    error: studentsError,
  } = useGetStudentsQuery({
    classId,
    status: showTransferred ? 'ALL' : 'ACTIVE',
  });

  // isHomeroom suy ra từ CHÍNH dữ liệu đã fetch ở useGetClassDetailQuery (không gọi thêm API nào khác):
  // vị trí HOMEROOM của lớp này có holder trùng currentUser → người đang xem là GVCN của lớp.
  const isHomeroom = useMemo(() => {
    const homeroom = detail?.positions?.find((p) => p.type === 'HOMEROOM');
    return Boolean(currentUser && homeroom?.holder?.id === currentUser.id);
  }, [detail, currentUser]);
  const canManage = isHomeroom || currentUser?.role === 'ADMIN';

  // API chỉ phân biệt ACTIVE/ALL — khi bật toggle, gọi lại với status=ALL rồi tự lọc client-side chỉ còn
  // TRANSFERRED (đúng tinh thần tab "Đã chuyển đi", không phải "xem tất cả gộp chung").
  const visibleStudents = useMemo(() => {
    if (!students) return [];
    return showTransferred ? students.filter((s) => s.status === 'TRANSFERRED') : students;
  }, [students, showTransferred]);

  // GET .../students cũng có PositionGuard (như classDetail) — không giữ vị trí nào của lớp này (vd gõ nhầm
  // URL sang lớp khác) phải hiện đúng "không có quyền", KHÔNG ĐƯỢC render khung trang + bảng rỗng, vì bảng rỗng
  // trông giống hệt "lớp này chưa có học sinh" và không cho biết thực ra mình không có quyền xem.
  if (studentsIsError) {
    return (
      <div className="p-6">
        <h1 className="font-heading text-xl font-semibold">
          {studentsError?.status === 403 ? 'Bạn không có quyền xem lớp này' : 'Không tìm thấy lớp'}
        </h1>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-semibold">Danh sách học sinh</h1>
        {canManage && (
          <div className="flex gap-2">
            <Button type="button" onClick={() => setFormDialogState({ mode: 'create' })}>
              Thêm học sinh
            </Button>
            <Link
              href={`/lop-hoc/${classId}/hoc-sinh/nhap-excel`}
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              Nhập từ Excel
            </Link>
          </div>
        )}
      </div>

      <div className="mt-4">
        <Button
          type="button"
          variant={showTransferred ? 'default' : 'outline'}
          aria-pressed={showTransferred}
          onClick={() => setShowTransferred((v) => !v)}
        >
          Đã chuyển đi
        </Button>
      </div>

      {studentsLoading ? (
        <p className="mt-4 text-sm text-fg-muted">Đang tải...</p>
      ) : (
        <Table className="mt-4">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>STT</TableHead>
              <TableHead>Họ tên</TableHead>
              <TableHead>Ngày sinh</TableHead>
              {canManage && <TableHead>Hành động</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleStudents.map((student, index) => (
              <TableRow key={student._id}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>{student.fullName}</TableCell>
                <TableCell>{formatDate(student.dob)}</TableCell>
                {canManage && (
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setFormDialogState({ mode: 'edit', student })}
                      >
                        Sửa
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setTransferTarget(student)}
                      >
                        Đánh dấu chuyển đi
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {formDialogState && (
        <StudentFormDialog
          open
          onOpenChange={(open) => !open && setFormDialogState(null)}
          classId={classId}
          mode={formDialogState.mode}
          student={formDialogState.student}
        />
      )}
      {transferTarget && (
        <TransferDialog
          open
          onOpenChange={(open) => !open && setTransferTarget(null)}
          classId={classId}
          studentId={transferTarget._id}
          studentName={transferTarget.fullName}
        />
      )}
    </div>
  );
}
