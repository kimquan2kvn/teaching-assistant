import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransferDialog } from './transfer-dialog';

const transferStudentMock = jest.fn();
jest.mock('@/lib/store/students-api', () => ({
  ...jest.requireActual('@/lib/store/students-api'),
  useTransferStudentMutation: () => [transferStudentMock, { isLoading: false }],
}));

beforeEach(() => {
  transferStudentMock.mockClear();
  transferStudentMock.mockReturnValue({ unwrap: () => Promise.resolve({}) });
});

function renderDialog(props = {}) {
  return render(
    <TransferDialog
      open
      onOpenChange={() => {}}
      classId="class-1"
      studentId="student-1"
      studentName="Nguyễn Văn A"
      {...props}
    />,
  );
}

test('submit thiếu transferReason bị chặn ở client, không gọi mutation', async () => {
  renderDialog();

  await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

  expect(transferStudentMock).not.toHaveBeenCalled();
});

test('submit đủ transferDate + transferReason gọi đúng payload useTransferStudentMutation', async () => {
  renderDialog();

  await userEvent.clear(screen.getByLabelText('Ngày chuyển đi'));
  await userEvent.type(screen.getByLabelText('Ngày chuyển đi'), '2026-10-01');
  await userEvent.type(screen.getByLabelText('Lý do chuyển đi'), 'Chuyển trường khác');
  await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

  expect(transferStudentMock).toHaveBeenCalledWith({
    classId: 'class-1',
    studentId: 'student-1',
    transferDate: '2026-10-01',
    transferReason: 'Chuyển trường khác',
  });
});

test('transferDate mặc định là hôm nay theo giờ ĐỊA PHƯƠNG (không dùng toISOString() UTC thuần)', () => {
  // Tính "hôm nay" bằng getFullYear/getMonth/getDate (giờ địa phương) thay vì toISOString() (UTC thuần) —
  // 2 cách tính lệch nhau 1 ngày vào buổi sáng sớm giờ VN (UTC+7), đúng bug đã phát hiện ở review sub-project 3
  // (xem todayDateOnly trong lib/utils.js).
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  renderDialog();

  expect(screen.getByLabelText('Ngày chuyển đi')).toHaveValue(today);
});

test('hiện tên học sinh trong tiêu đề dialog', () => {
  renderDialog();

  expect(screen.getByText(/Nguyễn Văn A/)).toBeInTheDocument();
});

test('đóng dialog (gọi onOpenChange(false)) sau khi chuyển đi thành công', async () => {
  const onOpenChange = jest.fn();
  renderDialog({ onOpenChange });

  await userEvent.type(screen.getByLabelText('Lý do chuyển đi'), 'Chuyển trường khác');
  await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

  expect(await screen.findByText('Xác nhận')).toBeInTheDocument();
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test('lỗi từ backend hiện đúng error.data.message nguyên văn', async () => {
  transferStudentMock.mockReturnValue({
    unwrap: () => Promise.reject({ data: { message: 'Không tìm thấy học sinh trong lớp này' } }),
  });
  renderDialog();

  await userEvent.type(screen.getByLabelText('Lý do chuyển đi'), 'Chuyển trường khác');
  await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

  expect(await screen.findByText('Không tìm thấy học sinh trong lớp này')).toBeInTheDocument();
});
