import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sheet, SheetTrigger, SheetContent, SheetTitle } from './sheet';

test('mở drawer khi bấm trigger, có tên truy cập và cuộn được khi nội dung dài', async () => {
  render(
    <Sheet>
      <SheetTrigger>Mở menu</SheetTrigger>
      <SheetContent side="left">
        <SheetTitle>Menu điều hướng</SheetTitle>
      </SheetContent>
    </Sheet>,
  );
  await userEvent.click(screen.getByText('Mở menu'));
  const drawer = await screen.findByRole('dialog', { name: 'Menu điều hướng' });
  expect(drawer).toHaveClass('overflow-y-auto', 'left-0');
});

test('side="right" neo drawer bên phải; nút X đóng drawer', async () => {
  render(
    <Sheet defaultOpen>
      <SheetContent side="right">
        <SheetTitle>Bộ lọc</SheetTitle>
      </SheetContent>
    </Sheet>,
  );
  expect(await screen.findByRole('dialog')).toHaveClass('right-0');
  await userEvent.click(screen.getByRole('button', { name: 'Đóng' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
