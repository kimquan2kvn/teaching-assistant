import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogClose } from './dialog';

test('mở dialog căn giữa màn hình khi bấm trigger, hiện đúng tiêu đề', async () => {
  render(
    <Dialog>
      <DialogTrigger>Mở</DialogTrigger>
      <DialogContent>
        <DialogTitle>Ngừng phụ trách?</DialogTitle>
      </DialogContent>
    </Dialog>,
  );
  await userEvent.click(screen.getByText('Mở'));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('Ngừng phụ trách?')).toBeInTheDocument();
});

test('đóng dialog khi bấm DialogClose', async () => {
  render(
    <Dialog defaultOpen>
      <DialogContent>
        <DialogTitle>Khóa tài khoản?</DialogTitle>
        <DialogClose>Huỷ</DialogClose>
      </DialogContent>
    </Dialog>,
  );
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  await userEvent.click(screen.getByText('Huỷ'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
