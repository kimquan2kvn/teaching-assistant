import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeHoliday, makeLessonLog, makeSlot, makeWeekLog } from '@/lib/test-fixtures/phase3';
import { getSubjectColor } from './subject-colors';
import { TimetableGrid } from './timetable-grid';

// Mốc đã kiểm: 2026-01-12 là Thứ Hai, 2026-01-14 Thứ Tư, 2026-01-15 Thứ Năm, 2026-01-18 Chủ Nhật.
const WEEK_START = '2026-01-12';
const WEEK_DATES = ['2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16', '2026-01-17'];

const TOAN = makeWeekLog().position;
const VAN = { _id: 'p-van', classId: 'class-2', className: '11A5', subject: 'Ngữ văn' };

// Slot trong GET /timetable/me là object dựng sẵn: không có createdAt…, có kèm position.
function gridSlot(overrides = {}) {
  return makeSlot({ position: TOAN, ...overrides });
}

function renderGrid(props = {}) {
  const onFocusDate = jest.fn();
  const utils = render(
    <TimetableGrid
      weekStart={WEEK_START}
      today="2026-01-14"
      slots={[]}
      lessonLogs={[]}
      holidays={[]}
      focusedDate="2026-01-12"
      onFocusDate={onFocusDate}
      {...props}
    />,
  );
  return { ...utils, onFocusDate };
}

const columnOf = (container, date) => container.querySelector(`[data-column="${date}"]`);
const headerOf = (container, date) => container.querySelector(`[data-date="${date}"]:not([data-period])`);
const cellOf = (container, date, period) =>
  container.querySelector(`[data-date="${date}"][data-period="${period}"]`);

describe('khung lưới', () => {
  test('6 tiêu đề Thứ 2 12/01 … Thứ 7 17/01; 10 nhãn Tiết 1…Tiết 10 ở cột trái; không có cột Chủ nhật', () => {
    const { container } = renderGrid();

    const expectedHeaders = [
      'Thứ 2 12/01',
      'Thứ 3 13/01',
      'Thứ 4 14/01',
      'Thứ 5 15/01',
      'Thứ 6 16/01',
      'Thứ 7 17/01',
    ];
    WEEK_DATES.forEach((date, index) => {
      expect(headerOf(container, date)).toHaveTextContent(expectedHeaders[index]);
    });

    const periodLabels = screen.getAllByText(/^Tiết \d+$/).map((label) => label.textContent);
    expect(periodLabels).toEqual(Array.from({ length: 10 }, (_, index) => `Tiết ${index + 1}`));

    expect(Array.from(container.querySelectorAll('[data-column]')).map((el) => el.dataset.column)).toEqual(WEEK_DATES);
    expect(screen.queryByText('Chủ nhật')).not.toBeInTheDocument();
    expect(container.querySelector('[data-date="2026-01-18"]')).toBeNull();
  });

  test('mỗi cột có đúng 10 ô, đánh số tiết 1…10; ô trống không có nội dung nào', () => {
    const { container } = renderGrid();

    for (const date of WEEK_DATES) {
      const cells = columnOf(container, date).querySelectorAll('[data-period]');
      expect(Array.from(cells).map((el) => el.dataset.period)).toEqual(
        Array.from({ length: 10 }, (_, index) => String(index + 1)),
      );
      cells.forEach((el) => expect(el).toBeEmptyDOMElement());
    }
  });

  test('weekStart giữa tuần hoặc dạng ISO cuối ngày UTC vẫn dựng đúng 6 cột của tuần đó', () => {
    const { container, unmount } = renderGrid({ weekStart: '2026-01-14' });
    expect(Array.from(container.querySelectorAll('[data-column]')).map((el) => el.dataset.column)).toEqual(WEEK_DATES);
    unmount();

    const iso = renderGrid({ weekStart: '2026-01-12T23:30:00.000Z' });
    expect(Array.from(iso.container.querySelectorAll('[data-column]')).map((el) => el.dataset.column)).toEqual(
      WEEK_DATES,
    );
  });

  test('chiều cao cố định để thẳng hàng: ô, tiêu đề và nhãn tiết dùng cùng một lớp h-*', () => {
    const { container } = renderGrid({ slots: [gridSlot()] });
    const heightClassOf = (el) => Array.from(el.classList).find((name) => /^h-\d+$/.test(name));

    const cellHeight = heightClassOf(cellOf(container, '2026-01-12', 1));
    expect(cellHeight).toBeDefined();
    container.querySelectorAll('[data-period]').forEach((el) => expect(heightClassOf(el)).toBe(cellHeight));
    expect(heightClassOf(screen.getByText('Tiết 1'))).toBe(cellHeight);
    expect(heightClassOf(screen.getByText('Tiết 10'))).toBe(cellHeight);
    const headerHeight = heightClassOf(headerOf(container, '2026-01-12'));
    expect(headerHeight).toBeDefined();
    WEEK_DATES.forEach((date) => expect(heightClassOf(headerOf(container, date))).toBe(headerHeight));
  });

  test('có vùng được đặt tên theo tuần để trình đọc màn hình nhảy tới', () => {
    renderGrid();
    expect(screen.getByRole('region', { name: 'Thời khóa biểu tuần 12/01 – 17/01' })).toBeInTheDocument();
  });
});

describe('cột hôm nay', () => {
  test('today giữa tuần: chỉ tiêu đề Thứ 4 có aria-current="date" và chỉ cột Thứ 4 có bg-brand-soft', () => {
    const { container } = renderGrid({ today: '2026-01-14' });

    expect(headerOf(container, '2026-01-14')).toHaveAttribute('aria-current', 'date');
    expect(container.querySelectorAll('[aria-current="date"]')).toHaveLength(1);
    expect(columnOf(container, '2026-01-14')).toHaveClass('bg-brand-soft');
    expect(container.querySelectorAll('.bg-brand-soft')).toHaveLength(1);
  });

  test.each([
    ['Chủ nhật của tuần (không có cột)', '2026-01-18'],
    ['ngày của tuần khác', '2026-02-10'],
    ['today rỗng', ''],
  ])('%s → không cột nào được đánh dấu', (_label, today) => {
    const { container } = renderGrid({ today });

    expect(container.querySelectorAll('[aria-current]')).toHaveLength(0);
    expect(container.querySelectorAll('.bg-brand-soft')).toHaveLength(0);
  });

  test('today dạng ISO cuối ngày UTC (23:30Z) vẫn rơi đúng ngày UTC 14/01', () => {
    const { container } = renderGrid({ today: '2026-01-14T23:30:00.000Z' });

    expect(headerOf(container, '2026-01-14')).toHaveAttribute('aria-current', 'date');
    expect(headerOf(container, '2026-01-15')).not.toHaveAttribute('aria-current');
  });

  test('cột hôm nay giữ nền nổi bật kể cả khi không phải cột đang xem (bị ẩn trên điện thoại)', () => {
    const { container } = renderGrid({ today: '2026-01-14', focusedDate: '2026-01-16' });

    expect(columnOf(container, '2026-01-14')).toHaveClass('bg-brand-soft');
    expect(columnOf(container, '2026-01-14')).toHaveClass('hidden');
  });
});

describe('ô tiết', () => {
  test('slot Thứ 2 tiết 1 môn Toán lớp 11A4 hiện ở ô 12/01 tiết 1 với đủ lớp màu của môn Toán; các ô khác trống', () => {
    const { container } = renderGrid({ slots: [gridSlot({ dayOfWeek: 2, period: 1 })] });

    const cell = cellOf(container, '2026-01-12', 1);
    expect(within(cell).getByText('Toán')).toBeInTheDocument();
    expect(within(cell).getByText('11A4')).toBeInTheDocument();
    expect(cell).toHaveClass(...getSubjectColor('Toán').cell.split(' '));

    expect(cellOf(container, '2026-01-12', 2)).toBeEmptyDOMElement();
    expect(cellOf(container, '2026-01-13', 1)).toBeEmptyDOMElement();
    expect(container.querySelectorAll('[data-period]:not(:empty)')).toHaveLength(1);
  });

  test('mỗi môn một màu: slot môn Ngữ văn dùng lớp màu của Ngữ văn, khác màu Toán', () => {
    const { container } = renderGrid({
      slots: [makeSlot({ _id: 's-van', positionId: 'p-van', dayOfWeek: 3, period: 2, position: VAN })],
    });

    const cell = cellOf(container, '2026-01-13', 2);
    expect(cell).toHaveClass(...getSubjectColor('Ngữ văn').cell.split(' '));
    expect(cell).not.toHaveClass(...getSubjectColor('Toán').cell.split(' '));
  });

  test('slot thiếu position hoặc môn lạ không làm vỡ lưới và dùng màu trung tính', () => {
    const { container } = renderGrid({
      slots: [
        makeSlot({ _id: 's-lac', dayOfWeek: 2, period: 1, position: { ...TOAN, subject: 'Môn lạ' } }),
        makeSlot({ _id: 's-thieu', dayOfWeek: 3, period: 1 }),
      ],
    });

    expect(cellOf(container, '2026-01-12', 1)).toHaveClass(...getSubjectColor(undefined).cell.split(' '));
    expect(within(cellOf(container, '2026-01-12', 1)).getByText('Môn lạ')).toBeInTheDocument();
    expect(cellOf(container, '2026-01-13', 1)).toHaveClass(...getSubjectColor(undefined).cell.split(' '));
  });

  test('slot có dayOfWeek ngoài 2–7 (Chủ nhật = 1, 8…) bị bỏ qua, không có ô nào hiện nội dung', () => {
    const { container } = renderGrid({
      slots: [gridSlot({ _id: 's-cn', dayOfWeek: 1 }), gridSlot({ _id: 's-8', dayOfWeek: 8 })],
    });

    expect(container.querySelectorAll('[data-period]:not(:empty)')).toHaveLength(0);
  });

  test('2 slot của 2 vị trí khác nhau cùng ô: cả hai cùng hiển thị, không lỗi', () => {
    const { container } = renderGrid({
      slots: [
        gridSlot({ _id: 's-toan', dayOfWeek: 2, period: 1 }),
        makeSlot({ _id: 's-van', positionId: 'p-van', dayOfWeek: 2, period: 1, position: VAN }),
      ],
    });

    const cell = cellOf(container, '2026-01-12', 1);
    expect(within(cell).getByText('Toán')).toBeInTheDocument();
    expect(within(cell).getByText('11A4')).toBeInTheDocument();
    expect(within(cell).getByText('Ngữ văn')).toBeInTheDocument();
    expect(within(cell).getByText('11A5')).toBeInTheDocument();
  });
});

describe('hiệu lực theo ngày (Review Focus 1/3)', () => {
  test('slot Thứ 2 bắt đầu hiệu lực 14/01: ô Thứ 2 (12/01) trống; slot Thứ 5 cùng ngày hiệu lực thì ô Thứ 5 (15/01) có', () => {
    const { container } = renderGrid({
      slots: [
        gridSlot({ _id: 's-t2', dayOfWeek: 2, effectiveFrom: '2026-01-14T00:00:00.000Z' }),
        gridSlot({ _id: 's-t5', dayOfWeek: 5, effectiveFrom: '2026-01-14T00:00:00.000Z' }),
      ],
    });

    expect(cellOf(container, '2026-01-12', 1)).toBeEmptyDOMElement();
    expect(within(cellOf(container, '2026-01-15', 1)).getByText('Toán')).toBeInTheDocument();
  });

  test('slot Thứ 5 hết hiệu lực 13/01: ô 15/01 trống', () => {
    const { container } = renderGrid({
      slots: [gridSlot({ dayOfWeek: 5, effectiveFrom: '2025-09-01T00:00:00.000Z', effectiveTo: '2026-01-13T00:00:00.000Z' })],
    });

    expect(cellOf(container, '2026-01-15', 1)).toBeEmptyDOMElement();
  });

  test('hết hiệu lực đúng ngày 15/01 thì ngày đó vẫn còn tiết (so sánh bao gồm ngày cuối)', () => {
    const { container } = renderGrid({
      slots: [gridSlot({ dayOfWeek: 5, effectiveTo: '2026-01-15T00:00:00.000Z' })],
    });

    expect(within(cellOf(container, '2026-01-15', 1)).getByText('Toán')).toBeInTheDocument();
  });

  test('tuần có đổi TKB giữa tuần: cùng Thứ 4 tiết 2, tiết cũ đến 13/01 và tiết mới từ 14/01 — chỉ tiết mới hiện ở 14/01', () => {
    const { container } = renderGrid({
      slots: [
        gridSlot({ _id: 'cu', dayOfWeek: 4, period: 2, effectiveTo: '2026-01-13T00:00:00.000Z' }),
        makeSlot({
          _id: 'moi',
          positionId: 'p-van',
          dayOfWeek: 4,
          period: 2,
          effectiveFrom: '2026-01-14T00:00:00.000Z',
          position: VAN,
        }),
      ],
    });

    const cell = cellOf(container, '2026-01-14', 2);
    expect(within(cell).getByText('Ngữ văn')).toBeInTheDocument();
    expect(within(cell).queryByText('Toán')).not.toBeInTheDocument();
  });

  test('ngày bắt đầu hiệu lực dạng ISO cuối ngày UTC (23:30Z) tính theo ngày UTC: có hiệu lực từ 14/01, không phải 15/01', () => {
    const { container } = renderGrid({
      slots: [gridSlot({ dayOfWeek: 4, effectiveFrom: '2026-01-14T23:30:00.000Z' })],
    });

    expect(within(cellOf(container, '2026-01-14', 1)).getByText('Toán')).toBeInTheDocument();
  });
});

describe('ngày nghỉ', () => {
  const HOLIDAY_14_15 = makeHoliday({
    name: 'Nghỉ lễ',
    startDate: '2026-01-14T00:00:00.000Z',
    endDate: '2026-01-15T00:00:00.000Z',
  });

  test('tiêu đề các ngày nằm trong khoảng nghỉ có Badge tên ngày nghỉ; ô slot hiện "Nghỉ" thay vì môn; ngày khác không bị ảnh hưởng', () => {
    const { container } = renderGrid({
      holidays: [HOLIDAY_14_15],
      slots: [
        gridSlot({ _id: 's-t2', dayOfWeek: 2 }),
        gridSlot({ _id: 's-t4', dayOfWeek: 4 }),
        gridSlot({ _id: 's-t5', dayOfWeek: 5 }),
      ],
    });

    expect(within(headerOf(container, '2026-01-14')).getByText('Nghỉ lễ')).toBeInTheDocument();
    expect(within(headerOf(container, '2026-01-15')).getByText('Nghỉ lễ')).toBeInTheDocument();
    expect(within(headerOf(container, '2026-01-12')).queryByText('Nghỉ lễ')).not.toBeInTheDocument();
    expect(within(headerOf(container, '2026-01-16')).queryByText('Nghỉ lễ')).not.toBeInTheDocument();

    const holidayCell = cellOf(container, '2026-01-15', 1);
    expect(within(holidayCell).getByText('Nghỉ')).toBeInTheDocument();
    expect(within(holidayCell).queryByText('Toán')).not.toBeInTheDocument();
    expect(within(cellOf(container, '2026-01-14', 1)).getByText('Nghỉ')).toBeInTheDocument();

    const normalCell = cellOf(container, '2026-01-12', 1);
    expect(within(normalCell).getByText('Toán')).toBeInTheDocument();
    expect(within(normalCell).queryByText('Nghỉ')).not.toBeInTheDocument();
  });

  test('ô ngày nghỉ dùng màu trung tính, không dùng màu của môn', () => {
    const { container } = renderGrid({ holidays: [HOLIDAY_14_15], slots: [gridSlot({ dayOfWeek: 5 })] });

    const cell = cellOf(container, '2026-01-15', 1);
    expect(cell).toHaveClass(...getSubjectColor(undefined).cell.split(' '));
    expect(cell).not.toHaveClass(...getSubjectColor('Toán').cell.split(' '));
  });

  test('ô ngày nghỉ không hiện tên bài báo giảng dù có buổi rơi vào ngày đó', () => {
    const { container } = renderGrid({
      holidays: [HOLIDAY_14_15],
      slots: [gridSlot({ dayOfWeek: 5 })],
      lessonLogs: [makeWeekLog({ date: '2026-01-15T00:00:00.000Z' })],
    });

    expect(screen.queryByText('Bài 1')).not.toBeInTheDocument();
    expect(within(cellOf(container, '2026-01-15', 1)).getByText('Nghỉ')).toBeInTheDocument();
  });

  test('ngày nghỉ ISO cuối ngày UTC (23:30Z) chỉ phủ đúng ngày UTC 14/01, không lan sang 15/01', () => {
    const { container } = renderGrid({
      holidays: [makeHoliday({ startDate: '2026-01-14T23:30:00.000Z', endDate: '2026-01-14T23:30:00.000Z' })],
      slots: [gridSlot({ _id: 's-t4', dayOfWeek: 4 }), gridSlot({ _id: 's-t5', dayOfWeek: 5 })],
    });

    expect(within(headerOf(container, '2026-01-14')).getByText('Nghỉ lễ')).toBeInTheDocument();
    expect(within(headerOf(container, '2026-01-15')).queryByText('Nghỉ lễ')).not.toBeInTheDocument();
    expect(within(cellOf(container, '2026-01-15', 1)).getByText('Toán')).toBeInTheDocument();
  });

  test('ngày nghỉ dài nhiều tuần phủ cả tuần đang xem; ngày nghỉ ngoài tuần không hiện gì', () => {
    const { container } = renderGrid({
      holidays: [
        makeHoliday({ _id: 'tet', name: 'Nghỉ Tết', startDate: '2026-01-05T00:00:00.000Z', endDate: '2026-02-01T00:00:00.000Z' }),
        makeHoliday({ _id: 'xa', name: 'Nghỉ hè', startDate: '2026-06-01T00:00:00.000Z', endDate: '2026-08-31T00:00:00.000Z' }),
      ],
    });

    WEEK_DATES.forEach((date) => {
      expect(within(headerOf(container, date)).getByText('Nghỉ Tết')).toBeInTheDocument();
    });
    expect(screen.queryByText('Nghỉ hè')).not.toBeInTheDocument();
  });

  test('2 ngày nghỉ chồng lên cùng một ngày: hiện cả hai tên; ngày nghỉ đột xuất dùng Badge đỏ', () => {
    const { container } = renderGrid({
      holidays: [
        makeHoliday({ _id: 'h-le', name: 'Nghỉ lễ', startDate: '2026-01-14T00:00:00.000Z', endDate: '2026-01-14T00:00:00.000Z' }),
        makeHoliday({
          _id: 'h-bao',
          name: 'Nghỉ bão',
          type: 'DOT_XUAT',
          startDate: '2026-01-14T00:00:00.000Z',
          endDate: '2026-01-14T00:00:00.000Z',
        }),
      ],
    });

    const header = headerOf(container, '2026-01-14');
    expect(within(header).getByText('Nghỉ lễ')).toBeInTheDocument();
    expect(within(header).getByText('Nghỉ bão')).toHaveClass('bg-danger-soft');
    expect(within(header).getByText('Nghỉ lễ')).not.toHaveClass('bg-danger-soft');
  });

  test('ngày nghỉ có ngày hỏng không bị coi là phủ mọi ngày', () => {
    const { container } = renderGrid({
      holidays: [
        makeHoliday({ _id: 'hong-1', name: 'Hỏng 1', startDate: '', endDate: '2026-01-15T00:00:00.000Z' }),
        makeHoliday({ _id: 'hong-2', name: 'Hỏng 2', startDate: '2026-01-12T00:00:00.000Z', endDate: null }),
      ],
      slots: [gridSlot({ dayOfWeek: 3 })],
    });

    expect(screen.queryByText('Hỏng 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Hỏng 2')).not.toBeInTheDocument();
    expect(within(cellOf(container, '2026-01-13', 1)).getByText('Toán')).toBeInTheDocument();
  });
});

describe('tên bài báo giảng', () => {
  test('1 ngày có 2 tiết cùng vị trí (tiết 1 và 2) + 1 buổi báo giảng: tên bài xuất hiện đúng 1 lần, ở ô tiết ĐẦU TIÊN', () => {
    const { container } = renderGrid({
      slots: [
        gridSlot({ _id: 's2', dayOfWeek: 2, period: 2 }),
        gridSlot({ _id: 's1', dayOfWeek: 2, period: 1 }),
      ],
      lessonLogs: [
        makeWeekLog({
          date: '2026-01-12T00:00:00.000Z',
          ppctItem: { order: 5, week: 1, periodLabel: '5', title: 'Bài 5', periodCount: 1, requirement: '' },
        }),
      ],
    });

    expect(screen.getAllByText('Bài 5')).toHaveLength(1);
    expect(within(cellOf(container, '2026-01-12', 1)).getByText('Bài 5')).toBeInTheDocument();
    expect(within(cellOf(container, '2026-01-12', 2)).queryByText('Bài 5')).not.toBeInTheDocument();
  });

  test('tiết đầu tiên là tiết nhỏ nhất của vị trí trong NGÀY đó, không phụ thuộc thứ tự mảng slot', () => {
    const { container } = renderGrid({
      slots: [
        gridSlot({ _id: 's-t4', dayOfWeek: 4, period: 4 }),
        gridSlot({ _id: 's-t3', dayOfWeek: 4, period: 3 }),
        gridSlot({ _id: 's-t5', dayOfWeek: 4, period: 5 }),
      ],
      lessonLogs: [makeWeekLog({ date: '2026-01-14T00:00:00.000Z' })],
    });

    expect(within(cellOf(container, '2026-01-14', 3)).getByText('Bài 1')).toBeInTheDocument();
    expect(within(cellOf(container, '2026-01-14', 4)).queryByText('Bài 1')).not.toBeInTheDocument();
    expect(within(cellOf(container, '2026-01-14', 5)).queryByText('Bài 1')).not.toBeInTheDocument();
  });

  test('buổi đã thực hiện có biểu tượng aria-label "Đã thực hiện"; buổi chưa thực hiện thì không', () => {
    const { container, unmount } = renderGrid({
      slots: [gridSlot()],
      lessonLogs: [makeWeekLog({ done: true, date: '2026-01-12T00:00:00.000Z' })],
    });
    expect(within(cellOf(container, '2026-01-12', 1)).getByLabelText('Đã thực hiện')).toBeInTheDocument();
    unmount();

    renderGrid({
      slots: [gridSlot()],
      lessonLogs: [makeWeekLog({ done: false, date: '2026-01-12T00:00:00.000Z' })],
    });
    expect(screen.queryByLabelText('Đã thực hiện')).not.toBeInTheDocument();
    expect(screen.getByText('Bài 1')).toBeInTheDocument();
  });

  test('buổi của vị trí khác hoặc của ngày khác không gắn nhầm vào ô', () => {
    const { container } = renderGrid({
      slots: [gridSlot({ dayOfWeek: 2 })],
      lessonLogs: [
        makeWeekLog({
          _id: 'l-van',
          positionId: 'p-van',
          position: VAN,
          date: '2026-01-12T00:00:00.000Z',
          ppctItem: { order: 1, week: 1, periodLabel: '1', title: 'Bài của Văn', periodCount: 1, requirement: '' },
        }),
        makeWeekLog({
          _id: 'l-ngay-khac',
          date: '2026-01-13T00:00:00.000Z',
          ppctItem: { order: 2, week: 1, periodLabel: '2', title: 'Bài ngày khác', periodCount: 1, requirement: '' },
        }),
      ],
    });

    expect(screen.queryByText('Bài của Văn')).not.toBeInTheDocument();
    expect(screen.queryByText('Bài ngày khác')).not.toBeInTheDocument();
    expect(within(cellOf(container, '2026-01-12', 1)).getByText('Toán')).toBeInTheDocument();
  });

  test('nhiều buổi cùng vị trí cùng ngày: mọi tên bài nằm ở ô đầu theo thứ tự backend trả, mỗi tên đúng 1 lần', () => {
    const { container } = renderGrid({
      slots: [gridSlot({ _id: 's1', period: 1 }), gridSlot({ _id: 's2', period: 2 })],
      lessonLogs: [
        makeWeekLog({
          _id: 'l1',
          date: '2026-01-12T00:00:00.000Z',
          ppctItem: { order: 1, week: 1, periodLabel: '1', title: 'Bài A', periodCount: 1, requirement: '' },
        }),
        makeWeekLog({
          _id: 'l2',
          date: '2026-01-12T00:00:00.000Z',
          ppctItem: { order: 2, week: 1, periodLabel: '2', title: 'Bài B', periodCount: 1, requirement: '' },
        }),
      ],
    });

    const first = cellOf(container, '2026-01-12', 1);
    expect(within(first).getByText('Bài A')).toBeInTheDocument();
    expect(within(first).getByText('Bài B')).toBeInTheDocument();
    expect(screen.getAllByText('Bài A')).toHaveLength(1);
    expect(screen.getAllByText('Bài B')).toHaveLength(1);
  });

  test('buổi mất mục PPCT (ppctItem null) không làm vỡ lưới và không hiện chữ "null"', () => {
    const { container } = renderGrid({
      slots: [gridSlot()],
      lessonLogs: [makeLessonLog({ ppctItem: null, date: '2026-01-12T00:00:00.000Z' })],
    });

    expect(within(cellOf(container, '2026-01-12', 1)).getByText('Toán')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('null');
    expect(container).not.toHaveTextContent('undefined');
  });

  test('ngày của buổi báo giảng dạng ISO cuối ngày UTC (23:30Z) tính theo ngày UTC, khớp ô 14/01', () => {
    const { container } = renderGrid({
      slots: [gridSlot({ dayOfWeek: 4 })],
      lessonLogs: [makeWeekLog({ date: '2026-01-14T23:30:00.000Z' })],
    });

    expect(within(cellOf(container, '2026-01-14', 1)).getByText('Bài 1')).toBeInTheDocument();
  });

  test('buổi báo giảng rơi vào Chủ nhật (không có cột) không làm vỡ lưới', () => {
    renderGrid({
      slots: [gridSlot()],
      lessonLogs: [makeWeekLog({ date: '2026-01-18T00:00:00.000Z' })],
    });

    expect(screen.queryByText('Bài 1')).not.toBeInTheDocument();
  });
});

describe('một ngày mỗi lần trên điện thoại', () => {
  test('cột đang xem không có class hidden; 5 cột còn lại có hidden và md:flex', () => {
    const { container } = renderGrid({ focusedDate: '2026-01-14' });

    const focused = columnOf(container, '2026-01-14');
    expect(focused).not.toHaveClass('hidden');
    WEEK_DATES.filter((date) => date !== '2026-01-14').forEach((date) => {
      expect(columnOf(container, date)).toHaveClass('hidden', 'md:flex');
    });
    expect(container.querySelectorAll('[data-column].hidden')).toHaveLength(5);
  });

  test('thanh nút T2…T7 chỉ hiện dưới md; mỗi nút có aria-label "Xem Thứ N"; nút của ngày đang xem có aria-pressed', () => {
    renderGrid({ focusedDate: '2026-01-14' });

    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['T2', 'T3', 'T4', 'T5', 'T6', 'T7']);
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Xem Thứ 2',
      'Xem Thứ 3',
      'Xem Thứ 4',
      'Xem Thứ 5',
      'Xem Thứ 6',
      'Xem Thứ 7',
    ]);
    expect(buttons[0].parentElement).toHaveClass('md:hidden');
    expect(screen.getByRole('button', { name: 'Xem Thứ 4' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Xem Thứ 2' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('bấm "Xem Thứ 2" gọi onFocusDate với đúng ngày của cột đó', async () => {
    const { onFocusDate } = renderGrid({ focusedDate: '2026-01-14' });

    await userEvent.click(screen.getByRole('button', { name: 'Xem Thứ 2' }));
    expect(onFocusDate).toHaveBeenCalledTimes(1);
    expect(onFocusDate).toHaveBeenLastCalledWith('2026-01-12');

    await userEvent.click(screen.getByRole('button', { name: 'Xem Thứ 6' }));
    expect(onFocusDate).toHaveBeenLastCalledWith('2026-01-16');
  });

  test('focusedDate không thuộc tuần (vd tuần cũ) → hiện cột Thứ Hai thay vì để điện thoại trống trơn', () => {
    const { container } = renderGrid({ focusedDate: '2026-02-03' });

    expect(columnOf(container, '2026-01-12')).not.toHaveClass('hidden');
    expect(container.querySelectorAll('[data-column].hidden')).toHaveLength(5);
  });

  test('không truyền onFocusDate: bấm nút không ném lỗi', async () => {
    render(
      <TimetableGrid
        weekStart={WEEK_START}
        today="2026-01-14"
        slots={[]}
        lessonLogs={[]}
        holidays={[]}
        focusedDate="2026-01-12"
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Xem Thứ 3' }));
  });
});

describe('đầu vào thiếu', () => {
  test('slots, lessonLogs, holidays không truyền vẫn dựng lưới trống', () => {
    const { container } = render(<TimetableGrid weekStart={WEEK_START} today="2026-01-14" focusedDate="2026-01-12" />);

    expect(container.querySelectorAll('[data-column]')).toHaveLength(6);
    expect(container.querySelectorAll('[data-period]:not(:empty)')).toHaveLength(0);
  });
});
