import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './input';

test('render đúng value và bắn onChange khi gõ', async () => {
  const handleChange = jest.fn();
  render(<Input value="" onChange={handleChange} placeholder="Họ tên" />);
  await userEvent.type(screen.getByPlaceholderText('Họ tên'), 'a');
  expect(handleChange).toHaveBeenCalled();
});

test('truyền type xuống thẻ input (date/password) và nhận ref', () => {
  render(<Input type="date" aria-label="Ngày" />);
  expect(screen.getByLabelText('Ngày')).toHaveAttribute('type', 'date');
});

test('disabled được chuyển xuống thẻ input', () => {
  render(<Input disabled aria-label="Mã lớp" />);
  expect(screen.getByLabelText('Mã lớp')).toBeDisabled();
});
