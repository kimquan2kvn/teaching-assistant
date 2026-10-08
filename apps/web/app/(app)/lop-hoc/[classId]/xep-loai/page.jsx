'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useGetStudentsQuery } from '@/lib/store/students-api';
import { useGetClassConductRatingQuery } from '@/lib/store/conduct-rating-api';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { buildIdNameMap } from '@/lib/utils';

// Nhãn xếp loại đã được BE tính sẵn qua getConductRatingLabel (packages/shared/src/constants/conduct.ts) và
// trả thẳng trong response — FE CHỈ ánh xạ nhãn ĐÚNG NGUYÊN VĂN sang màu Badge, KHÔNG tự suy lại ngưỡng điểm
// (dễ sai ngưỡng nếu tự làm, vd nhầm 100 điểm là "Đạt" thay vì "Xuất sắc" vì ngưỡng Xuất sắc là >= 95).
const LABEL_VARIANT = {
  'Xuất sắc': 'success',
  'Tốt': 'success',
  'Khá': 'muted',
  'Đạt': 'muted',
  'Cần rèn luyện': 'danger',
  'Chưa đạt': 'danger',
};

function todayDateOnly() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function XepLoaiPage() {
  const { classId } = useParams();
  const [date, setDate] = useState(todayDateOnly);

  // status: 'ACTIVE' là đủ cho trang này vì BE (getWeeklyRating) tự giới hạn theo roster đang học — không
  // cần 'ALL' như các trang hiển thị LỊCH SỬ (vi-pham, chep-phat, dashboard).
  const { data: students } = useGetStudentsQuery({ classId, status: 'ACTIVE' });
  const {
    data: rating,
    isLoading,
    isError,
    error,
  } = useGetClassConductRatingQuery({ classId, date });

  const nameById = useMemo(() => buildIdNameMap(students, 'fullName'), [students]);

  const sortedRating = useMemo(() => {
    if (!rating) return [];
    return [...rating].sort((a, b) => b.score - a.score);
  }, [rating]);

  // GET .../conduct-rating có PositionGuard('ANY') — không giữ vị trí nào của lớp này (vd gõ nhầm URL) phải
  // hiện đúng "không có quyền", KHÔNG được render bảng rỗng (trông giống "lớp chưa có dữ liệu").
  if (isError) {
    return (
      <div className="p-6">
        <h1 className="font-heading text-xl font-semibold">
          {error?.status === 403 ? 'Bạn không có quyền xem lớp này' : 'Không tìm thấy lớp'}
        </h1>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-semibold">Xếp loại rèn luyện theo tuần</h1>
        <div className="w-48">
          <Label htmlFor="xep-loai-date">Chọn tuần (theo ngày)</Label>
          <Input id="xep-loai-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <p className="mt-4 text-sm text-fg-muted">Đang tải...</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-fg-muted">
                <th className="py-2 pr-4">STT</th>
                <th className="py-2 pr-4">Học sinh</th>
                <th className="py-2 pr-4">Điểm</th>
                <th className="py-2 pr-4">Xếp loại</th>
              </tr>
            </thead>
            <tbody>
              {sortedRating.map((row, index) => (
                <tr key={row.studentId} className="border-t border-border">
                  <td className="py-2 pr-4">{index + 1}</td>
                  <td className="py-2 pr-4">{nameById.get(row.studentId) ?? '—'}</td>
                  <td className="py-2 pr-4 font-mono">{row.score}</td>
                  <td className="py-2 pr-4">
                    <Badge variant={LABEL_VARIANT[row.label] ?? 'muted'}>{row.label}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
