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
