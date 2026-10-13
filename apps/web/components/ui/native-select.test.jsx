import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NativeSelect, NativeSelectOption, NativeSelectOptGroup } from './native-select';

test('render đúng các option truyền vào qua children và đúng value đang chọn', () => {
  render(
    <NativeSelect value="TOAN" onChange={() => {}}>
      <option value="TOAN">Toán</option>
      <option value="VAN">Văn</option>
    </NativeSelect>,
  );
  expect(screen.getByRole('combobox')).toHaveValue('TOAN');
  expect(screen.getByRole('option', { name: 'Văn' })).toBeInTheDocument();
});

test('bắn đúng sự kiện onChange khi chọn option khác', async () => {
  const handleChange = jest.fn();
  render(
    <NativeSelect value="TOAN" onChange={handleChange}>
      <option value="TOAN">Toán</option>
      <option value="VAN">Văn</option>
    </NativeSelect>,
  );
  await userEvent.selectOptions(screen.getByRole('combobox'), 'VAN');
  expect(handleChange).toHaveBeenCalledTimes(1);
});

test('gắn nhãn qua htmlFor/id để getByLabelText tìm được thẻ select gốc', () => {
  render(
    <>
      <label htmlFor="subject">Môn</label>
      <NativeSelect id="subject" defaultValue="">
        <option value="">Chọn môn</option>
      </NativeSelect>
    </>,
  );
  expect(screen.getByLabelText('Môn').tagName).toBe('SELECT');
});

test('className và ref đi vào thẻ select, không phải khung bọc; disabled được chuyển xuống', () => {
  const ref = createRef();
  render(
    <NativeSelect ref={ref} className="w-40" disabled aria-label="Tháng">
      <option value="1">Tháng 1</option>
    </NativeSelect>,
  );
  const select = screen.getByRole('combobox', { name: 'Tháng' });
  expect(select).toHaveClass('w-40');
  expect(select).toBeDisabled();
  expect(ref.current).toBe(select);
});

test('hỗ trợ NativeSelectOption và NativeSelectOptGroup (shadcn) và chọn được bằng userEvent', async () => {
  const handleChange = jest.fn();
  render(
    <NativeSelect aria-label="Môn" defaultValue="TOAN" onChange={handleChange}>
      <NativeSelectOptGroup label="Tự nhiên">
        <NativeSelectOption value="TOAN">Toán</NativeSelectOption>
        <NativeSelectOption value="LY">Lý</NativeSelectOption>
      </NativeSelectOptGroup>
    </NativeSelect>,
  );
  await userEvent.selectOptions(screen.getByRole('combobox'), 'LY');
  expect(handleChange).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('combobox')).toHaveValue('LY');
});

test('size="sm" đặt data-size để thu thấp ô chọn', () => {
  render(
    <NativeSelect size="sm" aria-label="Năm">
      <option>2026</option>
    </NativeSelect>,
  );
  expect(screen.getByRole('combobox')).toHaveAttribute('data-size', 'sm');
});

test('icon mũi tên chỉ trang trí: ẩn khỏi cây truy cập', () => {
  const { container } = render(
    <NativeSelect aria-label="Năm">
      <option>2026</option>
    </NativeSelect>,
  );
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
});
