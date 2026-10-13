import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './select';

// jsdom thiếu các API trình duyệt mà Radix Select gọi khi mở danh sách.
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = jest.fn();
  window.HTMLElement.prototype.setPointerCapture = jest.fn();
  window.HTMLElement.prototype.releasePointerCapture = jest.fn();
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

function renderSubjectSelect(props) {
  return render(
    <Select {...props}>
      <SelectTrigger aria-label="Môn học">
        <SelectValue placeholder="Chọn môn" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="TOAN">Toán</SelectItem>
        <SelectItem value="VAN">Văn</SelectItem>
      </SelectContent>
    </Select>,
  );
}

test('hiện placeholder khi chưa chọn và tên mục khi đã có value', () => {
  const { unmount } = renderSubjectSelect({});
  expect(screen.getByRole('combobox', { name: 'Môn học' })).toHaveTextContent('Chọn môn');
  unmount();

  renderSubjectSelect({ defaultValue: 'VAN' });
  expect(screen.getByRole('combobox', { name: 'Môn học' })).toHaveTextContent('Văn');
});

test('mở danh sách và chọn mục bắn onValueChange với đúng value', async () => {
  const handleValueChange = jest.fn();
  renderSubjectSelect({ onValueChange: handleValueChange });
  await userEvent.click(screen.getByRole('combobox', { name: 'Môn học' }));
  await userEvent.click(await screen.findByRole('option', { name: 'Toán' }));
  expect(handleValueChange).toHaveBeenCalledWith('TOAN');
});

test('disabled thì không mở được danh sách', async () => {
  renderSubjectSelect({ disabled: true });
  expect(screen.getByRole('combobox', { name: 'Môn học' })).toBeDisabled();
});
