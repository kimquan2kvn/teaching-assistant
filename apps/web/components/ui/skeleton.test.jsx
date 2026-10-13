import { render, screen } from '@testing-library/react';
import { Skeleton } from './skeleton';
import { Separator } from './separator';

test('Skeleton nhận className kích thước và có hiệu ứng pulse', () => {
  render(<Skeleton data-testid="sk" className="h-4 w-24" />);
  expect(screen.getByTestId('sk')).toHaveClass('animate-pulse', 'h-4', 'w-24');
});

test('Separator ngang là trang trí (không vào cây truy cập), dọc có role separator khi decorative=false', () => {
  const { container, rerender } = render(<Separator />);
  expect(container.firstChild).toHaveAttribute('role', 'none');
  rerender(<Separator orientation="vertical" decorative={false} />);
  expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'vertical');
});
