import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

test('render đúng children', () => {
  render(<Badge variant="success">Đang giữ</Badge>);
  expect(screen.getByText('Đang giữ')).toBeInTheDocument();
});

test('variant success map đúng className màu success kèm nền nhạt', () => {
  render(<Badge variant="success">Đang giữ</Badge>);
  expect(screen.getByText('Đang giữ')).toHaveClass('bg-success-soft', 'text-success');
});

test('variant danger map đúng className màu danger kèm nền nhạt', () => {
  render(<Badge variant="danger">Đã khóa</Badge>);
  expect(screen.getByText('Đã khóa')).toHaveClass('bg-danger-soft', 'text-danger');
});

test('variant muted map đúng className màu fg-muted', () => {
  render(<Badge variant="muted">Trống</Badge>);
  expect(screen.getByText('Trống')).toHaveClass('text-fg-muted');
});

test('không truyền variant thì mặc định là muted (nhãn trung tính như bản cũ)', () => {
  render(<Badge>Loại: CK</Badge>);
  expect(screen.getByText('Loại: CK')).toHaveClass('text-fg-muted', 'bg-muted');
});

test('là phần tử inline (span) để đặt được trong đoạn văn/ô bảng; vẫn bo pill', () => {
  render(<Badge variant="success">Đang giữ</Badge>);
  const badge = screen.getByText('Đang giữ');
  expect(badge.tagName).toBe('SPAN');
  expect(badge).toHaveClass('rounded-full');
});

test.each([
  ['default', 'bg-primary'],
  ['secondary', 'bg-secondary'],
  ['destructive', 'bg-destructive'],
  ['outline', 'border-border'],
])('variant shadcn %s vẫn dùng được', (variant, expectedClass) => {
  render(<Badge variant={variant}>Nhãn</Badge>);
  expect(screen.getByText('Nhãn')).toHaveClass(expectedClass);
});
