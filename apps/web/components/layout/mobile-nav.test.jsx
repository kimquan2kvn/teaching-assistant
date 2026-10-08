import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileNav } from './mobile-nav';

jest.mock('next/navigation', () => ({ usePathname: () => '/' }));

test('mở được drawer và thấy đủ 6 nhóm điều hướng trên màn hình nhỏ', async () => {
  render(<MobileNav />);
  await userEvent.click(screen.getByRole('button', { name: /mở menu/i }));
  expect(await screen.findByText('Lớp học hằng ngày')).toBeInTheDocument();
});
