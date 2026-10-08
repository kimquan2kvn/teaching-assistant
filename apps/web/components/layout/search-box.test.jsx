import { render, screen } from '@testing-library/react';
import { SearchBox } from './search-box';

test('render input tìm kiếm kèm icon SVG, không emoji', () => {
  render(<SearchBox />);
  expect(screen.getByPlaceholderText('Tìm kiếm...')).toBeInTheDocument();
  const icon = screen.getByTestId('search-icon');
  expect(icon.tagName.toLowerCase()).toBe('svg');
});
