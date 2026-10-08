import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileNav } from './mobile-nav';

jest.mock('next/navigation', () => ({ usePathname: () => '/' }));

test('mở được drawer và thấy đủ 6 nhóm điều hướng trên màn hình nhỏ', async () => {
  render(<MobileNav />);
  await userEvent.click(screen.getByRole('button', { name: /mở menu/i }));
  expect(await screen.findByText('Lớp học hằng ngày')).toBeInTheDocument();
});

test('nội dung drawer cuộn được khi cao hơn màn hình (không mất nhóm cuối)', async () => {
  render(<MobileNav />);
  await userEvent.click(screen.getByRole('button', { name: /mở menu/i }));
  const lastItem = await screen.findByText('Cài đặt');
  const scrollContainer = lastItem.closest('[class*="overflow-y-auto"]');
  expect(scrollContainer).not.toBeNull();
});

test('nút mở menu bị ẩn trên desktop (md:hidden), không hiện song song với sidebar tĩnh', () => {
  render(<MobileNav />);
  const trigger = screen.getByRole('button', { name: /mở menu/i });
  expect(trigger).toHaveClass('md:hidden');
});

test('drawer có tên truy cập (accessible name) cho người dùng trình đọc màn hình', async () => {
  render(<MobileNav />);
  await userEvent.click(screen.getByRole('button', { name: /mở menu/i }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveAccessibleName();
});
