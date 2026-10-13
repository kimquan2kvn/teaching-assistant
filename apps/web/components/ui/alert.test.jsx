import { render, screen } from '@testing-library/react';
import { Alert, AlertTitle, AlertDescription } from './alert';

test('mặc định có role="alert" để trình đọc màn hình đọc ngay', () => {
  render(
    <Alert>
      <AlertTitle>Lỗi</AlertTitle>
      <AlertDescription>Không tải được dữ liệu</AlertDescription>
    </Alert>,
  );
  const alert = screen.getByRole('alert');
  expect(alert).toHaveTextContent('Lỗi');
  expect(alert).toHaveTextContent('Không tải được dữ liệu');
});

test('ghi đè role="status" cho thông báo thành công không khẩn cấp', () => {
  render(
    <Alert role="status" variant="success">
      Đã lưu
    </Alert>,
  );
  const status = screen.getByRole('status');
  expect(status).toHaveClass('bg-success-soft', 'text-foreground');
  expect(status).not.toHaveClass('text-success');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('variant destructive dùng nền danger nhạt và chữ đỏ', () => {
  render(<Alert variant="destructive">Mã lớp không đúng</Alert>);
  expect(screen.getByRole('alert')).toHaveClass('bg-danger-soft', 'text-destructive');
});
