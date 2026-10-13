import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card';

test('render đủ các phần và card bo 10px viền mảnh bóng nhẹ', () => {
  render(
    <Card data-testid="card">
      <CardHeader>
        <CardTitle>Tổng số ngày nghỉ</CardTitle>
        <CardDescription>Học kỳ 1</CardDescription>
      </CardHeader>
      <CardContent>12</CardContent>
      <CardFooter>Cập nhật hôm nay</CardFooter>
    </Card>,
  );
  expect(screen.getByText('Tổng số ngày nghỉ')).toBeInTheDocument();
  expect(screen.getByText('Học kỳ 1')).toBeInTheDocument();
  expect(screen.getByText('12')).toBeInTheDocument();
  expect(screen.getByText('Cập nhật hôm nay')).toBeInTheDocument();
  expect(screen.getByTestId('card')).toHaveClass('rounded-[10px]', 'border', 'shadow-sm');
});
