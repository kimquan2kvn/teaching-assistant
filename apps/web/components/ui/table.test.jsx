import { render, screen, within } from '@testing-library/react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption } from './table';

test('render bảng ngữ nghĩa đúng: caption, cột, hàng, ô', () => {
  render(
    <Table>
      <TableCaption>Danh sách học sinh</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>STT</TableHead>
          <TableHead>Họ tên</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>1</TableCell>
          <TableCell>Nguyễn Văn An</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
  const table = screen.getByRole('table', { name: 'Danh sách học sinh' });
  expect(within(table).getByRole('columnheader', { name: 'Họ tên' })).toBeInTheDocument();
  expect(within(table).getByRole('row', { name: /Nguyễn Văn An/ })).toBeInTheDocument();
  expect(within(table).getByRole('cell', { name: '1' })).toBeInTheDocument();
});

test('bảng rộng cuộn ngang trong khung bọc, không làm tràn trang trên điện thoại', () => {
  render(
    <Table>
      <TableBody>
        <TableRow>
          <TableCell>x</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
  expect(screen.getByRole('table').parentElement).toHaveClass('overflow-auto');
});
