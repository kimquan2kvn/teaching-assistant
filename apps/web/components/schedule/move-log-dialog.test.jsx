import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeLessonLog, makeWeekLog } from '@/lib/test-fixtures/phase3';
import { MoveLogDialog } from './move-log-dialog';

function renderDialog(props = {}) {
  const onClose = jest.fn();
  const onSubmit = jest.fn().mockResolvedValue(true);
  const utils = render(<MoveLogDialog log={makeLessonLog()} onClose={onClose} onSubmit={onSubmit} {...props} />);
  return { onClose, onSubmit, ...utils };
}

// Dùng fireEvent.change cho ô ngày: userEvent.type vào <input type="date"> phụ thuộc cách jsdom ghép từng ký tự.
function setDate(value) {
  fireEvent.change(screen.getByLabelText('Ngày mới'), { target: { value } });
}

describe('nội dung', () => {
  test('ô ngày điền sẵn ngày hiện tại của buổi (từ ISO 00:00 UTC, không lùi ngày)', () => {
    renderDialog({ log: makeLessonLog({ date: '2026-01-05T00:00:00.000Z' }) });

    expect(screen.getByLabelText('Ngày mới')).toHaveValue('2026-01-05');
    expect(screen.getByText('Ngày hiện tại: 05/01/2026')).toBeInTheDocument();
  });

  test('ngày ISO cuối ngày UTC (23:30Z) vẫn điền đúng ngày UTC', () => {
    renderDialog({ log: makeLessonLog({ date: '2026-01-12T23:30:00.000Z' }) });

    expect(screen.getByLabelText('Ngày mới')).toHaveValue('2026-01-12');
  });

  test('hiện tên bài; buổi của trang theo tuần có thêm lớp-môn', () => {
    renderDialog({ log: makeWeekLog() });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Bài 1')).toBeInTheDocument();
    expect(screen.getByText('11A4 · Toán')).toBeInTheDocument();
  });

  test('ppctItem null không làm hỏng hộp thoại', () => {
    renderDialog({ log: makeLessonLog({ ppctItem: null }) });

    expect(screen.getByText('Mục PPCT không còn tồn tại')).toBeInTheDocument();
  });

  test('nhắc rằng các buổi chưa chốt của môn sẽ được xếp lại', () => {
    renderDialog();

    expect(screen.getByText(/các buổi chưa chốt của môn sẽ được xếp lại/i)).toBeInTheDocument();
  });
});

describe('gửi', () => {
  test('đổi sang 2026-01-22 rồi bấm "Chuyển" → onSubmit("2026-01-22")', async () => {
    const { onSubmit } = renderDialog({ log: makeLessonLog({ date: '2026-01-05T00:00:00.000Z' }) });

    setDate('2026-01-22');
    await userEvent.click(screen.getByRole('button', { name: 'Chuyển' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('2026-01-22');
  });

  test('onSubmit resolve true → đóng hộp thoại (onClose)', async () => {
    const { onClose } = renderDialog();

    setDate('2026-01-22');
    await userEvent.click(screen.getByRole('button', { name: 'Chuyển' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('onSubmit resolve false → giữ hộp thoại mở để đọc lỗi', async () => {
    const { onClose, onSubmit } = renderDialog({ error: 'Ngày này không có tiết của môn' });
    onSubmit.mockResolvedValue(false);

    setDate('2026-01-22');
    await userEvent.click(screen.getByRole('button', { name: 'Chuyển' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('bấm Enter trong ô ngày cũng gửi (form submit)', async () => {
    const { onSubmit } = renderDialog();

    setDate('2026-01-22');
    await userEvent.type(screen.getByLabelText('Ngày mới'), '{Enter}');

    expect(onSubmit).toHaveBeenCalledWith('2026-01-22');
  });
});

describe('chặn gửi sai', () => {
  test('xóa trống ô ngày → nút "Chuyển" bị khóa và có lời nhắc; submit form cũng không gửi', () => {
    const { onSubmit } = renderDialog();

    setDate('');

    expect(screen.getByRole('button', { name: 'Chuyển' })).toBeDisabled();
    expect(screen.getByText('Vui lòng chọn ngày muốn chuyển tới')).toBeInTheDocument();
    fireEvent.submit(screen.getByLabelText('Ngày mới').closest('form'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('chưa đổi ngày (vẫn là ngày hiện tại) → nút "Chuyển" bị khóa, không gửi', () => {
    const { onSubmit } = renderDialog({ log: makeLessonLog({ date: '2026-01-05T00:00:00.000Z' }) });

    expect(screen.getByRole('button', { name: 'Chuyển' })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText('Ngày mới').closest('form'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('có ngày mới hợp lệ thì nút "Chuyển" bật', () => {
    renderDialog();

    setDate('2026-01-22');

    expect(screen.getByRole('button', { name: 'Chuyển' })).toBeEnabled();
    expect(screen.queryByText('Vui lòng chọn ngày muốn chuyển tới')).not.toBeInTheDocument();
  });

  test('busy → nút "Chuyển" bị khóa (tên nút giữ nguyên) và có thông báo đang xếp lại; submit form không gửi lần nữa', () => {
    const { onSubmit } = renderDialog({ busy: true });

    setDate('2026-01-22');

    expect(screen.getByRole('button', { name: 'Chuyển' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Đang chuyển và xếp lại các buổi học');
    fireEvent.submit(screen.getByLabelText('Ngày mới').closest('form'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('không busy thì không có thông báo đang xếp lại', () => {
    renderDialog();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('lỗi và đóng', () => {
  test('hiện nguyên văn lỗi backend truyền vào (409 ngày đã có buổi khác)', () => {
    renderDialog({ error: 'Ngày này đã có buổi học khác, không thể chuyển vào' });

    expect(screen.getByRole('alert')).toHaveTextContent('Ngày này đã có buổi học khác, không thể chuyển vào');
  });

  test('không có lỗi thì không có vùng cảnh báo', () => {
    renderDialog();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('nút "Huỷ" gọi onClose và không gửi', async () => {
    const { onClose, onSubmit } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('bấm Escape đóng hộp thoại qua onClose', async () => {
    const { onClose } = renderDialog();

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
