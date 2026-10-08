import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  return (
    <div className="p-6">
      <h1 className="font-heading text-2xl font-semibold">Tổng quan</h1>
      <p className="mt-2 text-fg-muted">Dữ liệu thật sẽ hiển thị từ Phase 2.</p>
      <Button className="mt-4">Xem chi tiết</Button>
    </div>
  );
}
