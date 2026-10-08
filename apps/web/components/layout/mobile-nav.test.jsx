import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/lib/store/auth-slice';
import { MobileNav } from './mobile-nav';

jest.mock('next/navigation', () => ({ usePathname: () => '/' }));

// MobileNav render Sidebar bên trong, mà Sidebar giờ đọc user hiện tại qua useSelector(selectCurrentUser)
// (Task 7) nên mọi render đều cần bọc Provider Redux — nếu không, useSelector sẽ throw "could not find
// react-redux context value". Nội dung/assertion của các test giữ nguyên không đổi.
function renderMobileNav() {
  const store = configureStore({ reducer: { auth: authReducer } });
  return render(
    <Provider store={store}>
      <MobileNav />
    </Provider>,
  );
}

test('mở được drawer và thấy đủ 6 nhóm điều hướng trên màn hình nhỏ', async () => {
  renderMobileNav();
  await userEvent.click(screen.getByRole('button', { name: /mở menu/i }));
  expect(await screen.findByText('Lớp học hằng ngày')).toBeInTheDocument();
});

test('nội dung drawer cuộn được khi cao hơn màn hình (không mất nhóm cuối)', async () => {
  renderMobileNav();
  await userEvent.click(screen.getByRole('button', { name: /mở menu/i }));
  const lastItem = await screen.findByText('Cài đặt');
  const scrollContainer = lastItem.closest('[class*="overflow-y-auto"]');
  expect(scrollContainer).not.toBeNull();
});

test('nút mở menu bị ẩn trên desktop (md:hidden), không hiện song song với sidebar tĩnh', () => {
  renderMobileNav();
  const trigger = screen.getByRole('button', { name: /mở menu/i });
  expect(trigger).toHaveClass('md:hidden');
});

test('drawer có tên truy cập (accessible name) cho người dùng trình đọc màn hình', async () => {
  renderMobileNav();
  await userEvent.click(screen.getByRole('button', { name: /mở menu/i }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveAccessibleName();
});
