import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, buttonVariants } from './button';

test('mặc định là nút pill vàng chữ đen, hover đậm hơn', () => {
  render(<Button>Lưu</Button>);
  expect(screen.getByRole('button', { name: 'Lưu' })).toHaveClass(
    'rounded-full',
    'bg-primary',
    'text-primary-foreground',
    'hover:bg-brand-hover',
  );
});

test.each([
  ['outline', 'border-border'],
  ['ghost', 'hover:bg-accent'],
  ['destructive', 'bg-destructive'],
  ['secondary', 'bg-secondary'],
  ['link', 'underline-offset-4'],
])('variant %s map đúng className', (variant, expectedClass) => {
  render(<Button variant={variant}>Nút</Button>);
  expect(screen.getByRole('button', { name: 'Nút' })).toHaveClass(expectedClass);
});

test.each([
  ['default', 'h-10'],
  ['sm', 'h-8'],
  ['lg', 'h-12'],
  ['icon', 'w-10'],
])('size %s map đúng className', (size, expectedClass) => {
  render(<Button size={size}>Nút</Button>);
  expect(screen.getByRole('button', { name: 'Nút' })).toHaveClass(expectedClass);
});

test('mọi variant đều giữ bo pill (rounded-full)', () => {
  for (const variant of ['default', 'outline', 'ghost', 'destructive', 'secondary']) {
    expect(buttonVariants({ variant })).toContain('rounded-full');
  }
});

test('bắn onClick, và không bắn khi disabled', async () => {
  const handleClick = jest.fn();
  const { rerender } = render(<Button onClick={handleClick}>Lưu</Button>);
  await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
  expect(handleClick).toHaveBeenCalledTimes(1);

  rerender(
    <Button onClick={handleClick} disabled>
      Lưu
    </Button>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
  expect(handleClick).toHaveBeenCalledTimes(1);
});

test('buttonVariants áp được lên thẻ <a> và nhận className bổ sung', () => {
  render(
    <a href="/lop-hoc" className={buttonVariants({ variant: 'outline', className: 'mt-4' })}>
      Về lớp
    </a>,
  );
  expect(screen.getByRole('link', { name: 'Về lớp' })).toHaveClass('border-border', 'mt-4', 'rounded-full');
});

test('asChild render nút lên phần tử con (dùng với next/link)', () => {
  render(
    <Button asChild>
      <a href="/tao-moi">Tạo lớp</a>
    </Button>,
  );
  const link = screen.getByRole('link', { name: 'Tạo lớp' });
  expect(link).toHaveClass('bg-primary');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
