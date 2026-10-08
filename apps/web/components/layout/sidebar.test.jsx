import { render, screen } from '@testing-library/react';
import { Sidebar } from './sidebar';

jest.mock('next/navigation', () => ({ usePathname: () => '/' }));

test('render đủ 6 nhóm điều hướng với đúng nhãn', () => {
  render(<Sidebar />);
  ['Tổng quan', 'Nền tảng', 'Kế hoạch dạy học', 'Lớp học hằng ngày', 'Học tập', 'Khác'].forEach((label) => {
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

test('mục ứng với pathname hiện tại có style active (chữ vàng)', () => {
  render(<Sidebar />);
  const active = screen.getByText('Bảng điều khiển');
  expect(active.closest('a')).toHaveClass('text-sidebar-active-fg');
});
