import { render, screen } from '@testing-library/react';
import { SearchIcon } from './search-icon';

test('render ra SVG thật, không phải emoji hay icon font', () => {
  render(<SearchIcon data-testid="search-icon" />);
  const icon = screen.getByTestId('search-icon');
  expect(icon.tagName.toLowerCase()).toBe('svg');
});
