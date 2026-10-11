'use client';

import { useSelector } from 'react-redux';
import { selectCurrentUser } from '@/lib/store/auth-slice';

// Chỉ ẩn/hiện giao diện theo vai trò; quyền thật vẫn do guard ở backend chặn.
// Children chỉ được render khi đúng vai trò: các hook query bên trong không chạy (không bắn request) với vai trò bị chặn.
export function RoleGate({ roles, denied, children }) {
  const currentUser = useSelector(selectCurrentUser);

  // Providers khôi phục user bất đồng bộ sau khi trang mở: user null nghĩa là "chưa biết", không phải "bị từ chối".
  if (!currentUser) {
    return (
      <p role="status" className="p-6 text-sm text-fg-muted">
        Đang tải...
      </p>
    );
  }

  if (!roles.includes(currentUser.role)) {
    if (denied !== undefined) return denied;
    return <p className="p-6 text-sm text-fg-muted">Bạn không có quyền xem trang này</p>;
  }

  return children;
}
