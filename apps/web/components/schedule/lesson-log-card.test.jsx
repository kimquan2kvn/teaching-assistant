import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeLessonLog, makeWeekLog } from '@/lib/test-fixtures/phase3';
import { LessonLogCard } from './lesson-log-card';
import { getSubjectColor } from './subject-colors';

function makeItem(overrides = {}) {
  return { order: 1, week: 1, periodLabel: '1', title: 'Bài 1', periodCount: 1, requirement: '', ...overrides };
}

function renderCard(props = {}) {
  const onToggleDone = jest.fn();
  const onRequestMove = jest.fn();
  const log = props.log ?? makeLessonLog();
  const utils = render(<LessonLogCard log={log} onToggleDone={onToggleDone} onRequestMove={onRequestMove} {...props} />);
  const root = utils.container.querySelector('[data-log-id]');
  return { log, root, onToggleDone, onRequestMove, ...utils };
}

describe('nội dung thẻ', () => {
  test('hiện tên bài và nhãn tiết; gắn data-log-id để bảng tìm đúng thẻ', () => {
    const { root } = renderCard({ log: makeLessonLog({ _id: 'l9' }) });

    expect(screen.getByText('Bài 1')).toBeInTheDocument();
    expect(root).toHaveAttribute('data-log-id', 'l9');
  });

  test.each([
    ['1', 'CK'],
    ['15', 'CK'],
    ['TC1', 'TC'],
    ['CĐ2', 'CĐ'],
    ['CD3', 'CĐ'],
  ])('nhãn tiết %s → Badge loại %s kèm chính nhãn đó', (periodLabel, kind) => {
    renderCard({ log: makeLessonLog({ ppctItem: makeItem({ periodLabel }) }) });

    expect(screen.getByText(kind)).toBeInTheDocument();
    expect(screen.getByText(periodLabel)).toBeInTheDocument();
  });

  test('periodCount > 1 hiện "N tiết"; periodCount = 1 không hiện', () => {
    const { unmount } = renderCard({ log: makeLessonLog({ ppctItem: makeItem({ periodCount: 2 }) }) });
    expect(screen.getByText('2 tiết')).toBeInTheDocument();
    unmount();

    renderCard({ log: makeLessonLog({ ppctItem: makeItem({ periodCount: 1 }) }) });
    expect(screen.queryByText(/tiết/)).not.toBeInTheDocument();
  });

  test('isManuallyAdjusted hiện Badge "Đã chỉnh tay"; mặc định thì không', () => {
    const { unmount } = renderCard({ log: makeLessonLog({ isManuallyAdjusted: true }) });
    expect(screen.getByText('Đã chỉnh tay')).toBeInTheDocument();
    unmount();

    renderCard({ log: makeLessonLog({ isManuallyAdjusted: false }) });
    expect(screen.queryByText('Đã chỉnh tay')).not.toBeInTheDocument();
  });

  test('ppctItem null (mục PPCT không còn) không làm hỏng thẻ: có chữ thay thế, không Badge loại tiết', () => {
    renderCard({ log: makeLessonLog({ ppctItem: null }), canEdit: true });

    expect(screen.getByText('Mục PPCT không còn tồn tại')).toBeInTheDocument();
    expect(screen.queryByText('CK')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Đã thực hiện: Mục PPCT không còn tồn tại' })).toBeInTheDocument();
  });

  test('ppctItem không có ghi chú (note là tùy chọn) vẫn hiển thị bình thường', () => {
    const item = makeItem();
    expect(item).not.toHaveProperty('note');
    renderCard({ log: makeLessonLog({ ppctItem: item }) });

    expect(screen.getByText('Bài 1')).toBeInTheDocument();
  });
});

describe('showPosition', () => {
  test('hiện "{className} · {subject}" và tô màu theo môn', () => {
    const { root } = renderCard({ log: makeWeekLog(), showPosition: true });

    expect(screen.getByText('11A4 · Toán')).toBeInTheDocument();
    for (const className of getSubjectColor('Toán').cell.split(' ')) {
      expect(root).toHaveClass(className);
    }
  });

  test('không bật showPosition thì không có dòng lớp-môn và không có màu môn', () => {
    const { root } = renderCard({ log: makeWeekLog() });

    expect(screen.queryByText('11A4 · Toán')).not.toBeInTheDocument();
    expect(root).not.toHaveClass('bg-blue-100');
  });

  test('showPosition nhưng log không có position (buổi của trang theo môn-lớp) không ném lỗi', () => {
    renderCard({ log: makeLessonLog(), showPosition: true });

    expect(screen.getByText('Bài 1')).toBeInTheDocument();
  });
});

describe('showDate', () => {
  test('hiện thứ và ngày dd/mm/yyyy', () => {
    renderCard({ log: makeLessonLog({ date: '2026-01-05T00:00:00.000Z' }), showDate: true });

    expect(screen.getByText('Thứ 2, 05/01/2026')).toBeInTheDocument();
  });

  test('Chủ nhật hiện "Chủ nhật" chứ không phải "Thứ 1"', () => {
    renderCard({ log: makeLessonLog({ date: '2026-01-18T00:00:00.000Z' }), showDate: true });

    expect(screen.getByText('Chủ nhật, 18/01/2026')).toBeInTheDocument();
  });

  test('ngày dạng ISO cuối ngày UTC (23:30Z) vẫn ra đúng ngày — getter giờ địa phương UTC+7 sẽ nhảy sang hôm sau', () => {
    renderCard({ log: makeLessonLog({ date: '2026-01-12T23:30:00.000Z' }), showDate: true });

    expect(screen.getByText('Thứ 2, 12/01/2026')).toBeInTheDocument();
  });

  test('không bật showDate thì không hiện ngày', () => {
    renderCard({ log: makeLessonLog({ date: '2026-01-05T00:00:00.000Z' }) });

    expect(screen.queryByText(/05\/01\/2026/)).not.toBeInTheDocument();
  });
});

describe('người sửa được (canEdit)', () => {
  test('có checkbox "Đã thực hiện: {tên bài}"; bấm thì gọi onToggleDone(log, true)', async () => {
    const { log, onToggleDone } = renderCard({ canEdit: true });

    const checkbox = screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' });
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);

    expect(onToggleDone).toHaveBeenCalledTimes(1);
    expect(onToggleDone).toHaveBeenCalledWith(log, true);
  });

  test('buổi đã tích: checkbox đang checked, bấm thì gọi onToggleDone(log, false)', async () => {
    const { log, onToggleDone } = renderCard({ log: makeLessonLog({ done: true }), canEdit: true });

    const checkbox = screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' });
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);

    expect(onToggleDone).toHaveBeenCalledWith(log, false);
  });

  test('pendingDone thắng log.done, kể cả khi pendingDone là false (checkbox không nháy lại trong lúc lưu)', () => {
    const { unmount } = renderCard({ log: makeLessonLog({ done: false }), canEdit: true, pendingDone: true });
    expect(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' })).toBeChecked();
    unmount();

    renderCard({ log: makeLessonLog({ done: true }), canEdit: true, pendingDone: false });
    expect(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' })).not.toBeChecked();
  });

  test('có nút "Chuyển ngày"; bấm thì gọi onRequestMove(log)', async () => {
    const { log, onRequestMove } = renderCard({ canEdit: true });

    await userEvent.click(screen.getByRole('button', { name: 'Chuyển ngày' }));

    expect(onRequestMove).toHaveBeenCalledTimes(1);
    expect(onRequestMove).toHaveBeenCalledWith(log);
  });

  test('busy → checkbox và nút "Chuyển ngày" bị khóa, thẻ đánh dấu aria-busy', () => {
    const { root } = renderCard({ canEdit: true, busy: true });

    expect(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Chuyển ngày' })).toBeDisabled();
    expect(root).toHaveAttribute('aria-busy', 'true');
  });

  test('không busy thì không có aria-busy và control dùng được', () => {
    const { root } = renderCard({ canEdit: true });

    expect(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Chuyển ngày' })).toBeEnabled();
    expect(root).not.toHaveAttribute('aria-busy');
  });
});

describe('người chỉ xem (canEdit = false)', () => {
  test('không có checkbox, không có nút "Chuyển ngày"; hiện chữ "Chưa thực hiện"', () => {
    renderCard({ canEdit: false });

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chuyển ngày' })).not.toBeInTheDocument();
    expect(screen.getByText('Chưa thực hiện')).toBeInTheDocument();
  });

  test('buổi đã tích hiện chữ "Đã thực hiện"', () => {
    renderCard({ log: makeLessonLog({ done: true }), canEdit: false });

    expect(screen.getByText('Đã thực hiện')).toBeInTheDocument();
    expect(screen.queryByText('Chưa thực hiện')).not.toBeInTheDocument();
  });

  test('mặc định (không truyền canEdit) là chỉ xem', () => {
    renderCard();

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('kéo-thả', () => {
  test('có dragHandlers thì thẻ draggable="true" và nhận sự kiện dragstart (jsdom không có dataTransfer)', () => {
    const onDragStart = jest.fn();
    const { root } = renderCard({ canEdit: true, dragHandlers: { draggable: true, onDragStart } });

    expect(root).toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(root);

    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  test('không có dragHandlers thì thẻ không có thuộc tính draggable (kể cả "false")', () => {
    const { root } = renderCard({ canEdit: true });

    expect(root).not.toHaveAttribute('draggable');
  });
});
