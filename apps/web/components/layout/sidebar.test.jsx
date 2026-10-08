import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { Sidebar } from './sidebar';
import authReducer from '@/lib/store/auth-slice';

jest.mock('next/navigation', () => ({ usePathname: () => '/' }));

// Sidebar giờ đọc user hiện tại qua useSelector(selectCurrentUser) (Task 7) nên mọi render
// đều cần bọc Provider Redux, kể cả 3 test có sẵn bên dưới — nếu không, useSelector sẽ throw
// "could not find react-redux context value". renderWithRole(null) ~ trạng thái auth mặc định
// (initialState: user=null), nội dung/assertion của 3 test cũ giữ nguyên không đổi.
function renderWithRole(role) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { user: role ? { id: '1', role } : null, accessToken: role ? 'x' : null } },
  });
  return render(
    <Provider store={store}>
      <Sidebar />
    </Provider>,
  );
}

test('render đủ 6 nhóm điều hướng với đúng nhãn', () => {
  // ADMIN thấy mọi mục (kể cả mục đã gate role) nên là role duy nhất khiến cả 6 nhóm có ít
  // nhất 1 mục hiển thị — Sidebar ẩn hẳn 1 nhóm nếu lọc role làm nhóm đó rỗng (xem sidebar.jsx).
  renderWithRole('ADMIN');
  ['Tổng quan', 'Nền tảng', 'Kế hoạch dạy học', 'Lớp học hằng ngày', 'Học tập', 'Khác'].forEach((label) => {
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

test('mục ứng với pathname hiện tại có style active (chữ vàng)', () => {
  renderWithRole(null);
  const active = screen.getByText('Bảng điều khiển');
  expect(active.closest('a')).toHaveClass('text-sidebar-active-fg');
});

test('mỗi mục điều hướng có icon SVG thật, không emoji/icon font', () => {
  renderWithRole(null);
  const links = screen.getAllByRole('link');
  expect(links.length).toBeGreaterThan(0);
  links.forEach((link) => {
    const icon = link.querySelector('svg');
    expect(icon).not.toBeNull();
  });
});

test('mục có roles=["ADMIN"] ẨN với role TEACHER', () => {
  renderWithRole('TEACHER');
  expect(screen.queryByText('Quản lý giáo viên')).not.toBeInTheDocument();
});

test('mục có roles=["ADMIN"] HIỆN với role ADMIN', () => {
  renderWithRole('ADMIN');
  expect(screen.getByText('Quản lý giáo viên')).toBeInTheDocument();
});

test('mục có roles=["ADMIN"] ẨN khi chưa biết role (user=null, chưa khôi phục phiên xong)', () => {
  renderWithRole(null);
  expect(screen.queryByText('Quản lý giáo viên')).not.toBeInTheDocument();
});

test('mục "Lớp học" và "Học sinh" ẨN với role STUDENT', () => {
  renderWithRole('STUDENT');
  expect(screen.queryByText('Lớp học')).not.toBeInTheDocument();
  expect(screen.queryByText('Học sinh')).not.toBeInTheDocument();
});
