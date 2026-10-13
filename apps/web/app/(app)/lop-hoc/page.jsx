'use client';

import Link from 'next/link';
import { useGetMyPositionsQuery } from '@/lib/store/positions-api';
import { buttonVariants } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// HOMEROOM không có tên môn riêng (chỉ có 1 GVCN/lớp) nên hiện nhãn cố định "Chủ nhiệm";
// SUBJECT hiện thẳng tên môn trả về từ backend (đã là tiếng Việt sẵn, không cần map lại).
function positionTypeLabel(position) {
  return position.type === 'HOMEROOM' ? 'Chủ nhiệm' : position.subject;
}

function PositionCard({ position }) {
  const { class: klass } = position;
  return (
    <li>
      <Card>
        <CardContent className="p-4">
          <p className="font-heading text-lg font-semibold">{klass.name}</p>
          <p className="mt-1 text-sm text-fg-muted">
            Mã lớp: <span className="font-medium text-fg">{klass.code}</span>
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            <span className="font-medium text-fg">{positionTypeLabel(position)}</span>
          </p>
          <div className="mt-4 flex gap-4 text-sm">
            <Link href={`/lop-hoc/${klass.id}`} className="font-medium text-brand hover:underline">
              Xem lớp
            </Link>
            <Link href={`/lop-hoc/${klass.id}/hoc-sinh`} className="font-medium text-brand hover:underline">
              Xem học sinh
            </Link>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function PositionListSkeleton() {
  return (
    <div role="status" aria-label="Đang tải danh sách lớp" className="grid gap-4 sm:grid-cols-2">
      {[0, 1, 2].map((key) => (
        <Skeleton key={key} className="h-32 rounded-lg" />
      ))}
    </div>
  );
}

export default function LopHocPage() {
  const { data: positions, isLoading, error } = useGetMyPositionsQuery();

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-semibold">Lớp học của tôi</h1>
        <div className="flex gap-2">
          <Link href="/lop-hoc/tao-moi" className={cn(buttonVariants({ variant: 'default' }))}>
            Tạo lớp mới
          </Link>
          <Link href="/lop-hoc/tham-gia" className={cn(buttonVariants({ variant: 'outline' }))}>
            Tham gia bằng mã lớp
          </Link>
        </div>
      </div>

      <div className="mt-6">
        {isLoading && <PositionListSkeleton />}

        {!isLoading && error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error?.data?.message ?? 'Không tải được danh sách lớp, vui lòng thử lại'}
            </AlertDescription>
          </Alert>
        )}

        {!isLoading && !error && positions?.length === 0 && (
          <Card className="border-dashed p-8 text-center">
            <p className="text-lg font-semibold">Bạn chưa giữ vị trí nào</p>
            <p className="mt-2 text-fg-muted">
              Tạo lớp mới hoặc tham gia bằng mã lớp để bắt đầu quản lý lớp học.
            </p>
          </Card>
        )}

        {!isLoading && !error && positions?.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2">
            {positions.map((position) => (
              <PositionCard key={position.id} position={position} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
