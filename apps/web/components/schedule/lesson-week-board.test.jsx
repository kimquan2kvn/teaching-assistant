import { createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeLessonLog, makeWeekLog } from '@/lib/test-fixtures/phase3';
import { LessonWeekBoard } from './lesson-week-board';

// Mốc đã kiểm: 2026-01-05 là Thứ Hai, 2026-01-18 là Chủ Nhật.
const WEEK_START = '2026-01-12';

const MONDAY_LOG = makeLessonLog({ _id: 'l-mon', date: '2026-01-12T00:00:00.000Z' });
const WEDNESDAY_LOG = makeLessonLog({
  _id: 'l-wed',
  date: '2026-01-14T00:00:00.000Z',
  ppctItem: { order: 2, week: 1, periodLabel: '2', title: 'Bài 2', periodCount: 1, requirement: '' },
});

function renderBoard(props = {}) {
  const handlers = {
    onToggleDone: jest.fn(),
    onRequestMove: jest.fn(),
    onDropLog: jest.fn(),
  };
  const utils = render(
    <LessonWeekBoard
      weekStart={WEEK_START}
      today="2026-01-14"
      logs={[MONDAY_LOG, WEDNESDAY_LOG]}
      canEditLog={() => true}
      {...handlers}
      {...props}
    />,
  );
  const column = (date) => utils.container.querySelector(`[data-column="${date}"]`);
  const card = (logId) => utils.container.querySelector(`[data-log-id="${logId}"]`);
  return { ...handlers, column, card, ...utils };
}

describe('các cột ngày', () => {
  test('6 cột Thứ 2 đến Thứ 7 với tiêu đề "Thứ N dd/mm" khi không có buổi nào vào Chủ nhật', () => {
    const { container } = renderBoard();

    const dates = [...container.querySelectorAll('[data-column]')].map((node) => node.getAttribute('data-column'));
    expect(dates).toEqual(['2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16', '2026-01-17']);
    expect(screen.getByRole('heading', { name: 'Thứ 2 12/01' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Thứ 7 17/01' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Chủ nhật/ })).not.toBeInTheDocument();
  });

  test('buổi nằm đúng cột ngày của nó; cột còn lại ghi "Không có buổi học"', () => {
    const { column } = renderBoard();

    expect(within(column('2026-01-12')).getByText('Bài 1')).toBeInTheDocument();
    expect(within(column('2026-01-14')).getByText('Bài 2')).toBeInTheDocument();
    expect(within(column('2026-01-13')).getByText('Không có buổi học')).toBeInTheDocument();
    expect(within(column('2026-01-12')).queryByText('Không có buổi học')).not.toBeInTheDocument();
    expect(screen.getAllByText('Không có buổi học')).toHaveLength(4);
  });

  test('không có buổi nào → vẫn đủ 6 cột trống', () => {
    const { container } = renderBoard({ logs: [] });

    expect(container.querySelectorAll('[data-column]')).toHaveLength(6);
    expect(screen.getAllByText('Không có buổi học')).toHaveLength(6);
  });

  test('buổi rơi vào Chủ nhật không bị nuốt: xuất hiện cột "Chủ nhật 18/01" chứa buổi đó', () => {
    const sundayLog = makeLessonLog({ _id: 'l-sun', date: '2026-01-18T00:00:00.000Z' });
    const { container, column } = renderBoard({ logs: [MONDAY_LOG, sundayLog] });

    expect(container.querySelectorAll('[data-column]')).toHaveLength(7);
    expect(screen.getByRole('heading', { name: 'Chủ nhật 18/01' })).toBeInTheDocument();
    expect(column('2026-01-18').querySelector('[data-log-id="l-sun"]')).not.toBeNull();
  });

  test('ngày của buổi dạng ISO cuối ngày UTC (23:30Z) vẫn vào đúng cột — getter giờ địa phương UTC+7 sẽ đẩy sang hôm sau', () => {
    const lateLog = makeLessonLog({ _id: 'l-late', date: '2026-01-12T23:30:00.000Z' });
    const { column } = renderBoard({ logs: [lateLog] });

    expect(column('2026-01-12').querySelector('[data-log-id="l-late"]')).not.toBeNull();
    expect(column('2026-01-13').querySelector('[data-log-id="l-late"]')).toBeNull();
  });

  test('weekStart không phải Thứ Hai (giữa tuần, hoặc ISO) được chuẩn hóa về Thứ Hai', () => {
    const { container } = renderBoard({ weekStart: '2026-01-14T00:00:00.000Z' });

    expect(container.querySelector('[data-column]').getAttribute('data-column')).toBe('2026-01-12');
  });

  test('nhiều buổi cùng ngày giữ nguyên thứ tự backend trả về', () => {
    const second = makeLessonLog({ _id: 'l-second', date: '2026-01-12T00:00:00.000Z' });
    const { column } = renderBoard({ logs: [MONDAY_LOG, second] });

    const ids = [...column('2026-01-12').querySelectorAll('[data-log-id]')].map((node) =>
      node.getAttribute('data-log-id'),
    );
    expect(ids).toEqual(['l-mon', 'l-second']);
  });
});

describe('cột hôm nay', () => {
  test('chỉ cột hôm nay có aria-current="date" ở tiêu đề và nền bg-brand-soft ở phần tử bao', () => {
    const { column } = renderBoard({ today: '2026-01-14' });

    expect(screen.getByRole('heading', { name: 'Thứ 4 14/01' })).toHaveAttribute('aria-current', 'date');
    expect(column('2026-01-14')).toHaveClass('bg-brand-soft');
    expect(document.querySelectorAll('[aria-current="date"]')).toHaveLength(1);
    expect(column('2026-01-13')).not.toHaveClass('bg-brand-soft');
  });

  test('hôm nay ngoài tuần đang xem → không cột nào được nhấn mạnh', () => {
    const { container } = renderBoard({ today: '2026-01-21' });

    expect(document.querySelectorAll('[aria-current="date"]')).toHaveLength(0);
    expect(container.querySelector('.bg-brand-soft')).toBeNull();
  });

  test('hôm nay là Chủ nhật: nhấn mạnh cột Chủ nhật khi cột đó có hiện (có buổi), không thì không có gì để nhấn mạnh', () => {
    const sundayLog = makeLessonLog({ _id: 'l-sun', date: '2026-01-18T00:00:00.000Z' });
    const withSunday = renderBoard({ today: '2026-01-18', logs: [sundayLog] });
    expect(screen.getByRole('heading', { name: 'Chủ nhật 18/01' })).toHaveAttribute('aria-current', 'date');
    withSunday.unmount();

    renderBoard({ today: '2026-01-18', logs: [MONDAY_LOG] });
    expect(document.querySelectorAll('[aria-current="date"]')).toHaveLength(0);
  });

  test('today dạng ISO cuối ngày UTC (23:30Z) vẫn khớp đúng ngày', () => {
    const { column } = renderBoard({ today: '2026-01-14T23:30:00.000Z' });

    expect(column('2026-01-14')).toHaveClass('bg-brand-soft');
  });
});

describe('truyền xuống thẻ', () => {
  test('canEditLog quyết định từng thẻ: chỉ thẻ được sửa mới có checkbox, nút "Chuyển ngày" và draggable', () => {
    const { card } = renderBoard({ canEditLog: (log) => log._id === 'l-mon' });

    expect(within(card('l-mon')).getByRole('checkbox')).toBeInTheDocument();
    expect(within(card('l-mon')).getByRole('button', { name: 'Chuyển ngày' })).toBeInTheDocument();
    expect(card('l-mon')).toHaveAttribute('draggable', 'true');

    expect(within(card('l-wed')).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(card('l-wed')).queryByRole('button')).not.toBeInTheDocument();
    expect(card('l-wed')).not.toHaveAttribute('draggable');
  });

  test('tích checkbox và bấm "Chuyển ngày" gọi đúng callback với đúng buổi', async () => {
    const { onToggleDone, onRequestMove, card } = renderBoard();

    await userEvent.click(within(card('l-wed')).getByRole('checkbox'));
    expect(onToggleDone).toHaveBeenCalledWith(WEDNESDAY_LOG, true);

    await userEvent.click(within(card('l-mon')).getByRole('button', { name: 'Chuyển ngày' }));
    expect(onRequestMove).toHaveBeenCalledWith(MONDAY_LOG);
  });

  test('busyIds khóa đúng thẻ đang lưu và thẻ đó không kéo được; pending giữ trạng thái checkbox', () => {
    const { card } = renderBoard({ busyIds: new Set(['l-mon']), pending: new Map([['l-mon', true]]) });

    const busyCheckbox = within(card('l-mon')).getByRole('checkbox');
    expect(busyCheckbox).toBeDisabled();
    expect(busyCheckbox).toBeChecked();
    expect(card('l-mon')).not.toHaveAttribute('draggable');

    expect(within(card('l-wed')).getByRole('checkbox')).toBeEnabled();
    expect(card('l-wed')).toHaveAttribute('draggable', 'true');
  });

  test('showPosition hiện dòng "{lớp} · {môn}" ở mỗi thẻ', () => {
    renderBoard({
      showPosition: true,
      logs: [
        makeWeekLog({ _id: 'w1', date: '2026-01-12T00:00:00.000Z' }),
        makeWeekLog({
          _id: 'w2',
          positionId: 'p-van',
          date: '2026-01-12T00:00:00.000Z',
          position: { _id: 'p-van', classId: 'class-1', className: '11A4', subject: 'Ngữ văn' },
        }),
      ],
    });

    expect(screen.getByText('11A4 · Toán')).toBeInTheDocument();
    expect(screen.getByText('11A4 · Ngữ văn')).toBeInTheDocument();
  });
});

describe('kéo-thả', () => {
  test('cột ngày cho phép thả: dragover gọi preventDefault', () => {
    const { column } = renderBoard();

    // fireEvent trả false khi có listener gọi preventDefault.
    expect(fireEvent.dragOver(column('2026-01-15'))).toBe(false);
  });

  test('kéo thẻ ở 12/01 thả vào cột 15/01 → onDropLog(log, "2026-01-15"); dragstart không có dataTransfer (jsdom) không ném lỗi', () => {
    const { card, column, onDropLog } = renderBoard();

    fireEvent.dragStart(card('l-mon'));
    fireEvent.drop(column('2026-01-15'));

    expect(onDropLog).toHaveBeenCalledTimes(1);
    expect(onDropLog).toHaveBeenCalledWith(MONDAY_LOG, '2026-01-15');
  });

  test('dragstart có dataTransfer thì ghi id buổi vào dữ liệu kéo (Firefox cần để bắt đầu kéo)', () => {
    const { card } = renderBoard();
    const dataTransfer = { setData: jest.fn(), effectAllowed: '' };

    fireEvent.dragStart(card('l-mon'), { dataTransfer });

    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'l-mon');
    expect(dataTransfer.effectAllowed).toBe('move');
  });

  test('thả vào chính ngày cũ của buổi → KHÔNG gọi onDropLog', () => {
    const { card, column, onDropLog } = renderBoard();

    fireEvent.dragStart(card('l-mon'));
    fireEvent.drop(column('2026-01-12'));

    expect(onDropLog).not.toHaveBeenCalled();
  });

  test('ngày cũ so theo ngày UTC: buổi 23:30Z của 12/01 thả vào cột 12/01 vẫn là chính ngày cũ', () => {
    const lateLog = makeLessonLog({ _id: 'l-late', date: '2026-01-12T23:30:00.000Z' });
    const { card, column, onDropLog } = renderBoard({ logs: [lateLog] });

    fireEvent.dragStart(card('l-late'));
    fireEvent.drop(column('2026-01-12'));

    expect(onDropLog).not.toHaveBeenCalled();
  });

  test('thả mà không có thẻ nào đang kéo (vd kéo file từ ngoài vào) → không gọi gì', () => {
    const { column, onDropLog } = renderBoard();

    fireEvent.drop(column('2026-01-15'));

    expect(onDropLog).not.toHaveBeenCalled();
  });

  test('sau một lần thả, trạng thái kéo được xóa: lần thả tiếp theo không còn gọi lại buổi cũ', () => {
    const { card, column, onDropLog } = renderBoard();

    fireEvent.dragStart(card('l-mon'));
    fireEvent.drop(column('2026-01-15'));
    fireEvent.drop(column('2026-01-16'));

    expect(onDropLog).toHaveBeenCalledTimes(1);
  });

  test('dragend (thả ra ngoài / hủy kéo) xóa trạng thái kéo', () => {
    const { card, column, onDropLog } = renderBoard();

    fireEvent.dragStart(card('l-mon'));
    fireEvent.dragEnd(card('l-mon'));
    fireEvent.drop(column('2026-01-15'));

    expect(onDropLog).not.toHaveBeenCalled();
  });

  test('canEditLog trả false: thẻ không kéo được và thả không gọi gì', () => {
    const { card, column, onDropLog } = renderBoard({ canEditLog: () => false });

    expect(card('l-mon')).not.toHaveAttribute('draggable');
    fireEvent.dragStart(card('l-mon'));
    fireEvent.drop(column('2026-01-15'));

    expect(onDropLog).not.toHaveBeenCalled();
  });

  test('thẻ đang lưu (busy) không kéo được', () => {
    const { card, column, onDropLog } = renderBoard({ busyIds: new Set(['l-mon']) });

    fireEvent.dragStart(card('l-mon'));
    fireEvent.drop(column('2026-01-15'));

    expect(onDropLog).not.toHaveBeenCalled();
  });

  test('cột đang được kéo qua có viền nổi bật, bỏ khi thả hoặc khi kéo ra khỏi cột', () => {
    const { card, column } = renderBoard();

    fireEvent.dragStart(card('l-mon'));
    fireEvent.dragOver(column('2026-01-15'));
    expect(column('2026-01-15')).toHaveClass('ring-2');

    fireEvent.dragLeave(column('2026-01-15'));
    expect(column('2026-01-15')).not.toHaveClass('ring-2');

    fireEvent.dragOver(column('2026-01-16'));
    expect(column('2026-01-16')).toHaveClass('ring-2');
    fireEvent.drop(column('2026-01-16'));
    expect(column('2026-01-16')).not.toHaveClass('ring-2');
  });

  test('kéo qua chính cột ngày cũ của buổi thì không có viền nổi bật (thả vào đó là không làm gì)', () => {
    const { card, column } = renderBoard();

    fireEvent.dragStart(card('l-mon'));
    fireEvent.dragOver(column('2026-01-12'));

    expect(column('2026-01-12')).not.toHaveClass('ring-2');
  });

  test('di chuyển giữa các phần tử con trong cùng một cột (dragleave có relatedTarget nằm trong cột) không làm mất viền', () => {
    const { card, column } = renderBoard();
    fireEvent.dragStart(card('l-mon'));
    fireEvent.dragOver(column('2026-01-14'));

    // jsdom không có DragEvent nên eventInit.relatedTarget bị bỏ qua: gắn thẳng vào sự kiện.
    const leaveEvent = createEvent.dragLeave(column('2026-01-14'));
    Object.defineProperty(leaveEvent, 'relatedTarget', { value: card('l-wed') });
    fireEvent(column('2026-01-14'), leaveEvent);

    expect(column('2026-01-14')).toHaveClass('ring-2');
  });
});
