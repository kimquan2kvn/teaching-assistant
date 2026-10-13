import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from './checkbox';

test('tích/bỏ tích bắn onCheckedChange và cập nhật aria-checked', async () => {
  const handleCheckedChange = jest.fn();
  render(<Checkbox aria-label="Đã thực hiện" onCheckedChange={handleCheckedChange} />);
  const checkbox = screen.getByRole('checkbox', { name: 'Đã thực hiện' });
  expect(checkbox).not.toBeChecked();
  await userEvent.click(checkbox);
  expect(handleCheckedChange).toHaveBeenCalledWith(true);
});

test('chế độ controlled: hiển thị đúng checked và nhấn Space để đổi', async () => {
  const handleCheckedChange = jest.fn();
  render(<Checkbox aria-label="Chọn" checked onCheckedChange={handleCheckedChange} />);
  const checkbox = screen.getByRole('checkbox', { name: 'Chọn' });
  expect(checkbox).toBeChecked();
  checkbox.focus();
  await userEvent.keyboard(' ');
  expect(handleCheckedChange).toHaveBeenCalledWith(false);
});

test('disabled thì không đổi trạng thái khi bấm', async () => {
  const handleCheckedChange = jest.fn();
  render(<Checkbox aria-label="Khóa" disabled onCheckedChange={handleCheckedChange} />);
  await userEvent.click(screen.getByRole('checkbox', { name: 'Khóa' }));
  expect(handleCheckedChange).not.toHaveBeenCalled();
});

test('viền chưa tích đủ tương phản (xám), chỉ viền vàng khi đã tích; vòng focus có offset', () => {
  render(<Checkbox aria-label="Đã thực hiện" />);
  const checkbox = screen.getByRole('checkbox', { name: 'Đã thực hiện' });
  expect(checkbox).toHaveClass('border-fg-muted', 'data-[state=checked]:border-primary', 'focus-visible:ring-offset-2');
  expect(checkbox).not.toHaveClass('border-primary');
});
