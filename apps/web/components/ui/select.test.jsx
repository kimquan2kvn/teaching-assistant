import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './select';

test('render đúng các option truyền vào qua children và đúng value đang chọn', () => {
  render(
    <Select value="TOAN" onChange={() => {}}>
      <option value="TOAN">Toán</option>
      <option value="VAN">Văn</option>
    </Select>,
  );
  expect(screen.getByRole('combobox')).toHaveValue('TOAN');
  expect(screen.getByRole('option', { name: 'Văn' })).toBeInTheDocument();
});

test('bắn đúng sự kiện onChange khi chọn option khác', async () => {
  const handleChange = jest.fn();
  render(
    <Select value="TOAN" onChange={handleChange}>
      <option value="TOAN">Toán</option>
      <option value="VAN">Văn</option>
    </Select>,
  );
  await userEvent.selectOptions(screen.getByRole('combobox'), 'VAN');
  expect(handleChange).toHaveBeenCalledTimes(1);
});
