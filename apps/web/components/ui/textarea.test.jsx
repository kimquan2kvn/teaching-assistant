import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from './textarea';

test('render đúng value truyền vào', () => {
  render(<Textarea value="Nội dung lý do" onChange={() => {}} placeholder="Nhập lý do" />);
  expect(screen.getByPlaceholderText('Nhập lý do')).toHaveValue('Nội dung lý do');
});

test('bắn đúng sự kiện onChange khi gõ', async () => {
  const handleChange = jest.fn();
  render(<Textarea value="" onChange={handleChange} placeholder="Nhập lý do" />);
  await userEvent.type(screen.getByPlaceholderText('Nhập lý do'), 'a');
  expect(handleChange).toHaveBeenCalled();
});
