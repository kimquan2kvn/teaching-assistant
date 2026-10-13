import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/lib/store/auth-slice';
import { makeHoliday, makeMyPosition, makeSchoolYear, makeSlot, makeWeekLog } from '@/lib/test-fixtures/phase3';
import ThoiKhoaBieuPage from './page';

const getWeekMock = jest.fn();
jest.mock('@/lib/store/timetable-api', () => ({
  ...jest.requireActual('@/lib/store/timetable-api'),
  useGetMyTimetableWeekQuery: (...args) => getWeekMock(...args),
}));

const getSchoolYearsMock = jest.fn();
const getHolidaysMock = jest.fn();
jest.mock('@/lib/store/school-calendar-api', () => ({
  ...jest.requireActual('@/lib/store/school-calendar-api'),
  useGetSchoolYearsQuery: (...args) => getSchoolYearsMock(...args),
  useGetHolidaysQuery: (...args) => getHolidaysMock(...args),
}));

const getMyPositionsMock = jest.fn();
jest.mock('@/lib/store/positions-api', () => ({
  ...jest.requireActual('@/lib/store/positions-api'),
  useGetMyPositionsQuery: (...args) => getMyPositionsMock(...args),
}));

const slotPanelMock = jest.fn();
jest.mock('@/components/schedule/slot-panel', () => ({
  SlotPanel: (props) => {
    slotPanelMock(props);
    return <div data-testid="slot-panel" />;
  },
}));

const TEACHER = { id: 'u-toan', role: 'TEACHER' };
const ADMIN = { id: 'u-admin', role: 'ADMIN' };
const STUDENT = { id: 'u-hs', role: 'STUDENT' };

const DENIED_TEXT =
  'Thời khóa biểu giảng dạy chỉ dành cho giáo viên. Quản trị viên khai báo/xem tiết của từng môn ở trang chi tiết lớp.';
const NO_SUBJECT_TEXT = 'Bạn chưa giữ môn nào, hãy tham gia lớp để có thời khóa biểu';
const EMPTY_WEEK_TEXT = 'Tuần này chưa có tiết nào. Khai báo tiết ở phần "Khai báo tiết" bên dưới.';
const HOLIDAY_WARNING = 'Không tải được ngày nghỉ, các ô tiết có thể chưa hiển thị đúng ngày nghỉ.';

const MY_POSITIONS = [
  makeMyPosition({ id: 'p-hr', type: 'HOMEROOM', subject: undefined }),
  makeMyPosition({ id: 'p-toan', subject: 'Toán' }),
  makeMyPosition({ id: 'p-van', subject: 'Ngữ văn', class: { id: 'class-2', code: '11A5-ABCD', name: '11A5' } }),
];

const WEEK_DATA = {
  weekStart: '2026-01-12',
  weekEnd: '2026-01-18',
  slots: [makeSlot({ position: makeWeekLog().position })],
  lessonLogs: [makeWeekLog({ date: '2026-01-12T00:00:00.000Z' })],
};

// Thứ Tư 14/01/2026 10:00 giờ VN. Chỉ giả `Date` (không giả setTimeout/promise) để userEvent và React chạy bình thường.
const WEDNESDAY_VN = '2026-01-14T03:00:00.000Z';

function fakeNow(isoInstant) {
  jest.useFakeTimers({
    now: new Date(isoInstant),
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
}

// Hình dạng thật của hook RTK Query khi đã có kết quả cho ĐÚNG tuần đang xem: data trùng currentData.
function loadedWeek(data) {
  return { data, currentData: data, isLoading: false, isFetching: false, isError: false };
}

// Vừa đổi tuần: hook còn giữ `data` của tuần trước nhưng chưa có `currentData` của tuần mới.
function switchingWeek(staleData) {
  return { data: staleData, currentData: undefined, isLoading: false, isFetching: true, isError: false };
}

function renderPage(user = TEACHER) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { user, accessToken: user ? 'token' : null } },
  });
  const buildTree = () => (
    <Provider store={store}>
      <ThoiKhoaBieuPage />
    </Provider>
  );
  const utils = render(buildTree());
  // Dựng element MỚI mỗi lần (React bỏ qua render lại nếu element giống hệt) để mô phỏng dữ liệu RTK Query về muộn.
  return { ...utils, rerenderPage: () => utils.rerender(buildTree()) };
}

const columnOf = (container, date) => container.querySelector(`[data-column="${date}"]`);
const headerOf = (container, date) => container.querySelector(`[data-date="${date}"]:not([data-period])`);
const cellOf = (container, date, period) =>
  container.querySelector(`[data-date="${date}"][data-period="${period}"]`);
const hiddenColumnDates = (container) =>
  Array.from(container.querySelectorAll('[data-column].hidden')).map((column) => column.dataset.column);

beforeEach(() => {
  fakeNow(WEDNESDAY_VN);
  getWeekMock.mockReset();
  getSchoolYearsMock.mockReset();
  getHolidaysMock.mockReset();
  getMyPositionsMock.mockReset();
  slotPanelMock.mockReset();
  getWeekMock.mockReturnValue(loadedWeek(WEEK_DATA));
  getSchoolYearsMock.mockReturnValue({ data: [makeSchoolYear()], isLoading: false, isError: false });
  getHolidaysMock.mockReturnValue({ data: [], isLoading: false, isError: false });
  getMyPositionsMock.mockReturnValue({ data: MY_POSITIONS, isLoading: false, isError: false });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('tuần ban đầu và điều hướng (Review Focus 1)', () => {
  test.each([
    { label: 'giữa tuần (Thứ Tư 10:00)', instant: '2026-01-14T03:00:00.000Z', expectedWeekStart: '2026-01-12' },
    {
      label: 'Chủ nhật 12:00 giờ VN (vẫn thuộc tuần của Thứ Hai trước đó)',
      instant: '2026-01-18T05:00:00.000Z',
      expectedWeekStart: '2026-01-12',
    },
    { label: 'Chủ nhật 23:59 giờ VN (16:59Z)', instant: '2026-01-18T16:59:00.000Z', expectedWeekStart: '2026-01-12' },
    {
      label: '00:00 sáng Thứ Hai 19/01 giờ VN (17:00Z Chủ nhật)',
      instant: '2026-01-18T17:00:00.000Z',
      expectedWeekStart: '2026-01-19',
    },
    {
      label: '00:30 sáng Thứ Hai 12/01 giờ VN (17:30Z Chủ nhật 11/01)',
      instant: '2026-01-11T17:30:00.000Z',
      expectedWeekStart: '2026-01-12',
    },
    {
      label: '06:30 sáng Thứ Hai 19/01 giờ VN (23:30Z Chủ nhật 18/01)',
      instant: '2026-01-18T23:30:00.000Z',
      expectedWeekStart: '2026-01-19',
    },
  ])('mở trang lúc $label → query tuần với weekStart $expectedWeekStart', ({ instant, expectedWeekStart }) => {
    jest.useRealTimers();
    fakeNow(instant);
    renderPage();

    expect(getWeekMock).toHaveBeenLastCalledWith({ weekStart: expectedWeekStart });
  });

  test('Tuần sau / Tuần trước / Tuần này / đổi Tháng đều query lại với Thứ Hai của tuần mới', async () => {
    jest.useRealTimers();
    fakeNow('2026-01-18T05:00:00.000Z');
    renderPage();
    expect(getWeekMock).toHaveBeenLastCalledWith({ weekStart: '2026-01-12' });

    await userEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));
    expect(getWeekMock).toHaveBeenLastCalledWith({ weekStart: '2026-01-19' });

    await userEvent.click(screen.getByRole('button', { name: 'Tuần trước' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tuần trước' }));
    expect(getWeekMock).toHaveBeenLastCalledWith({ weekStart: '2026-01-05' });

    await userEvent.click(screen.getByRole('button', { name: 'Tuần này' }));
    expect(getWeekMock).toHaveBeenLastCalledWith({ weekStart: '2026-01-12' });

    await userEvent.selectOptions(screen.getByLabelText('Tháng'), '2');
    expect(getWeekMock).toHaveBeenLastCalledWith({ weekStart: '2026-02-02' });
  });

  test('nhãn tuần và bộ lọc tháng/năm theo tuần đang xem', () => {
    renderPage();

    expect(screen.getByText('12/01/2026 – 18/01/2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Tháng')).toHaveDisplayValue('Tháng 1');
    expect(screen.getByLabelText('Năm')).toHaveDisplayValue('2026');
  });
});

describe('phân quyền (Review Focus 2)', () => {
  test.each([
    ['ADMIN', ADMIN],
    ['STUDENT', STUDENT],
  ])('%s: chỉ thấy câu giải thích, KHÔNG có điều hướng tuần/lưới và không hook nào bắn request', (_role, user) => {
    const { container } = renderPage(user);

    expect(screen.getByText(DENIED_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tuần sau' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-column]')).toBeNull();
    expect(getWeekMock).not.toHaveBeenCalled();
    expect(getMyPositionsMock).not.toHaveBeenCalled();
    expect(getSchoolYearsMock).not.toHaveBeenCalled();
    expect(getHolidaysMock).not.toHaveBeenCalled();
    expect(slotPanelMock).not.toHaveBeenCalled();
  });

  test('người dùng chưa tải xong: "Đang tải...", chưa kết luận từ chối và chưa bắn request', () => {
    renderPage(null);

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải...');
    expect(screen.queryByText(DENIED_TEXT)).not.toBeInTheDocument();
    expect(getWeekMock).not.toHaveBeenCalled();
  });
});

describe('lưới tuần', () => {
  test('dữ liệu tuần đổ vào lưới: tiết Thứ 2 tiết 1 hiện môn, lớp và tên bài của buổi 12/01; cột hôm nay (Thứ 4) nổi bật', () => {
    const { container } = renderPage();

    const cell = cellOf(container, '2026-01-12', 1);
    expect(within(cell).getByText('Toán')).toBeInTheDocument();
    expect(within(cell).getByText('11A4')).toBeInTheDocument();
    expect(within(cell).getByText('Bài 1')).toBeInTheDocument();
    expect(headerOf(container, '2026-01-14')).toHaveAttribute('aria-current', 'date');
  });

  test('ngày nghỉ của năm học hiện hành được truyền xuống lưới (Badge ở tiêu đề)', () => {
    getHolidaysMock.mockReturnValue({
      data: [
        makeHoliday({ name: 'Nghỉ lễ', startDate: '2026-01-14T00:00:00.000Z', endDate: '2026-01-14T00:00:00.000Z' }),
      ],
      isError: false,
    });
    const { container } = renderPage();

    expect(within(headerOf(container, '2026-01-14')).getByText('Nghỉ lễ')).toBeInTheDocument();
    expect(within(headerOf(container, '2026-01-13')).queryByText('Nghỉ lễ')).not.toBeInTheDocument();
  });

  test('đang tải lần đầu: chỉ "Đang tải...", chưa dựng lưới, chưa nháy câu "chưa có tiết nào"', () => {
    getWeekMock.mockReturnValue({ data: undefined, isLoading: true, isFetching: true, isError: false });
    const { container } = renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải...');
    expect(container.querySelector('[data-column]')).toBeNull();
    expect(screen.queryByText(EMPTY_WEEK_TEXT)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tuần sau' })).toBeInTheDocument();
  });

  test('đang tải tuần mới (hook còn `data` tuần cũ): khung lưới vẫn hiện, aria-busy, KHÔNG có tiết của tuần cũ', () => {
    getWeekMock.mockReturnValue(switchingWeek(WEEK_DATA));
    const { container } = renderPage();

    const region = screen.getByRole('region', { name: 'Thời khóa biểu tuần 12/01 – 17/01' });
    expect(region.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelectorAll('[data-column]')).toHaveLength(6);
    expect(within(region).queryByText('Toán')).not.toBeInTheDocument();
    expect(within(region).queryByText('Bài 1')).not.toBeInTheDocument();
  });

  test('nhảy sang tháng xa: tiết (hiệu lực không giới hạn) của tuần cũ không được đặt lên ngày của tuần mới trong lúc tải, và không nháy câu "tuần này chưa có tiết nào"', async () => {
    getWeekMock.mockImplementation(({ weekStart }) =>
      weekStart === '2026-01-12' ? loadedWeek(WEEK_DATA) : switchingWeek(WEEK_DATA),
    );
    const { container } = renderPage();
    expect(within(cellOf(container, '2026-01-12', 1)).getByText('Toán')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Tháng'), '3');

    expect(getWeekMock).toHaveBeenLastCalledWith({ weekStart: '2026-03-02' });
    expect(cellOf(container, '2026-03-02', 1)).toBeEmptyDOMElement();
    expect(screen.queryByText('Toán')).not.toBeInTheDocument();
    expect(screen.queryByText(EMPTY_WEEK_TEXT)).not.toBeInTheDocument();
    expect(screen.getByRole('region').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
  });

  test('tải xong: aria-busy tắt', () => {
    renderPage();

    const region = screen.getByRole('region', { name: 'Thời khóa biểu tuần 12/01 – 17/01' });
    expect(region.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'false');
  });
});

describe('lỗi tải', () => {
  test('lỗi 400 của backend hiện nguyên văn; không dựng lưới trống gây hiểu nhầm; điều hướng tuần vẫn dùng được', () => {
    getWeekMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: { status: 400, data: { message: 'Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd' } },
    });
    const { container } = renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd');
    expect(container.querySelector('[data-column]')).toBeNull();
    expect(screen.queryByText(EMPTY_WEEK_TEXT)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tuần sau' })).toBeInTheDocument();
  });

  test('403 của guard (tiếng Anh) hiện câu tiếng Việt cố định; lỗi mạng hiện câu dự phòng', () => {
    getWeekMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 403, data: { message: 'Forbidden resource' } },
    });
    const { unmount } = renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent('Bạn không có quyền thực hiện thao tác này');
    unmount();

    getWeekMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' },
    });
    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được thời khóa biểu, vui lòng thử lại');
  });

  test('lỗi tải ngày nghỉ: lưới vẫn dựng nhưng có cảnh báo, không im lặng hiện tiết trong ngày nghỉ', () => {
    getHolidaysMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 500, data: { message: 'Đã có lỗi xảy ra, vui lòng thử lại sau' } },
    });
    const { container } = renderPage();

    expect(screen.getByText(HOLIDAY_WARNING)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-column]')).toHaveLength(6);
  });

  test('lỗi tải danh sách năm học cũng báo như vậy (không biết năm nào để lấy ngày nghỉ)', () => {
    getSchoolYearsMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: { status: 500 } });
    renderPage();

    expect(screen.getByText(HOLIDAY_WARNING)).toBeInTheDocument();
  });

  test.each([
    ['message của backend hiện nguyên văn', { status: 500, data: { message: 'Đã có lỗi xảy ra, vui lòng thử lại sau' } }, 'Đã có lỗi xảy ra, vui lòng thử lại sau'],
    ['lỗi mạng hiện câu dự phòng', { status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' }, 'Không tải được danh sách môn, vui lòng thử lại'],
  ])('tải danh sách vị trí lỗi (%s): có role=alert, không nói nhầm "chưa giữ môn nào", lưới tuần vẫn dựng', (_label, error, expectedText) => {
    getMyPositionsMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, error });
    const { container } = renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent(expectedText);
    expect(screen.queryByText(NO_SUBJECT_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText('Khai báo tiết')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-column]')).toHaveLength(6);
  });

  test('danh sách vị trí tải được thì không có alert nào', () => {
    renderPage();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('không có lỗi ngày nghỉ thì không hiện cảnh báo', () => {
    renderPage();

    expect(screen.queryByText(HOLIDAY_WARNING)).not.toBeInTheDocument();
  });
});

describe('ngày nghỉ theo năm học hiện hành', () => {
  test('lấy ngày nghỉ của năm học isCurrent, không phải năm đầu danh sách', () => {
    getSchoolYearsMock.mockReturnValue({
      data: [makeSchoolYear({ _id: 'y0', name: '2024-2025', isCurrent: false }), makeSchoolYear({ _id: 'y1' })],
    });
    renderPage();

    expect(getHolidaysMock).toHaveBeenLastCalledWith('y1', { skip: false });
  });

  test.each([
    ['chưa có năm học nào', []],
    ['có năm học nhưng không năm nào là hiện hành', [makeSchoolYear({ isCurrent: false })]],
    ['danh sách năm học chưa tải', undefined],
  ])('%s → useGetHolidaysQuery được gọi với skip:true và lưới vẫn dựng', (_label, years) => {
    getSchoolYearsMock.mockReturnValue({ data: years, isLoading: years === undefined });
    const { container } = renderPage();

    expect(getHolidaysMock).toHaveBeenLastCalledWith(undefined, { skip: true });
    expect(container.querySelectorAll('[data-column]')).toHaveLength(6);
  });
});

describe('trạng thái rỗng (Review Focus 3)', () => {
  test('chưa giữ môn SUBJECT nào (chỉ có vị trí chủ nhiệm): câu giải thích + link tham gia lớp; không có phần Khai báo tiết', () => {
    getMyPositionsMock.mockReturnValue({ data: [MY_POSITIONS[0]], isLoading: false });
    getWeekMock.mockReturnValue(loadedWeek({ ...WEEK_DATA, slots: [], lessonLogs: [] }));
    renderPage();

    expect(screen.getByText(NO_SUBJECT_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tham gia lớp' })).toHaveAttribute('href', '/lop-hoc/tham-gia');
    expect(screen.queryByText(EMPTY_WEEK_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText('Khai báo tiết')).not.toBeInTheDocument();
    expect(slotPanelMock).not.toHaveBeenCalled();
  });

  test('danh sách vị trí rỗng cũng vậy', () => {
    getMyPositionsMock.mockReturnValue({ data: [], isLoading: false });
    renderPage();

    expect(screen.getByText(NO_SUBJECT_TEXT)).toBeInTheDocument();
  });

  test('danh sách vị trí đang tải hoặc lỗi: không nháy câu "chưa giữ môn nào" và không có phần Khai báo tiết', () => {
    getMyPositionsMock.mockReturnValue({ data: undefined, isLoading: true });
    const { unmount } = renderPage();
    expect(screen.queryByText(NO_SUBJECT_TEXT)).not.toBeInTheDocument();
    unmount();

    getMyPositionsMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: { status: 500 } });
    renderPage();
    expect(screen.queryByText(NO_SUBJECT_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText('Khai báo tiết')).not.toBeInTheDocument();
  });

  test('có môn nhưng tuần không có tiết: câu hướng dẫn xuống phần Khai báo tiết; lưới vẫn dựng', () => {
    getWeekMock.mockReturnValue(loadedWeek({ ...WEEK_DATA, slots: [], lessonLogs: [] }));
    const { container } = renderPage();

    expect(screen.getByText(EMPTY_WEEK_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(NO_SUBJECT_TEXT)).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-column]')).toHaveLength(6);
  });

  test('tuần có tiết thì không hiện câu rỗng nào', () => {
    renderPage();

    expect(screen.queryByText(EMPTY_WEEK_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText(NO_SUBJECT_TEXT)).not.toBeInTheDocument();
  });

  test('slot có trong dữ liệu tuần nhưng không còn hiệu lực ở ngày nào của tuần: vẫn coi là tuần chưa có tiết', () => {
    getWeekMock.mockReturnValue(
      loadedWeek({
        ...WEEK_DATA,
        slots: [
          makeSlot({
            dayOfWeek: 7,
            effectiveTo: '2026-01-14T00:00:00.000Z',
            position: makeWeekLog().position,
          }),
        ],
        lessonLogs: [],
      }),
    );
    renderPage();

    expect(screen.getByText(EMPTY_WEEK_TEXT)).toBeInTheDocument();
  });
});

describe('phần Khai báo tiết', () => {
  test('bộ chọn chỉ có các môn SUBJECT của chính mình, nhãn "{lớp} — {môn}" (không có chủ nhiệm); SlotPanel nhận môn đầu và canEdit', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Khai báo tiết' })).toBeInTheDocument();
    const options = within(screen.getByLabelText('Môn'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toEqual(['11A4 — Toán', '11A5 — Ngữ văn']);
    expect(slotPanelMock).toHaveBeenLastCalledWith({ positionId: 'p-toan', canEdit: true });
  });

  test('đổi môn trong bộ chọn → SlotPanel nhận positionId của môn vừa chọn', async () => {
    renderPage();

    await userEvent.selectOptions(screen.getByLabelText('Môn'), '11A5 — Ngữ văn');

    expect(slotPanelMock).toHaveBeenLastCalledWith({ positionId: 'p-van', canEdit: true });
  });

  test('vị trí đang chờ tải xong rồi mới có: tự chọn môn đầu, không cần thao tác', () => {
    getMyPositionsMock.mockReturnValue({ data: undefined, isLoading: true });
    const { rerenderPage } = renderPage();
    expect(slotPanelMock).not.toHaveBeenCalled();

    getMyPositionsMock.mockReturnValue({ data: MY_POSITIONS, isLoading: false });
    rerenderPage();

    expect(slotPanelMock).toHaveBeenLastCalledWith({ positionId: 'p-toan', canEdit: true });
  });
});

describe('một ngày mỗi lần trên điện thoại (Review Focus 3)', () => {
  test('mặc định hiện cột hôm nay nếu hôm nay thuộc tuần đang xem (Thứ Tư 14/01)', () => {
    const { container } = renderPage();

    expect(columnOf(container, '2026-01-14')).not.toHaveClass('hidden');
    expect(hiddenColumnDates(container)).toEqual(['2026-01-12', '2026-01-13', '2026-01-15', '2026-01-16', '2026-01-17']);
  });

  test('sau "Tuần sau" (hôm nay không thuộc tuần mới) hiện cột Thứ Hai của tuần mới', async () => {
    const { container } = renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));

    expect(columnOf(container, '2026-01-19')).not.toHaveClass('hidden');
    expect(hiddenColumnDates(container)).toHaveLength(5);
    expect(hiddenColumnDates(container)).not.toContain('2026-01-19');
  });

  test('hôm nay là Chủ nhật (không có cột) → hiện cột Thứ Hai của tuần đó', () => {
    jest.useRealTimers();
    fakeNow('2026-01-18T05:00:00.000Z');
    const { container } = renderPage();

    expect(columnOf(container, '2026-01-12')).not.toHaveClass('hidden');
    expect(hiddenColumnDates(container)).toHaveLength(5);
  });

  test('bấm nút "Xem Thứ 3" đổi cột đang xem; sang tuần khác thì quay về mặc định của tuần đó', async () => {
    const { container } = renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Xem Thứ 3' }));
    expect(columnOf(container, '2026-01-13')).not.toHaveClass('hidden');
    expect(columnOf(container, '2026-01-14')).toHaveClass('hidden');

    await userEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));
    expect(columnOf(container, '2026-01-19')).not.toHaveClass('hidden');
    expect(columnOf(container, '2026-01-20')).toHaveClass('hidden');
  });

  test('chọn ngày ở tuần khác rồi quay về tuần có hôm nay: về lại cột hôm nay, không rơi về Thứ Hai', async () => {
    const { container } = renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));
    await userEvent.click(screen.getByRole('button', { name: 'Xem Thứ 5' }));
    expect(columnOf(container, '2026-01-22')).not.toHaveClass('hidden');

    await userEvent.click(screen.getByRole('button', { name: 'Tuần trước' }));
    expect(columnOf(container, '2026-01-14')).not.toHaveClass('hidden');
    expect(hiddenColumnDates(container)).toHaveLength(5);
  });
});

describe('dùng component shadcn/ui', () => {
  test('trạng thái "chưa giữ môn" là Card viền đứt; lỗi tải tuần là Alert destructive', () => {
    getMyPositionsMock.mockReturnValue({ data: [], isLoading: false });
    const { unmount } = renderPage();
    expect(screen.getByText(NO_SUBJECT_TEXT).closest('.bg-card')).toHaveClass('border-dashed');
    unmount();

    getWeekMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: { status: 500 } });
    renderPage();
    expect(screen.getByRole('alert')).toHaveClass('border-destructive/40');
  });

  test('cảnh báo lỗi ngày nghỉ là Alert destructive, không phải role=alert (giữ như bản cũ: không ngắt lời trình đọc)', () => {
    getHolidaysMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: { status: 500 } });
    renderPage();

    const warning = screen.getByText(HOLIDAY_WARNING);
    expect(warning).toHaveClass('border-destructive/40');
    expect(warning).not.toHaveAttribute('role', 'alert');
  });
});
