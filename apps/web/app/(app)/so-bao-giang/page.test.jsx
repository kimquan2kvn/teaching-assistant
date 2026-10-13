import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/lib/store/auth-slice';
import { makeMyPosition, makeWeekLog } from '@/lib/test-fixtures/phase3';
import WeeklyLessonLogsPage from './page';

const getWeekLogsMock = jest.fn();
const updateLessonLogMock = jest.fn();
jest.mock('@/lib/store/lesson-logs-api', () => ({
  ...jest.requireActual('@/lib/store/lesson-logs-api'),
  useGetTeacherWeekLessonLogsQuery: (...args) => getWeekLogsMock(...args),
  useUpdateLessonLogMutation: () => [updateLessonLogMock, { isLoading: false }],
}));

const getMyPositionsMock = jest.fn();
jest.mock('@/lib/store/positions-api', () => ({
  ...jest.requireActual('@/lib/store/positions-api'),
  useGetMyPositionsQuery: (...args) => getMyPositionsMock(...args),
}));

const todayMock = jest.fn();
jest.mock('@/lib/utils', () => ({
  ...jest.requireActual('@/lib/utils'),
  todayDateOnly: () => todayMock(),
}));

// Mốc đã kiểm: 2026-01-12 là Thứ Hai, 2026-01-18 là Chủ Nhật.
const TEACHER = { id: 'u-toan', role: 'TEACHER' };
const ADMIN = { id: 'u-admin', role: 'ADMIN' };
const STUDENT = { id: 'u-hs', role: 'STUDENT' };

const MY_POSITIONS = [makeMyPosition(), makeMyPosition({ id: 'p-van', subject: 'Ngữ văn' })];

function makeItem(order, title, overrides = {}) {
  return { order, week: 1, periodLabel: String(order), title, periodCount: 1, requirement: '', ...overrides };
}

const VAN_POSITION = { _id: 'p-van', classId: 'class-1', className: '11A4', subject: 'Ngữ văn' };

function makeVanLog(overrides = {}) {
  return makeWeekLog({
    _id: 'w-van',
    positionId: 'p-van',
    ppctItemId: 'i-van',
    position: VAN_POSITION,
    ppctItem: makeItem(1, 'Bài Văn 1'),
    date: '2026-01-12T00:00:00.000Z',
    ...overrides,
  });
}

const TOAN_MON = makeWeekLog({ _id: 'w-toan-1', date: '2026-01-12T00:00:00.000Z' });
const VAN_MON = makeVanLog();
const TOAN_THU = makeWeekLog({
  _id: 'w-toan-2',
  ppctItemId: 'i2',
  date: '2026-01-15T00:00:00.000Z',
  ppctItem: makeItem(2, 'Bài 2'),
});
const WEEK_LOGS = [TOAN_MON, VAN_MON, TOAN_THU];

function queryResult(data, extra = {}) {
  return { data, currentData: data, isLoading: false, isFetching: false, isError: false, error: undefined, ...extra };
}

function renderPage({ user = TEACHER } = {}) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { user, accessToken: user ? 'token' : null } },
  });
  const makeTree = () => (
    <Provider store={store}>
      <WeeklyLessonLogsPage />
    </Provider>
  );
  const utils = render(makeTree());
  const column = (date) => utils.container.querySelector(`[data-column="${date}"]`);
  const card = (logId) => utils.container.querySelector(`[data-log-id="${logId}"]`);
  return { ...utils, column, card, rerenderPage: () => utils.rerender(makeTree()) };
}

const lastWeekArgs = () => getWeekLogsMock.mock.calls.at(-1)[0];
const lastWeekOptions = () => getWeekLogsMock.mock.calls.at(-1)[1];

function rejectUpdateWith(status, message) {
  updateLessonLogMock.mockReturnValue({ unwrap: () => Promise.reject({ status, data: { message } }) });
}

function freezeClockAt(isoString) {
  jest.useFakeTimers({
    now: new Date(isoString),
    // Chỉ giả Date: giữ nguyên mọi bộ hẹn giờ để React và userEvent chạy bình thường.
    doNotFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'clearImmediate',
      'nextTick',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'performance',
      'hrtime',
    ],
  });
}

const EMPTY_WEEK_MESSAGE = 'Tuần này không có buổi học nào. Kiểm tra PPCT và thời khóa biểu của các môn.';

beforeEach(() => {
  getWeekLogsMock.mockReset();
  getMyPositionsMock.mockReset();
  updateLessonLogMock.mockReset();
  todayMock.mockReset();

  todayMock.mockReturnValue('2026-01-14');
  getMyPositionsMock.mockReturnValue(queryResult(MY_POSITIONS));
  getWeekLogsMock.mockReturnValue(queryResult(WEEK_LOGS));
  updateLessonLogMock.mockReturnValue({ unwrap: () => Promise.resolve({}) });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('tuần hiển thị', () => {
  test('(a) hôm nay là Chủ nhật 18/01 → tải tuần của Thứ Hai 12/01; "Tuần sau" → 19/01', async () => {
    todayMock.mockReturnValue('2026-01-18');
    renderPage();

    expect(lastWeekArgs()).toEqual({ weekStart: '2026-01-12' });
    expect(lastWeekOptions()).toEqual({ skip: false });
    expect(screen.getByText('12/01/2026 – 18/01/2026')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));

    expect(lastWeekArgs()).toEqual({ weekStart: '2026-01-19' });
  });

  test('00:30 sáng Thứ Hai giờ VN (17:30Z Chủ nhật theo UTC) đã là tuần 19/01 — toISOString() sẽ lùi về tuần 12/01', () => {
    freezeClockAt('2026-01-18T17:30:00.000Z');
    todayMock.mockImplementation(() => jest.requireActual('@/lib/utils').todayDateOnly());
    renderPage();

    expect(lastWeekArgs()).toEqual({ weekStart: '2026-01-19' });
  });

  test('23:30 Chủ nhật giờ VN (16:30Z) vẫn là tuần 12/01', () => {
    freezeClockAt('2026-01-18T16:30:00.000Z');
    todayMock.mockImplementation(() => jest.requireActual('@/lib/utils').todayDateOnly());
    renderPage();

    expect(lastWeekArgs()).toEqual({ weekStart: '2026-01-12' });
  });

  test('bộ lọc Tháng chuyển sang tuần chứa Thứ Năm đầu tiên của tháng đó', async () => {
    renderPage();

    await userEvent.selectOptions(screen.getByLabelText('Tháng'), '2');

    expect(lastWeekArgs()).toEqual({ weekStart: '2026-02-02' });
  });

  test('cột hôm nay được nhấn mạnh', () => {
    const { column } = renderPage();

    expect(column('2026-01-14')).toHaveClass('bg-brand-soft');
    expect(screen.getByRole('heading', { name: 'Thứ 4 14/01' })).toHaveAttribute('aria-current', 'date');
  });
});

describe('thẻ buổi học và bộ lọc lớp/môn', () => {
  test('(b) mỗi buổi nằm đúng cột ngày và có "{lớp} · {môn}"', () => {
    const { column } = renderPage();

    const monday = column('2026-01-12');
    expect(within(monday).getByText('Bài 1')).toBeInTheDocument();
    expect(within(monday).getByText('Bài Văn 1')).toBeInTheDocument();
    expect(within(monday).getByText('11A4 · Toán')).toBeInTheDocument();
    expect(within(monday).getByText('11A4 · Ngữ văn')).toBeInTheDocument();

    const thursday = column('2026-01-15');
    expect(within(thursday).getByText('Bài 2')).toBeInTheDocument();
    expect(within(thursday).getByText('11A4 · Toán')).toBeInTheDocument();
  });

  test('(b) chọn "11A4 — Ngữ văn" → chỉ còn thẻ Văn, lọc phía client nên KHÔNG đổi tham số query', async () => {
    const { card } = renderPage();

    const select = screen.getByLabelText('Lớp/môn');
    const options = within(select).getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Tất cả các lớp', '11A4 — Toán', '11A4 — Ngữ văn']);

    await userEvent.selectOptions(select, 'p-van');

    expect(card('w-van')).not.toBeNull();
    expect(card('w-toan-1')).toBeNull();
    expect(card('w-toan-2')).toBeNull();
    expect(getWeekLogsMock.mock.calls.every(([args]) => args.weekStart === '2026-01-12')).toBe(true);

    await userEvent.selectOptions(select, '');
    expect(card('w-toan-1')).not.toBeNull();
    expect(card('w-van')).not.toBeNull();
  });

  test('chỉ giữ một môn thì không có bộ lọc để chọn', () => {
    getMyPositionsMock.mockReturnValue(queryResult([makeMyPosition()]));
    renderPage();

    expect(screen.queryByLabelText('Lớp/môn')).not.toBeInTheDocument();
    expect(screen.getByText('Bài 1')).toBeInTheDocument();
  });

  test('vị trí chủ nhiệm (HOMEROOM) không có trong bộ lọc', () => {
    getMyPositionsMock.mockReturnValue(
      queryResult([...MY_POSITIONS, makeMyPosition({ id: 'p-hr', type: 'HOMEROOM', subject: undefined })]),
    );
    renderPage();

    const options = within(screen.getByLabelText('Lớp/môn')).getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Tất cả các lớp', '11A4 — Toán', '11A4 — Ngữ văn']);
  });

  test('môn đang lọc không còn trong danh sách môn của giáo viên → quay về hiện tất cả', async () => {
    const { card, rerenderPage } = renderPage();
    await userEvent.selectOptions(screen.getByLabelText('Lớp/môn'), 'p-van');
    expect(card('w-toan-1')).toBeNull();

    getMyPositionsMock.mockReturnValue(queryResult([makeMyPosition(), makeMyPosition({ id: 'p-ly', subject: 'Vật lý' })]));
    rerenderPage();

    expect(card('w-toan-1')).not.toBeNull();
    expect(screen.getByLabelText('Lớp/môn')).toHaveValue('');
  });

  test('(f) buổi rơi vào Chủ nhật vẫn hiển thị (không bị nuốt)', () => {
    getWeekLogsMock.mockReturnValue(queryResult([makeWeekLog({ _id: 'w-sun', date: '2026-01-18T00:00:00.000Z' })]));
    const { column } = renderPage();

    expect(screen.getByRole('heading', { name: 'Chủ nhật 18/01' })).toBeInTheDocument();
    expect(column('2026-01-18').querySelector('[data-log-id="w-sun"]')).not.toBeNull();
  });

  test('ngày dạng ISO cuối ngày UTC (23:30Z) vẫn vào đúng cột ngày — getter giờ địa phương UTC+7 sẽ đẩy sang hôm sau', () => {
    getWeekLogsMock.mockReturnValue(queryResult([makeWeekLog({ _id: 'w-late', date: '2026-01-12T23:30:00.000Z' })]));
    const { column } = renderPage();

    expect(column('2026-01-12').querySelector('[data-log-id="w-late"]')).not.toBeNull();
    expect(column('2026-01-13').querySelector('[data-log-id="w-late"]')).toBeNull();
  });
});

describe('tích, kéo-thả và chuyển ngày', () => {
  test('(c) tích dùng positionId của CHÍNH buổi đó: buổi Văn → p-van, buổi Toán → p-toan', async () => {
    const { card } = renderPage();

    await userEvent.click(within(card('w-van')).getByRole('checkbox', { name: 'Đã thực hiện: Bài Văn 1' }));
    expect(updateLessonLogMock).toHaveBeenLastCalledWith({ positionId: 'p-van', logId: 'w-van', done: true });

    await userEvent.click(within(card('w-toan-1')).getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' }));
    expect(updateLessonLogMock).toHaveBeenLastCalledWith({ positionId: 'p-toan', logId: 'w-toan-1', done: true });
  });

  test('(c) thả thẻ Văn sang cột 15/01 → updateLessonLog với positionId của buổi đó và date mới; thành công → thông báo', async () => {
    const { card, column } = renderPage();

    fireEvent.dragStart(card('w-van'));
    fireEvent.drop(column('2026-01-15'));

    expect(updateLessonLogMock).toHaveBeenCalledTimes(1);
    expect(updateLessonLogMock).toHaveBeenCalledWith({ positionId: 'p-van', logId: 'w-van', date: '2026-01-15' });
    expect(
      await screen.findByText(
        'Đã chuyển buổi học sang ngày 15/01/2026. Các buổi chưa chốt của môn đã được xếp lại.',
      ),
    ).toBeInTheDocument();
  });

  test('(c) thả vào ngày không có tiết (400) → banner nguyên văn, thẻ vẫn ở cột cũ', async () => {
    rejectUpdateWith(400, 'Ngày này không có tiết của môn');
    const { card, column } = renderPage();

    fireEvent.dragStart(card('w-van'));
    fireEvent.drop(column('2026-01-16'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ngày này không có tiết của môn');
    expect(column('2026-01-12').querySelector('[data-log-id="w-van"]')).not.toBeNull();
    expect(column('2026-01-16').querySelector('[data-log-id="w-van"]')).toBeNull();
  });

  test('thả vào chính ngày cũ → không gọi API', () => {
    const { card, column } = renderPage();

    fireEvent.dragStart(card('w-van'));
    fireEvent.drop(column('2026-01-12'));

    expect(updateLessonLogMock).not.toHaveBeenCalled();
  });

  test('thẻ nào cũng sửa được (endpoint chỉ trả vị trí mình giữ): có checkbox, "Chuyển ngày" và kéo được; có gợi ý kéo-thả', () => {
    const { card } = renderPage();

    for (const logId of ['w-toan-1', 'w-van', 'w-toan-2']) {
      expect(within(card(logId)).getByRole('checkbox')).toBeInTheDocument();
      expect(within(card(logId)).getByRole('button', { name: 'Chuyển ngày' })).toBeInTheDocument();
      expect(card(logId)).toHaveAttribute('draggable', 'true');
    }
    expect(screen.getByText(/Kéo thả thẻ sang ngày khác/)).toBeInTheDocument();
  });

  test('"Chuyển ngày" mở hộp thoại cho đúng buổi (có lớp-môn); chọn 22/01 → payload dùng positionId của buổi; thành công → thông báo', async () => {
    const { card } = renderPage();

    await userEvent.click(within(card('w-van')).getByRole('button', { name: 'Chuyển ngày' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Bài Văn 1')).toBeInTheDocument();
    expect(within(dialog).getByText('11A4 · Ngữ văn')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Ngày mới')).toHaveValue('2026-01-12');

    fireEvent.change(within(dialog).getByLabelText('Ngày mới'), { target: { value: '2026-01-22' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Chuyển' }));

    expect(updateLessonLogMock).toHaveBeenCalledWith({ positionId: 'p-van', logId: 'w-van', date: '2026-01-22' });
    expect(
      await screen.findByText(
        'Đã chuyển buổi học sang ngày 22/01/2026. Các buổi chưa chốt của môn đã được xếp lại.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('chuyển ngày bị 409 → message nguyên văn trong hộp thoại (một lần), hộp thoại giữ, bảng không đổi', async () => {
    rejectUpdateWith(409, 'Ngày này đã có buổi học khác, không thể chuyển vào');
    const { card, column } = renderPage();
    await userEvent.click(within(card('w-van')).getByRole('button', { name: 'Chuyển ngày' }));
    const dialog = screen.getByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText('Ngày mới'), { target: { value: '2026-01-15' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Chuyển' }));

    expect(
      await within(screen.getByRole('dialog')).findByText('Ngày này đã có buổi học khác, không thể chuyển vào'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Ngày này đã có buổi học khác, không thể chuyển vào')).toHaveLength(1);
    expect(column('2026-01-12').querySelector('[data-log-id="w-van"]')).not.toBeNull();
  });

  test('ô ngày để trống thì không gửi; bấm đúp "Chuyển" khi backend chưa trả lời chỉ gửi 1 lần', async () => {
    updateLessonLogMock.mockReturnValue({ unwrap: () => new Promise(() => {}) });
    const { card } = renderPage();
    await userEvent.click(within(card('w-van')).getByRole('button', { name: 'Chuyển ngày' }));
    const dialog = screen.getByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText('Ngày mới'), { target: { value: '' } });
    expect(within(dialog).getByRole('button', { name: 'Chuyển' })).toBeDisabled();
    expect(updateLessonLogMock).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText('Ngày mới'), { target: { value: '2026-01-22' } });
    await userEvent.dblClick(within(dialog).getByRole('button', { name: 'Chuyển' }));

    expect(updateLessonLogMock).toHaveBeenCalledTimes(1);
  });

  test('đổi tuần xóa thông báo/lỗi của thao tác trước', async () => {
    rejectUpdateWith(400, 'Ngày này không có tiết của môn');
    const { card, column } = renderPage();
    fireEvent.dragStart(card('w-van'));
    fireEvent.drop(column('2026-01-16'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('lưu xong mà danh sách đang tải lại: checkbox giữ trạng thái đã tích, tải xong thì theo dữ liệu', async () => {
    let isRefetching = false;
    let refetchStartedAt;
    getWeekLogsMock.mockImplementation(() => queryResult(WEEK_LOGS, { isFetching: isRefetching, startedTimeStamp: refetchStartedAt }));
    updateLessonLogMock.mockImplementation(() => ({
      unwrap: () => {
        isRefetching = true;
        refetchStartedAt = Date.now();
        return Promise.resolve({});
      },
    }));
    const { card, rerenderPage } = renderPage();

    await userEvent.click(within(card('w-van')).getByRole('checkbox'));
    expect(within(card('w-van')).getByRole('checkbox')).toBeChecked();

    isRefetching = false;
    rerenderPage();
    expect(within(card('w-van')).getByRole('checkbox')).not.toBeChecked();
  });
});

describe('quyền xem (Review Focus 2)', () => {
  test.each([
    ['ADMIN', ADMIN],
    ['STUDENT', STUDENT],
  ])(
    '(d) %s vào thẳng URL → câu giải thích, KHÔNG gọi query nào',
    (_label, user) => {
      renderPage({ user });

      expect(
        screen.getByText(
          'Sổ báo giảng tổng hợp chỉ dành cho giáo viên. Quản trị viên xem sổ báo giảng từng môn ở trang chi tiết lớp.',
        ),
      ).toBeInTheDocument();
      expect(getWeekLogsMock).not.toHaveBeenCalled();
      expect(getMyPositionsMock).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Tuần sau' })).not.toBeInTheDocument();
    },
  );

  test('ADMIN: link dẫn tới Quản lý giáo viên (/lop-hoc của ADMIN là ngõ cụt vì không giữ vị trí nào)', () => {
    renderPage({ user: ADMIN });

    expect(screen.getByRole('link', { name: 'Đến quản lý giáo viên' })).toHaveAttribute('href', '/quan-ly-giao-vien');
    expect(screen.queryByRole('link', { name: 'Đến danh sách lớp' })).not.toBeInTheDocument();
  });

  test('STUDENT: không có link nào tới khu vực giáo viên', () => {
    renderPage({ user: STUDENT });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  test('phiên chưa khôi phục xong (user null) → "Đang tải...", không gọi query và không hiện từ chối', () => {
    renderPage({ user: null });

    expect(screen.getByText('Đang tải...')).toBeInTheDocument();
    expect(screen.queryByText(/chỉ dành cho giáo viên/)).not.toBeInTheDocument();
    expect(getWeekLogsMock).not.toHaveBeenCalled();
    expect(getMyPositionsMock).not.toHaveBeenCalled();
  });
});

describe('trạng thái rỗng và lỗi', () => {
  test('(e) giáo viên chưa giữ môn nào → "Bạn chưa giữ môn nào" + link tham gia lớp, không gọi query tuần', () => {
    getMyPositionsMock.mockReturnValue(queryResult([]));
    renderPage();

    expect(screen.getByText('Bạn chưa giữ môn nào')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tham gia bằng mã lớp' })).toHaveAttribute('href', '/lop-hoc/tham-gia');
    expect(screen.queryByRole('button', { name: 'Tuần sau' })).not.toBeInTheDocument();
    expect(lastWeekOptions()).toEqual({ skip: true });
  });

  test('chỉ giữ vị trí chủ nhiệm (không có môn SUBJECT) cũng là "chưa giữ môn nào"', () => {
    getMyPositionsMock.mockReturnValue(
      queryResult([makeMyPosition({ id: 'p-hr', type: 'HOMEROOM', subject: undefined })]),
    );
    renderPage();

    expect(screen.getByText('Bạn chưa giữ môn nào')).toBeInTheDocument();
  });

  test('(e) có môn nhưng tuần không có buổi nào → câu giải thích đúng chữ (bảng vẫn có các cột ngày)', () => {
    getWeekLogsMock.mockReturnValue(queryResult([]));
    const { container } = renderPage();

    expect(screen.getByText(EMPTY_WEEK_MESSAGE)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-column]')).toHaveLength(6);
    expect(screen.queryByText('Bạn chưa giữ môn nào')).not.toBeInTheDocument();
  });

  test('lọc ra môn không có buổi nào trong tuần → cũng báo tuần không có buổi học', async () => {
    getWeekLogsMock.mockReturnValue(queryResult([TOAN_MON]));
    renderPage();
    expect(screen.queryByText(EMPTY_WEEK_MESSAGE)).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Lớp/môn'), 'p-van');

    expect(screen.getByText(EMPTY_WEEK_MESSAGE)).toBeInTheDocument();
  });

  test('(e) lỗi tải 403 của guard → câu tiếng Việt cố định, không hiện bảng', () => {
    getWeekLogsMock.mockReturnValue(
      queryResult(undefined, { isError: true, error: { status: 403, data: { message: 'Forbidden resource' } } }),
    );
    const { container } = renderPage();

    expect(screen.getByText('Bạn không có quyền thực hiện thao tác này')).toBeInTheDocument();
    expect(container.querySelector('[data-column]')).toBeNull();
  });

  test('lỗi tải 400 hiện nguyên văn; lỗi mạng hiện câu dự phòng tiếng Việt', () => {
    getWeekLogsMock.mockReturnValue(
      queryResult(undefined, {
        isError: true,
        error: { status: 400, data: { message: 'Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd' } },
      }),
    );
    const badRequest = renderPage();
    expect(screen.getByText('Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd')).toBeInTheDocument();
    badRequest.unmount();

    getWeekLogsMock.mockReturnValue(
      queryResult(undefined, { isError: true, error: { status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' } }),
    );
    renderPage();
    expect(screen.getByText('Không tải được sổ báo giảng, vui lòng thử lại')).toBeInTheDocument();
  });

  test('đang tải danh sách môn → "Đang tải...", chưa hiện câu "chưa giữ môn nào"', () => {
    getMyPositionsMock.mockReturnValue(queryResult(undefined, { isLoading: true, isFetching: true }));
    renderPage();

    expect(screen.getByText('Đang tải...')).toBeInTheDocument();
    expect(screen.queryByText('Bạn chưa giữ môn nào')).not.toBeInTheDocument();
  });

  test('lỗi tải danh sách môn → hiện lỗi, không hiện bảng', () => {
    getMyPositionsMock.mockReturnValue(
      queryResult(undefined, { isError: true, error: { status: 500, data: { message: 'Đã có lỗi xảy ra, vui lòng thử lại sau' } } }),
    );
    const { container } = renderPage();

    expect(screen.getByText('Đã có lỗi xảy ra, vui lòng thử lại sau')).toBeInTheDocument();
    expect(container.querySelector('[data-column]')).toBeNull();
  });

  test('đang tải buổi học lần đầu → "Đang tải...", chưa hiện câu rỗng hay cột nào', () => {
    getWeekLogsMock.mockReturnValue(queryResult(undefined, { isLoading: true, isFetching: true }));
    const { container } = renderPage();

    expect(screen.getByText('Đang tải...')).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_WEEK_MESSAGE)).not.toBeInTheDocument();
    expect(container.querySelector('[data-column]')).toBeNull();
  });

  test('vừa đổi tuần: buổi của tuần trước (data) KHÔNG được đặt vào cột của tuần mới trong lúc tải', () => {
    getWeekLogsMock.mockReturnValue({
      data: WEEK_LOGS,
      currentData: undefined,
      isLoading: false,
      isFetching: true,
      isError: false,
      error: undefined,
    });
    const { container } = renderPage();

    expect(screen.getByText('Đang tải...')).toBeInTheDocument();
    expect(screen.queryByText('Bài 1')).not.toBeInTheDocument();
    expect(screen.queryByText(EMPTY_WEEK_MESSAGE)).not.toBeInTheDocument();
    expect(container.querySelector('[data-column]')).toBeNull();
  });

  test('đang tải lại sau khi ghi (currentData còn) → bảng giữ nguyên, không chớp "Đang tải..."', () => {
    getWeekLogsMock.mockReturnValue(queryResult(WEEK_LOGS, { isFetching: true }));
    renderPage();

    expect(screen.getByText('Bài 1')).toBeInTheDocument();
    expect(screen.queryByText('Đang tải...')).not.toBeInTheDocument();
  });
});
