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
//
// Bước 7 (phase2-ui) gate toàn bộ nhóm "Lớp học hằng ngày" theo roles: ['TEACHER', 'ADMIN'] (trước đó 2 mục
// "Điểm danh"/"Vi phạm & điểm cộng" không có role nào) — user mặc định (role=null) giờ làm cả nhóm rỗng và biến
// mất hẳn (xem sidebar.jsx: lọc group rỗng), đúng lớp bug mobile-nav đã từng gặp khi "Lớp học"/"Học sinh" bị
// gate. Preload sẵn role TEACHER (đủ thấy mọi mục trừ "Danh mục vi phạm" chỉ ADMIN mới thấy — không mục nào test
// bên dưới cần tới) để giữ nguyên ý nghĩa test, không đổi gì khác.
function renderMobileNav() {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { user: { id: '1', role: 'TEACHER' }, accessToken: 'x' } },
  });
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
