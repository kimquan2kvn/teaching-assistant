import { render, screen } from '@testing-library/react';
import { Label } from './label';

test('render đúng children và gắn kèm input qua htmlFor để đảm bảo accessibility', () => {
  render(
    <>
      <Label htmlFor="fullName">Họ tên</Label>
      <input id="fullName" />
    </>,
  );
  expect(screen.getByText('Họ tên')).toBeInTheDocument();
  expect(screen.getByLabelText('Họ tên')).toBeInTheDocument();
});
