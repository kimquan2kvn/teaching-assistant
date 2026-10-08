import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchBox } from './search-box';

test('render input tìm kiếm kèm icon SVG, không emoji', () => {
  render(<SearchBox />);
  expect(screen.getByPlaceholderText('Tìm kiếm...')).toBeInTheDocument();
  const icon = screen.getByTestId('search-icon');
  expect(icon.tagName.toLowerCase()).toBe('svg');
});

test('không truyền props điều khiển → vẫn render y hệt cũ (tương thích ngược)', () => {
  render(<SearchBox />);
  const input = screen.getByPlaceholderText('Tìm kiếm...');
  expect(input).toHaveValue('');
});

test('truyền value/onChange → input có kiểm soát, hiện đúng value và bắn đúng onChange khi gõ', async () => {
  const user = userEvent.setup();
  const handleChange = jest.fn();

  // Component cha thật sự giữ state (giống cách trang tìm nhanh danh mục sẽ dùng) — chứng minh SearchBox
  // không tự giữ state nội bộ ẩn, mà hoàn toàn phụ thuộc vào value được truyền vào từ ngoài.
  function Controlled() {
    const [value, setValue] = useState('ab');
    return (
      <SearchBox
        value={value}
        onChange={(e) => {
          handleChange(e.target.value);
          setValue(e.target.value);
        }}
      />
    );
  }

  render(<Controlled />);
  const input = screen.getByPlaceholderText('Tìm kiếm...');
  expect(input).toHaveValue('ab');

  await user.type(input, 'c');

  expect(handleChange).toHaveBeenCalledWith('abc');
  expect(input).toHaveValue('abc');
});

test('truyền placeholder tuỳ chỉnh → hiện đúng placeholder đó', () => {
  render(<SearchBox placeholder="Tìm danh mục..." />);
  expect(screen.getByPlaceholderText('Tìm danh mục...')).toBeInTheDocument();
});
