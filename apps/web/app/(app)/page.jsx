'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useGetMyPositionsQuery } from '@/lib/store/positions-api';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ClassDashboardContent } from './lop-hoc/[classId]/bang-dieu-khien/page';

// 1 giáo viên có thể giữ NHIỀU Position cùng trỏ về 1 lớp (vd GVCN đồng thời giữ 1 vị trí SUBJECT của chính
// lớp mình) — dedupe theo `class.id` để liệt kê đúng SỐ LỚP đang phụ trách, không phải số vị trí đang giữ.
function dedupeClasses(positions) {
  const byClassId = new Map();
  for (const position of positions ?? []) {
    if (!byClassId.has(position.class.id)) byClassId.set(position.class.id, position.class);
  }
  return [...byClassId.values()];
}

// Tái dùng đúng style thẻ `PositionCard` đã có ở `/lop-hoc/page.jsx`, chỉ đổi đích link sang thẳng bảng điều
// khiển của lớp (thay vì "Xem lớp"/"Xem học sinh") vì đây là lối vào để XEM DASHBOARD, không phải quản lý lớp.
function ClassCard({ klass }) {
  return (
    <li className="rounded-lg border border-border p-4">
      <p className="font-heading text-lg font-semibold">{klass.name}</p>
      <p className="mt-1 text-sm text-fg-muted">
        Mã lớp: <span className="font-medium text-fg">{klass.code}</span>
      </p>
      <div className="mt-4 text-sm">
        <Link href={`/lop-hoc/${klass.id}/bang-dieu-khien`} className="font-medium text-brand hover:underline">
          Xem bảng điều khiển
        </Link>
      </div>
    </li>
  );
}

export default function DashboardPage() {
  const { data: positions, isLoading, error } = useGetMyPositionsQuery();
  const classes = useMemo(() => dedupeClasses(positions), [positions]);

  return (
    <div className="p-6">
      {isLoading && <p className="text-fg-muted">Đang tải...</p>}

      {!isLoading && error && (
        <>
          <h1 className="font-heading text-2xl font-semibold">Tổng quan</h1>
          <p className="mt-2 text-sm text-danger">
            {error?.data?.message ?? 'Không tải được danh sách lớp, vui lòng thử lại'}
          </p>
        </>
      )}

      {/* 0 lớp: giữ nguyên CTA kiểu /lop-hoc (tạo lớp mới/tham gia bằng mã lớp) thay cho placeholder tĩnh cũ —
          đây là trạng thái phổ biến của giáo viên mới chưa tạo/tham gia lớp nào, không phải lỗi. */}
      {!isLoading && !error && classes.length === 0 && (
        <>
          <h1 className="font-heading text-2xl font-semibold">Tổng quan</h1>
          <div className="mt-6 rounded-lg border border-dashed border-border p-8 text-center">
            <p className="text-lg font-semibold">Bạn chưa giữ vị trí nào</p>
            <p className="mt-2 text-fg-muted">
              Tạo lớp mới hoặc tham gia bằng mã lớp để bắt đầu quản lý lớp học.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link href="/lop-hoc/tao-moi" className={cn(buttonVariants({ variant: 'default' }))}>
                Tạo lớp mới
              </Link>
              <Link href="/lop-hoc/tham-gia" className={cn(buttonVariants({ variant: 'outline' }))}>
                Tham gia bằng mã lớp
              </Link>
            </div>
          </div>
        </>
      )}

      {/* Đúng 1 lớp (trường hợp phổ biến nhất, vd 1 GVCN/1 lớp): nhúng thẳng dashboard của lớp đó, không cần
          người dùng chọn gì thêm. */}
      {!isLoading && !error && classes.length === 1 && (
        <>
          <h1 className="font-heading text-2xl font-semibold">{classes[0].name}</h1>
          <div className="mt-6">
            <ClassDashboardContent classId={classes[0].id} />
          </div>
        </>
      )}

      {/* Nhiều lớp: hiện danh sách để người dùng TỰ chọn, không tự ý nhúng dashboard của 1 lớp bất kỳ. */}
      {!isLoading && !error && classes.length > 1 && (
        <>
          <h1 className="font-heading text-2xl font-semibold">Tổng quan</h1>
          <p className="mt-2 text-fg-muted">Chọn lớp để xem bảng điều khiển</p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {classes.map((klass) => (
              <ClassCard key={klass.id} klass={klass} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
