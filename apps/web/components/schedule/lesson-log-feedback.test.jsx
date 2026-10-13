import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeLessonLog } from '@/lib/test-fixtures/phase3';
import { LessonLogFeedback } from './lesson-log-feedback';

function makeProps({ actions = {}, flow = {} } = {}) {
  return {
    actions: { error: null, busyIds: new Set(), ...actions },
    flow: {
      notice: null,
      movingLog: null,
      closeMove: jest.fn(),
      submitMove: jest.fn().mockResolvedValue(true),
      ...flow,
    },
  };
}

const NOTICE = 'Đã chuyển buổi học sang ngày 22/01/2026. Các buổi chưa chốt của môn đã được xếp lại.';
const ERROR = 'Ngày này không có tiết của môn';

test('không có gì để báo thì không hiện gì', () => {
  const { container } = render(<LessonLogFeedback {...makeProps()} />);

  expect(container).toBeEmptyDOMElement();
});

test('thông báo thành công hiện dạng role=status', () => {
  render(<LessonLogFeedback {...makeProps({ flow: { notice: NOTICE } })} />);

  expect(screen.getByRole('status')).toHaveTextContent(NOTICE);
  expect(screen.getByRole('status')).toHaveClass('bg-success-soft');
});

test('lỗi của thao tác kéo-thả/tích hiện dạng role=alert khi không có hộp thoại', () => {
  render(<LessonLogFeedback {...makeProps({ actions: { error: ERROR } })} />);

  expect(screen.getByRole('alert')).toHaveTextContent(ERROR);
  expect(screen.getByRole('alert')).toHaveClass('bg-danger-soft', 'text-destructive');
});

describe('hộp thoại "Chuyển ngày" đang mở', () => {
  const log = makeLessonLog({ date: '2026-01-05T00:00:00.000Z' });

  test('hiện hộp thoại cho đúng buổi; lỗi chỉ hiện trong hộp thoại, không lặp ở banner', () => {
    render(<LessonLogFeedback {...makeProps({ actions: { error: ERROR, errorLogId: log._id }, flow: { movingLog: log } })} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Ngày mới')).toHaveValue('2026-01-05');
    expect(screen.getAllByText(ERROR)).toHaveLength(1);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert').closest('[role="dialog"]')).not.toBeNull();
  });

  test('lỗi của buổi KHÁC không hiện trong hộp thoại của buổi đang mở; hiện ở banner ngoài hộp thoại', () => {
    render(<LessonLogFeedback {...makeProps({ actions: { error: ERROR, errorLogId: 'buoi-khac' }, flow: { movingLog: log } })} />);

    // Hộp thoại modal đặt aria-hidden cho phần còn lại của trang nên tìm theo chữ, không theo role.
    const banner = screen.getByText(ERROR).closest('[role="alert"]');
    expect(banner).not.toBeNull();
    expect(banner).toHaveClass('bg-danger-soft', 'text-destructive');
    expect(banner.closest('[role="dialog"]')).toBeNull();
  });

  test('busy lấy từ busyIds của đúng buổi đó', () => {
    const { rerender } = render(
      <LessonLogFeedback {...makeProps({ actions: { busyIds: new Set(['khac']) }, flow: { movingLog: log } })} />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    rerender(<LessonLogFeedback {...makeProps({ actions: { busyIds: new Set([log._id]) }, flow: { movingLog: log } })} />);

    expect(screen.getByRole('status')).toHaveTextContent('Đang chuyển và xếp lại các buổi học');
  });

  test('"Huỷ" gọi closeMove; chọn ngày mới rồi "Chuyển" gọi submitMove với ngày đó', async () => {
    const props = makeProps({ flow: { movingLog: log } });
    render(<LessonLogFeedback {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(props.flow.closeMove).toHaveBeenCalled();

    const dateInput = screen.getByLabelText('Ngày mới');
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, '2026-01-22');
    await userEvent.click(screen.getByRole('button', { name: 'Chuyển' }));

    expect(props.flow.submitMove).toHaveBeenCalledWith('2026-01-22');
  });

  test('thông báo thành công vẫn hiện cùng lúc với hộp thoại (nếu có)', () => {
    render(<LessonLogFeedback {...makeProps({ flow: { notice: NOTICE, movingLog: log } })} />);

    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });
});
