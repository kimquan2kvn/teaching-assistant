'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useGetClassConductLogsQuery } from '@/lib/store/conduct-log-api';
import { useGetStudentsQuery } from '@/lib/store/students-api';
import { useGetConductCatalogQuery } from '@/lib/store/conduct-catalog-api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NativeSelect } from '@/components/ui/native-select';
import { buildIdNameMap, formatDate, formatSignedPoints } from '@/lib/utils';
import { ConductLogFormDialog } from '@/components/conduct/conduct-log-form-dialog';

export default function ViPhamPage() {
  const { classId } = useParams();
  const [studentFilter, setStudentFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const {
    data: logs,
    isLoading: logsLoading,
    isError: logsIsError,
    error: logsError,
  } = useGetClassConductLogsQuery({ classId, studentId: studentFilter || undefined });
  // status: 'ALL' để ghép đúng tên kể cả học sinh ĐÃ CHUYỂN LỚP — nhật ký vi phạm/điểm cộng là dữ liệu LỊCH
  // SỬ, không phải roster đang học, nên không được lọc chỉ còn ACTIVE (sẽ hiện trống tên học sinh cũ).
  const { data: students } = useGetStudentsQuery({ classId, status: 'ALL' });
  const { data: catalog } = useGetConductCatalogQuery();

  const studentMap = useMemo(() => buildIdNameMap(students, 'fullName'), [students]);
  const catalogMap = useMemo(() => buildIdNameMap(catalog, 'label'), [catalog]);

  // GET .../conduct-logs có PositionGuard('ANY') — không giữ vị trí nào của lớp này (vd gõ nhầm URL) phải
  // hiện đúng "không có quyền", KHÔNG render khung trang + bảng rỗng gây hiểu lầm "lớp chưa có dữ liệu".
  if (logsIsError) {
    return (
      <div className="p-6">
        <h1 className="font-heading text-xl font-semibold">
          {logsError?.status === 403 ? 'Bạn không có quyền xem lớp này' : 'Không tìm thấy lớp'}
        </h1>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-semibold">Vi phạm & điểm cộng</h1>
        <Button type="button" onClick={() => setFormOpen(true)}>
          Ghi nhận mới
        </Button>
      </div>

      <div className="mt-4 max-w-xs">
        <NativeSelect value={studentFilter} onChange={(event) => setStudentFilter(event.target.value)}>
          <option value="">Tất cả học sinh</option>
          {(students ?? []).map((student) => (
            <option key={student._id} value={student._id}>
              {student.fullName}
            </option>
          ))}
        </NativeSelect>
      </div>

      {logsLoading ? (
        <p className="mt-4 text-sm text-fg-muted">Đang tải...</p>
      ) : (
        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ngày</TableHead>
                <TableHead>Học sinh</TableHead>
                <TableHead>Lý do</TableHead>
                <TableHead>Điểm</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(logs ?? []).map((log) => (
                <TableRow key={log._id}>
                  <TableCell>{formatDate(log.date)}</TableCell>
                  <TableCell>{studentMap.get(String(log.studentId)) ?? '—'}</TableCell>
                  <TableCell>
                    {log.catalogItemId
                      ? catalogMap.get(String(log.catalogItemId)) ?? log.note ?? '—'
                      : log.note}
                  </TableCell>
                  <TableCell>
                    <Badge variant={log.points > 0 ? 'success' : 'danger'}>
                      {formatSignedPoints(log.points)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {formOpen && (
        <ConductLogFormDialog open onOpenChange={setFormOpen} classId={classId} />
      )}
    </div>
  );
}
