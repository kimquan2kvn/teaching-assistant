'use client';

import { useDispatch, useSelector } from 'react-redux';
import { useRouter } from 'next/navigation';
import { selectCurrentUser, clearCredentials } from '@/lib/store/auth-slice';
import { useLogoutMutation } from '@/lib/store/api-slice';
import { Button } from '@/components/ui/button';

export function UserMenu() {
  const user = useSelector(selectCurrentUser);
  const [logout] = useLogoutMutation();
  const dispatch = useDispatch();
  const router = useRouter();

  if (!user) return null;

  async function handleLogout() {
    try {
      await logout().unwrap();
    } finally {
      dispatch(clearCredentials());
      router.push('/dang-nhap');
    }
  }

  return (
    <div className="ml-auto flex items-center gap-3">
      <span className="text-sm text-fg">{user.fullName}</span>
      <Button variant="ghost" size="sm" onClick={handleLogout}>
        Đăng xuất
      </Button>
    </div>
  );
}
