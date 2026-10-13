import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from './dialog';

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

test('nội dung dialog cuộn được và không tràn màn hình điện thoại (max-h + lề ngang)', async () => {
  render(
    <Dialog defaultOpen>
      <DialogContent>
        <DialogTitle>Tiêu đề dài</DialogTitle>
      </DialogContent>
    </Dialog>,
  );
  expect(await screen.findByRole('dialog')).toHaveClass('max-h-[90vh]', 'overflow-y-auto', 'w-[calc(100%-2rem)]');
});

test('Header/Footer/Description của shadcn render đúng và Description gắn làm mô tả truy cập', async () => {
  render(
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chuyển lớp</DialogTitle>
          <DialogDescription>Học sinh sẽ ẩn khỏi điểm danh.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose>Huỷ</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>,
  );
  const dialog = await screen.findByRole('dialog', { name: 'Chuyển lớp' });
  expect(dialog).toHaveAccessibleDescription('Học sinh sẽ ẩn khỏi điểm danh.');
});

test('nút X góc phải có tên tiếng Việt và đóng được dialog', async () => {
  render(
    <Dialog defaultOpen>
      <DialogContent>
        <DialogTitle>Khóa tài khoản?</DialogTitle>
      </DialogContent>
    </Dialog>,
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Đóng hộp thoại' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
