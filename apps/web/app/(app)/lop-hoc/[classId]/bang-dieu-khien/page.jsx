'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useGetClassDashboardQuery } from '@/lib/store/dashboard-api';
import { useGetStudentsQuery } from '@/lib/store/students-api';
import { useGetConductCatalogQuery } from '@/lib/store/conduct-catalog-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { buildIdNameMap, formatDate, formatSignedPoints, todayDateOnly } from '@/lib/utils';

const ATTENDANCE_LABELS = { PRESENT: 'Có mặt', EXCUSED: 'Phép', LATE: 'Muộn', UNEXCUSED: 'Không phép' };
// Binance convention đã dùng ở trang điểm danh: xanh = có mặt, đỏ = vắng không phép, phép/muộn trung tính.
const ATTENDANCE_VARIANTS = { PRESENT: 'success', EXCUSED: 'muted', LATE: 'muted', UNEXCUSED: 'danger' };

// Cộng/trừ ngày trên chuỗi yyyy-mm-dd bằng mốc UTC-midnight để tránh lệch ngày theo múi giờ trình duyệt —
// cùng lý do formatDate ở utils.js dùng timeZone: 'UTC'.
function addDays(dateStr, delta) {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

// Xếp 1 vài học sinh điểm cao nhất/thấp nhất của tuần hiện tại để hiện gọn trên dashboard (xem đầy đủ ở trang
// riêng `xep-loai`) — không lặp lại học sinh đã nằm trong nhóm cao nhất khi danh sách ngắn (vd lớp có 2 học
// sinh thì "thấp nhất" không nên lặp lại đúng người vừa hiện ở "cao nhất").
function splitTopBottom(conductRating) {
  const sorted = [...(conductRating ?? [])].sort((a, b) => b.score - a.score);
  const top = sorted.slice(0, 3);
  const topIds = new Set(top.map((r) => r.studentId));
  const bottom = [...sorted]
    .reverse()
    .slice(0, 3)
    .filter((r) => !topIds.has(r.studentId));
  return { top, bottom };
}

// Nội dung 4 khối dashboard của 1 lớp — tách riêng khỏi `BangDieuKhienPage` (trang `/lop-hoc/[classId]/bang-
// dieu-khien`) để trang chủ `/` cũng tái dùng được NGUYÊN nội dung này khi người dùng chỉ giữ đúng 1 lớp (xem
// `app/(app)/page.jsx`), tránh viết lặp lại cùng 1 khối UI ở 2 nơi.
export function ClassDashboardContent({ classId }) {
  const [date, setDate] = useState(todayDateOnly);

  const { data, isLoading, isError, error } = useGetClassDashboardQuery({ classId, date });
  // status: 'ALL' (không phải 'ACTIVE') vì đây là trang hiển thị LỊCH SỬ (vi phạm/chép phạt gần đây có thể
  // thuộc về học sinh đã chuyển lớp) — đúng quy ước đã nêu ở Bước 1/6 của plan.
  const { data: students } = useGetStudentsQuery({ classId, status: 'ALL' });
  const { data: catalog } = useGetConductCatalogQuery();
  const studentNameById = useMemo(() => buildIdNameMap(students, 'fullName'), [students]);
  const catalogLabelById = useMemo(() => buildIdNameMap(catalog, 'label'), [catalog]);

  if (isError) {
    return (
      <h1 className="font-heading text-xl font-semibold">
        {error?.status === 403 ? 'Bạn không có quyền xem lớp này' : 'Không tìm thấy lớp'}
      </h1>
    );
  }

  if (isLoading || !data) {
    return <p className="text-fg-muted">Đang tải...</p>;
  }

  const { attendanceSummary, recentConductLogs, conductRating, pendingPunishments } = data;
  const { top: topRating, bottom: bottomRating } = splitTopBottom(conductRating);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setDate((d) => addDays(d, -1))}>
          Ngày trước
        </Button>
        <Input
          type="date"
          aria-label="Chọn ngày"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-8 w-auto px-2"
        />
        <Button type="button" variant="outline" size="sm" onClick={() => setDate((d) => addDays(d, 1))}>
          Ngày sau
        </Button>
      </div>
      <p className="mt-2 text-xs text-fg-muted">
        Ngày đang chọn chỉ ảnh hưởng thống kê điểm danh và tuần của xếp loại rèn luyện bên dưới — vi phạm/điểm
        cộng gần nhất và chép phạt chưa nộp luôn hiện dữ liệu mới nhất, không đổi theo ngày này.
      </p>

      <section className="mt-6">
        <h2 className="font-heading text-lg font-semibold">Điểm danh chính thức của lớp (GVCN)</h2>
        <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(ATTENDANCE_LABELS).map(([status, label]) => (
            <Card key={status} className="p-4">
              <Badge variant={ATTENDANCE_VARIANTS[status]}>{label}</Badge>
              <p className="mt-2 text-2xl font-semibold">{attendanceSummary?.[status] ?? 0}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-heading text-lg font-semibold">20 vi phạm/điểm cộng gần nhất</h2>
        {recentConductLogs?.length === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">Chưa có nhật ký vi phạm/điểm cộng nào.</p>
        ) : (
          <div className="mt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Học sinh</TableHead>
                  <TableHead>Điểm</TableHead>
                  <TableHead>Lý do</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentConductLogs?.map((log) => (
                  <TableRow key={log._id}>
                    <TableCell>{formatDate(log.date)}</TableCell>
                    <TableCell>{studentNameById.get(String(log.studentId)) ?? '—'}</TableCell>
                    <TableCell>{formatSignedPoints(log.points)}</TableCell>
                    <TableCell>
                      {log.catalogItemId
                        ? catalogLabelById.get(String(log.catalogItemId)) ?? log.note ?? '—'
                        : log.note}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-heading text-lg font-semibold">Xếp loại rèn luyện tuần này</h2>
          <Link href={`/lop-hoc/${classId}/xep-loai`} className="text-sm font-medium text-brand hover:underline">
            Xem đầy đủ
          </Link>
        </div>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-fg-muted">Cao nhất</p>
            <ul className="mt-1 flex flex-col gap-1">
              {topRating.map((r) => (
                <li key={r.studentId} className="flex items-center justify-between gap-2 text-sm">
                  <span>{studentNameById.get(String(r.studentId)) ?? '—'}</span>
                  <Badge variant="success">{r.label}</Badge>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm text-fg-muted">Thấp nhất</p>
            <ul className="mt-1 flex flex-col gap-1">
              {bottomRating.map((r) => (
                <li key={r.studentId} className="flex items-center justify-between gap-2 text-sm">
                  <span>{studentNameById.get(String(r.studentId)) ?? '—'}</span>
                  <Badge variant="danger">{r.label}</Badge>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-heading text-lg font-semibold">
            Chép phạt chưa nộp ({pendingPunishments?.length ?? 0})
          </h2>
          <Link href={`/lop-hoc/${classId}/chep-phat`} className="text-sm font-medium text-brand hover:underline">
            Xem đầy đủ
          </Link>
        </div>
        {pendingPunishments?.length === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">Không có chép phạt nào đang chờ nộp.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {pendingPunishments?.map((p) => (
              <li key={p._id} className="flex items-center justify-between gap-4 border-b border-border py-2 text-sm">
                <span>{studentNameById.get(String(p.studentId)) ?? '—'}</span>
                <span className="flex-1 px-4 text-fg-muted">{p.reason}</span>
                <span>{p.lines} dòng</span>
                <span>{formatDate(p.dueDate)}</span>
                <Badge variant="muted">Chưa nộp</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function BangDieuKhienPage() {
  const { classId } = useParams();

  return (
    <div className="p-6">
      <h1 className="font-heading text-2xl font-semibold">Bảng điều khiển lớp</h1>
      <div className="mt-6">
        <ClassDashboardContent classId={classId} />
      </div>
    </div>
  );
}
