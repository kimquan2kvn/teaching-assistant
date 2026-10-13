import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/lib/store/auth-slice';
import { CLASS_DETAIL, makeLessonLog } from '@/lib/test-fixtures/phase3';
import LessonLogsPage from './page';

const getClassDetailMock = jest.fn();
jest.mock('@/lib/store/classes-api', () => ({
  ...jest.requireActual('@/lib/store/classes-api'),
  useGetClassDetailQuery: (...args) => getClassDetailMock(...args),
}));

const getLogsMock = jest.fn();
const updateLessonLogMock = jest.fn();
jest.mock('@/lib/store/lesson-logs-api', () => ({
  ...jest.requireActual('@/lib/store/lesson-logs-api'),
  useGetPositionLessonLogsQuery: (...args) => getLogsMock(...args),
  useUpdateLessonLogMutation: () => [updateLessonLogMock, { isLoading: false }],
}));

const todayMock = jest.fn();
jest.mock('@/lib/utils', () => ({
  ...jest.requireActual('@/lib/utils'),
  todayDateOnly: () => todayMock(),
}));

// Mốc đã kiểm: 2026-01-05 và 2026-01-12 là Thứ Hai; 2026-01-11 và 2026-01-18 là Chủ Nhật.
const GVBM_TOAN = { id: 'u-toan', role: 'TEACHER' };
const GVBM_VAN = { id: 'u-van', role: 'TEACHER' };
const GVCN = { id: 'u-gvcn', role: 'TEACHER' };
const ADMIN = { id: 'u-admin', role: 'ADMIN' };
const OUTSIDER = { id: 'u-khac', role: 'TEACHER' };

function makeItem(order, title, overrides = {}) {
  return { order, week: 1, periodLabel: String(order), title, periodCount: 1, requirement: '', ...overrides };
}

const LOG_MON = makeLessonLog({ _id: 'l1', date: '2026-01-12T00:00:00.000Z' });
const LOG_WED = makeLessonLog({
  _id: 'l2',
  ppctItemId: 'i2',
  date: '2026-01-14T00:00:00.000Z',
  ppctItem: makeItem(2, 'Bài 2', { periodLabel: 'TC1', periodCount: 2 }),
});
const WEEK_LOGS = [LOG_MON, LOG_WED];

const ALL_LOGS = [
  makeLessonLog({ _id: 'a1', date: '2026-01-05T00:00:00.000Z', ppctItem: makeItem(1, 'Bài 1') }),
  makeLessonLog({ _id: 'a2', date: '2026-01-11T00:00:00.000Z', ppctItem: makeItem(2, 'Bài 2') }),
  makeLessonLog({ _id: 'a3', date: '2026-01-12T00:00:00.000Z', ppctItem: makeItem(3, 'Bài 3') }),
];

// Hình dạng kết quả của hook query RTK Query: currentData là dữ liệu của ĐÚNG tham số hiện tại (undefined khi vừa đổi
// tuần và đang tải), data là kết quả gần nhất của bất kỳ tham số nào.
function queryResult(data, extra = {}) {
  return { data, currentData: data, isLoading: false, isFetching: false, isError: false, error: undefined, ...extra };
}

function renderPage({ user = GVBM_TOAN, params = { classId: 'class-1' }, searchParams = {} } = {}) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { user, accessToken: 'token' } },
  });
  // Mỗi lần trả một element mới để rerender thật sự chạy lại trang (element y hệt sẽ bị React bỏ qua).
  const makeTree = () => (
    <Provider store={store}>
      <LessonLogsPage params={params} searchParams={searchParams} />
    </Provider>
  );
  const utils = render(makeTree());
  const column = (date) => utils.container.querySelector(`[data-column="${date}"]`);
  const card = (logId) => utils.container.querySelector(`[data-log-id="${logId}"]`);
  return { ...utils, column, card, rerenderPage: () => utils.rerender(makeTree()) };
}

const lastLogsArgs = () => getLogsMock.mock.calls.at(-1)[0];
const lastLogsOptions = () => getLogsMock.mock.calls.at(-1)[1];

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

beforeEach(() => {
  getClassDetailMock.mockReset();
  getLogsMock.mockReset();
  updateLessonLogMock.mockReset();
  todayMock.mockReset();

  todayMock.mockReturnValue('2026-01-14');
  getClassDetailMock.mockReturnValue(queryResult(CLASS_DETAIL));
  getLogsMock.mockReturnValue(queryResult(WEEK_LOGS));
  updateLessonLogMock.mockReturnValue({ unwrap: () => Promise.resolve({}) });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('chế độ "Theo tuần"', () => {
  test('(a) GVBM Toán: tải đúng khoảng Thứ Hai–Chủ Nhật của tuần chứa hôm nay; tích checkbox gọi updateLessonLog đúng payload', async () => {
    renderPage();

    expect(lastLogsArgs()).toEqual({ positionId: 'p-toan', from: '2026-01-12', to: '2026-01-18' });
    expect(lastLogsOptions()).toEqual({ skip: false });
    expect(screen.getByText('12/01/2026 – 18/01/2026')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' }));

    expect(updateLessonLogMock).toHaveBeenCalledTimes(1);
    expect(updateLessonLogMock).toHaveBeenCalledWith({ positionId: 'p-toan', logId: 'l1', done: true });
  });

  test('mỗi buổi nằm đúng cột ngày; GVBM sửa được nên thẻ kéo được và có gợi ý kéo-thả', () => {
    const { column, card } = renderPage();

    expect(within(column('2026-01-12')).getByText('Bài 1')).toBeInTheDocument();
    expect(within(column('2026-01-14')).getByText('Bài 2')).toBeInTheDocument();
    expect(card('l1')).toHaveAttribute('draggable', 'true');
    expect(screen.getByText(/Kéo thả thẻ sang ngày khác/)).toBeInTheDocument();
  });

  test('"Tuần sau" tải tuần kế tiếp; bộ lọc Tháng chuyển sang tuần chứa Thứ Năm đầu tiên của tháng đó', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));
    expect(lastLogsArgs()).toEqual({ positionId: 'p-toan', from: '2026-01-19', to: '2026-01-25' });

    await userEvent.selectOptions(screen.getByLabelText('Tháng'), '2');
    expect(lastLogsArgs()).toEqual({ positionId: 'p-toan', from: '2026-02-02', to: '2026-02-08' });
  });

  test('buổi rơi vào Chủ nhật vẫn hiển thị (không bị nuốt)', () => {
    getLogsMock.mockReturnValue(
      queryResult([makeLessonLog({ _id: 'sun', date: '2026-01-18T00:00:00.000Z' })]),
    );
    const { column } = renderPage();

    expect(screen.getByRole('heading', { name: 'Chủ nhật 18/01' })).toBeInTheDocument();
    expect(column('2026-01-18').querySelector('[data-log-id="sun"]')).not.toBeNull();
  });

  test('(e) tuần rỗng → câu theo tuần (không bảo nhập PPCT/TKB khi chỉ là tuần nghỉ)', () => {
    getLogsMock.mockReturnValue(queryResult([]));
    renderPage();

    expect(
      screen.getByText('Tuần này không có buổi học nào. Kiểm tra PPCT và thời khóa biểu của môn nếu bạn mong đợi có buổi.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Chưa có buổi báo giảng nào/)).not.toBeInTheDocument();
  });
});

describe('mở trang đúng tuần (Review Focus 1)', () => {
  test('hôm nay là Chủ nhật 18/01 → tuần của Thứ Hai 12/01, không phải tuần sau', () => {
    todayMock.mockReturnValue('2026-01-18');
    renderPage();

    expect(lastLogsArgs()).toEqual({ positionId: 'p-toan', from: '2026-01-12', to: '2026-01-18' });
  });

  test('23:30 Chủ nhật giờ VN (16:30Z) vẫn là tuần 12/01', () => {
    freezeClockAt('2026-01-18T16:30:00.000Z');
    todayMock.mockImplementation(() => jest.requireActual('@/lib/utils').todayDateOnly());
    renderPage();

    expect(lastLogsArgs()).toEqual({ positionId: 'p-toan', from: '2026-01-12', to: '2026-01-18' });
  });

  test('00:30 sáng Thứ Hai giờ VN (17:30Z Chủ nhật theo UTC) đã là tuần 19/01 — toISOString() sẽ lùi về tuần 12/01', () => {
    freezeClockAt('2026-01-18T17:30:00.000Z');
    todayMock.mockImplementation(() => jest.requireActual('@/lib/utils').todayDateOnly());
    renderPage();

    expect(lastLogsArgs()).toEqual({ positionId: 'p-toan', from: '2026-01-19', to: '2026-01-25' });
  });

  test('cột hôm nay được nhấn mạnh trong tuần đang xem', () => {
    const { column } = renderPage();

    expect(column('2026-01-14')).toHaveClass('bg-brand-soft');
    expect(screen.getByRole('heading', { name: 'Thứ 4 14/01' })).toHaveAttribute('aria-current', 'date');
  });
});

describe('chế độ "Toàn bộ"', () => {
  test('(b) gọi query không có from/to, nhóm theo tuần, mỗi thẻ có ngày + thứ, không kéo-thả, WeekNav ẩn', async () => {
    getLogsMock.mockReturnValue(queryResult(ALL_LOGS));
    const { container } = renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Toàn bộ' }));

    expect(lastLogsArgs()).toEqual({ positionId: 'p-toan' });
    expect(lastLogsArgs()).not.toHaveProperty('from');
    expect(lastLogsArgs()).not.toHaveProperty('to');

    const firstWeek = screen.getByRole('heading', { name: 'Tuần 05/01/2026 – 11/01/2026' }).closest('section');
    const secondWeek = screen.getByRole('heading', { name: 'Tuần 12/01/2026 – 18/01/2026' }).closest('section');
    expect(within(firstWeek).getByText('Thứ 2, 05/01/2026')).toBeInTheDocument();
    // Chủ nhật 11/01 thuộc tuần của Thứ Hai 05/01 (không bị đẩy sang tuần sau).
    expect(within(firstWeek).getByText('Chủ nhật, 11/01/2026')).toBeInTheDocument();
    expect(within(firstWeek).getByText('Bài 2')).toBeInTheDocument();
    expect(within(secondWeek).getByText('Thứ 2, 12/01/2026')).toBeInTheDocument();
    expect(within(secondWeek).getByText('Bài 3')).toBeInTheDocument();

    expect(container.querySelector('[draggable]')).toBeNull();
    expect(container.querySelector('[data-column]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tuần sau' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Kéo thả thẻ/)).not.toBeInTheDocument();
  });

  test('người sửa được vẫn tích và "Chuyển ngày" được ở chế độ danh sách', async () => {
    getLogsMock.mockReturnValue(queryResult(ALL_LOGS));
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Toàn bộ' }));

    expect(screen.getAllByRole('button', { name: 'Chuyển ngày' })).toHaveLength(3);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 3' }));

    expect(updateLessonLogMock).toHaveBeenCalledWith({ positionId: 'p-toan', logId: 'a3', done: true });
  });

  test('rỗng → cùng câu giải thích, không có tiêu đề tuần nào', async () => {
    getLogsMock.mockReturnValue(queryResult([]));
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Toàn bộ' }));

    expect(screen.getByText(/Chưa có buổi báo giảng nào/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Tuần / })).not.toBeInTheDocument();
  });

  test('nút chế độ báo trạng thái đang chọn bằng aria-pressed và quay lại "Theo tuần" được', async () => {
    renderPage();
    const weekButton = screen.getByRole('button', { name: 'Theo tuần' });
    const allButton = screen.getByRole('button', { name: 'Toàn bộ' });
    expect(weekButton).toHaveAttribute('aria-pressed', 'true');
    expect(allButton).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(allButton);
    expect(allButton).toHaveAttribute('aria-pressed', 'true');
    expect(weekButton).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(weekButton);
    expect(lastLogsArgs()).toEqual({ positionId: 'p-toan', from: '2026-01-12', to: '2026-01-18' });
  });
});

describe('quyền xem (Review Focus 2)', () => {
  test('(c) GVCN xem môn Toán của người khác: thấy bảng nhưng không checkbox, không "Chuyển ngày", thẻ không kéo được, không gợi ý kéo-thả', () => {
    const { container } = renderPage({ user: GVCN });

    expect(lastLogsArgs().positionId).toBe('p-toan');
    expect(screen.getByText('Bài 1')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chuyển ngày' })).not.toBeInTheDocument();
    expect(container.querySelector('[draggable]')).toBeNull();
    expect(screen.queryByText(/Kéo thả thẻ/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Chưa thực hiện')).toHaveLength(2);
  });

  test('GVCN có bộ chọn đủ 3 môn (không có vị trí chủ nhiệm); chọn môn khác thì tải đúng môn đó', async () => {
    renderPage({ user: GVCN });

    const select = screen.getByLabelText('Môn');
    const options = within(select).getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Toán', 'Ngữ văn', 'Vật lý']);

    await userEvent.selectOptions(select, 'p-ly');
    expect(lastLogsArgs().positionId).toBe('p-ly');
  });

  test('(d) GVBM Văn chỉ thấy môn Ngữ văn: không bộ chọn, không có Toán; chỉ tải p-van và không bao giờ tải p-toan', () => {
    renderPage({ user: GVBM_VAN });

    expect(screen.getByText('Ngữ văn')).toBeInTheDocument();
    expect(screen.queryByText('Toán')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Môn')).not.toBeInTheDocument();
    expect(getLogsMock.mock.calls.every(([args]) => args.positionId === 'p-van')).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' })).toBeInTheDocument();
  });

  test('ADMIN sửa được vị trí bất kỳ kể cả môn đang trống người giữ', async () => {
    renderPage({ user: ADMIN });
    expect(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Môn'), 'p-ly');

    expect(lastLogsArgs().positionId).toBe('p-ly');
    expect(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' })).toBeInTheDocument();
  });

  test('searchParams.positionId chọn sẵn môn; positionId không hợp lệ rơi về mặc định', () => {
    const preselected = renderPage({ user: GVCN, searchParams: { positionId: 'p-van' } });
    expect(lastLogsArgs().positionId).toBe('p-van');
    expect(screen.getByLabelText('Môn')).toHaveValue('p-van');
    preselected.unmount();

    renderPage({ user: GVCN, searchParams: { positionId: 'p-khong-co' } });
    expect(lastLogsArgs().positionId).toBe('p-toan');
  });

  test('không giữ môn nào trong lớp → "Bạn chưa giữ môn nào trong lớp này", không tải buổi học', () => {
    renderPage({ user: OUTSIDER });

    expect(screen.getByText('Bạn chưa giữ môn nào trong lớp này')).toBeInTheDocument();
    expect(getLogsMock.mock.calls.every(([, options]) => options.skip === true)).toBe(true);
  });
});

describe('chuyển ngày bằng hộp thoại', () => {
  async function openMoveDialog(card, logId) {
    await userEvent.click(within(card(logId)).getByRole('button', { name: 'Chuyển ngày' }));
    return screen.getByRole('dialog');
  }

  test('(f) chọn 22/01 → gọi đúng payload; thành công → thông báo, đóng hộp thoại', async () => {
    const { card } = renderPage();
    const dialog = await openMoveDialog(card, 'l1');
    expect(within(dialog).getByLabelText('Ngày mới')).toHaveValue('2026-01-12');

    fireEvent.change(within(dialog).getByLabelText('Ngày mới'), { target: { value: '2026-01-22' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Chuyển' }));

    expect(updateLessonLogMock).toHaveBeenCalledTimes(1);
    expect(updateLessonLogMock).toHaveBeenCalledWith({ positionId: 'p-toan', logId: 'l1', date: '2026-01-22' });
    expect(
      await screen.findByText(
        'Đã chuyển buổi học sang ngày 22/01/2026. Các buổi chưa chốt của môn đã được xếp lại.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('(f) 409 → message nguyên văn trong hộp thoại (chỉ hiện một lần), hộp thoại giữ, bảng không đổi, không có thông báo thành công', async () => {
    rejectUpdateWith(409, 'Ngày này đã có buổi học khác, không thể chuyển vào');
    const { card, column } = renderPage();
    const dialog = await openMoveDialog(card, 'l1');

    fireEvent.change(within(dialog).getByLabelText('Ngày mới'), { target: { value: '2026-01-14' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Chuyển' }));

    expect(
      await within(screen.getByRole('dialog')).findByText('Ngày này đã có buổi học khác, không thể chuyển vào'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Ngày này đã có buổi học khác, không thể chuyển vào')).toHaveLength(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(column('2026-01-12')).getByText('Bài 1')).toBeInTheDocument();
    expect(column('2026-01-14').querySelector('[data-log-id="l1"]')).toBeNull();
    expect(screen.queryByText(/Đã chuyển buổi học/)).not.toBeInTheDocument();
  });

  test('sau lỗi, "Huỷ" đóng hộp thoại và xóa lỗi (không để banner cũ lại trên trang)', async () => {
    rejectUpdateWith(400, 'Ngày này không có tiết của môn');
    const { card } = renderPage();
    const dialog = await openMoveDialog(card, 'l1');
    fireEvent.change(within(dialog).getByLabelText('Ngày mới'), { target: { value: '2026-01-15' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Chuyển' }));
    await screen.findByText('Ngày này không có tiết của môn');

    await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Ngày này không có tiết của môn')).not.toBeInTheDocument();
  });

  test('ô ngày để trống thì không gửi gì', async () => {
    const { card } = renderPage();
    const dialog = await openMoveDialog(card, 'l1');

    fireEvent.change(within(dialog).getByLabelText('Ngày mới'), { target: { value: '' } });

    expect(within(dialog).getByRole('button', { name: 'Chuyển' })).toBeDisabled();
    fireEvent.submit(within(dialog).getByLabelText('Ngày mới').closest('form'));
    expect(updateLessonLogMock).not.toHaveBeenCalled();
  });

  test('bấm đúp "Chuyển" khi backend còn đang tính lại → chỉ gửi 1 lần, nút khóa và có thông báo đang xếp lại', async () => {
    updateLessonLogMock.mockReturnValue({ unwrap: () => new Promise(() => {}) });
    const { card } = renderPage();
    const dialog = await openMoveDialog(card, 'l1');
    fireEvent.change(within(dialog).getByLabelText('Ngày mới'), { target: { value: '2026-01-22' } });

    await userEvent.dblClick(within(dialog).getByRole('button', { name: 'Chuyển' }));

    expect(updateLessonLogMock).toHaveBeenCalledTimes(1);
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Chuyển' })).toBeDisabled();
    expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent(
      'Đang chuyển và xếp lại các buổi học',
    );
  });
});

describe('kéo-thả (Review Focus 4)', () => {
  test('thả sang cột 15/01 → gọi updateLessonLog đúng payload; thành công → thông báo ngày mới', async () => {
    const { card, column } = renderPage();

    fireEvent.dragStart(card('l1'));
    fireEvent.drop(column('2026-01-15'));

    expect(updateLessonLogMock).toHaveBeenCalledTimes(1);
    expect(updateLessonLogMock).toHaveBeenCalledWith({ positionId: 'p-toan', logId: 'l1', date: '2026-01-15' });
    expect(
      await screen.findByText(
        'Đã chuyển buổi học sang ngày 15/01/2026. Các buổi chưa chốt của môn đã được xếp lại.',
      ),
    ).toBeInTheDocument();
  });

  test('(g) thả vào ngày không có tiết (400) → banner nguyên văn, thẻ vẫn ở cột cũ — bảng KHÔNG đổi lạc quan', async () => {
    rejectUpdateWith(400, 'Ngày này không có tiết của môn');
    const { card, column } = renderPage();

    fireEvent.dragStart(card('l1'));
    fireEvent.drop(column('2026-01-15'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ngày này không có tiết của môn');
    expect(within(column('2026-01-12')).getByText('Bài 1')).toBeInTheDocument();
    expect(column('2026-01-15').querySelector('[data-log-id="l1"]')).toBeNull();
    expect(screen.queryByText(/Đã chuyển buổi học/)).not.toBeInTheDocument();
  });

  test('thả vào chính ngày cũ → không gọi API', () => {
    const { card, column } = renderPage();

    fireEvent.dragStart(card('l1'));
    fireEvent.drop(column('2026-01-12'));

    expect(updateLessonLogMock).not.toHaveBeenCalled();
  });

  test('thả hai lần liền nhau khi backend chưa trả lời → chỉ gửi 1 lần (thẻ khóa khi đang lưu)', () => {
    updateLessonLogMock.mockReturnValue({ unwrap: () => new Promise(() => {}) });
    const { card, column } = renderPage();

    fireEvent.dragStart(card('l1'));
    fireEvent.drop(column('2026-01-15'));
    // Thẻ đang lưu không kéo được nữa nên dragstart tiếp theo không có tác dụng.
    expect(card('l1')).not.toHaveAttribute('draggable');
    fireEvent.dragStart(card('l1'));
    fireEvent.drop(column('2026-01-16'));

    expect(updateLessonLogMock).toHaveBeenCalledTimes(1);
  });

  test('lỗi mới thay thế lỗi cũ trên banner (không dồn nhiều lỗi)', async () => {
    rejectUpdateWith(400, 'Ngày này không có tiết của môn');
    const { card, column } = renderPage();
    fireEvent.dragStart(card('l1'));
    fireEvent.drop(column('2026-01-15'));
    await screen.findByText('Ngày này không có tiết của môn');

    rejectUpdateWith(409, 'Ngày này đã có buổi học khác, không thể chuyển vào');
    fireEvent.dragStart(card('l1'));
    fireEvent.drop(column('2026-01-14'));

    expect(await screen.findByText('Ngày này đã có buổi học khác, không thể chuyển vào')).toBeInTheDocument();
    expect(screen.queryByText('Ngày này không có tiết của môn')).not.toBeInTheDocument();
  });
});

describe('thông báo cũ không lưu lại khi đổi ngữ cảnh xem', () => {
  const MOVE_NOTICE = 'Đã chuyển buổi học sang ngày 15/01/2026. Các buổi chưa chốt của môn đã được xếp lại.';

  function dropLogOnThursday(card, column) {
    fireEvent.dragStart(card('l1'));
    fireEvent.drop(column('2026-01-15'));
  }

  test('sang tuần khác thì thông báo thành công của lần chuyển trước biến mất', async () => {
    const { card, column } = renderPage();
    dropLogOnThursday(card, column);
    expect(await screen.findByText(MOVE_NOTICE)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));

    expect(screen.queryByText(MOVE_NOTICE)).not.toBeInTheDocument();
  });

  test('sang tuần khác thì banner lỗi của thao tác trước biến mất', async () => {
    rejectUpdateWith(400, 'Ngày này không có tiết của môn');
    const { card, column } = renderPage();
    dropLogOnThursday(card, column);
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Tuần trước' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('đổi chế độ xem hoặc đổi môn cũng xóa thông báo và lỗi cũ', async () => {
    const { card, column } = renderPage({ user: ADMIN });
    dropLogOnThursday(card, column);
    expect(await screen.findByText(MOVE_NOTICE)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Toàn bộ' }));
    expect(screen.queryByText(MOVE_NOTICE)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Theo tuần' }));
    rejectUpdateWith(400, 'Ngày này không có tiết của môn');
    fireEvent.dragStart(card('l1'));
    fireEvent.drop(column('2026-01-15'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Môn'), 'p-van');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('tích "Đã thực hiện"', () => {
  test('đang lưu: checkbox giữ giá trị dự định (đã tích) và bị khóa, rồi trả về trạng thái của dữ liệu khi lỗi', async () => {
    let rejectUpdate;
    updateLessonLogMock.mockReturnValue({
      unwrap: () =>
        new Promise((resolve, reject) => {
          rejectUpdate = reject;
        }),
    });
    renderPage();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' }));

    const checkbox = screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' });
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeDisabled();

    rejectUpdate({ status: 403, data: { message: 'Forbidden resource' } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn không có quyền thực hiện thao tác này');
    expect(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' })).toBeEnabled();
  });

  test('lưu xong mà danh sách đang tải lại: checkbox giữ trạng thái đã tích (không nháy về giá trị cũ)', async () => {
    let isRefetching = false;
    let refetchStartedAt;
    getLogsMock.mockImplementation(() => queryResult(WEEK_LOGS, { isFetching: isRefetching, startedTimeStamp: refetchStartedAt }));
    updateLessonLogMock.mockImplementation(() => ({
      unwrap: () => {
        // RTK Query bắt đầu tải lại danh sách ngay khi mutation hoàn tất (invalidatesTags).
        isRefetching = true;
        refetchStartedAt = Date.now();
        return Promise.resolve({});
      },
    }));
    renderPage();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' }));

    // Dữ liệu chưa về (log.done vẫn false) nhưng checkbox đã dùng lại được và vẫn hiện đã tích.
    const checkbox = screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' });
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeEnabled();
  });

  test('tải lại xong thì theo dữ liệu từ backend, giá trị dự định không bị giữ mãi', async () => {
    let isRefetching = false;
    let refetchStartedAt;
    getLogsMock.mockImplementation(() => queryResult(WEEK_LOGS, { isFetching: isRefetching, startedTimeStamp: refetchStartedAt }));
    updateLessonLogMock.mockImplementation(() => ({
      unwrap: () => {
        isRefetching = true;
        refetchStartedAt = Date.now();
        return Promise.resolve({});
      },
    }));
    const { rerenderPage } = renderPage();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' }));
    expect(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' })).toBeChecked();

    // Lần tải lại kết thúc và dữ liệu vẫn nói done=false (vd người khác vừa bỏ tích) → checkbox phải theo dữ liệu.
    isRefetching = false;
    rerenderPage();

    expect(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' })).not.toBeChecked();
  });

  test('buổi đã tích trong dữ liệu hiện checked; bỏ tích gửi done=false', async () => {
    getLogsMock.mockReturnValue(queryResult([makeLessonLog({ ...LOG_MON, done: true })]));
    renderPage();

    const checkbox = screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' });
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);

    expect(updateLessonLogMock).toHaveBeenCalledWith({ positionId: 'p-toan', logId: 'l1', done: false });
  });
});

describe('tải dữ liệu', () => {
  test('lớp đang tải → "Đang tải..." và chưa tải buổi học', () => {
    getClassDetailMock.mockReturnValue(queryResult(undefined, { isLoading: true, isFetching: true }));
    renderPage();

    expect(screen.getByText('Đang tải...')).toBeInTheDocument();
    expect(getLogsMock.mock.calls.every(([, options]) => options.skip === true)).toBe(true);
  });

  test('phiên đăng nhập chưa khôi phục xong (user null) → "Đang tải...", không chớp câu "chưa giữ môn nào"', () => {
    renderPage({ user: null });

    expect(screen.getByText('Đang tải...')).toBeInTheDocument();
    expect(screen.queryByText('Bạn chưa giữ môn nào trong lớp này')).not.toBeInTheDocument();
    expect(getLogsMock.mock.calls.every(([, options]) => options.skip === true)).toBe(true);
  });

  test('danh sách buổi đang tải lần đầu → "Đang tải...", chưa hiện câu "rỗng" hay cột nào', () => {
    getLogsMock.mockReturnValue(queryResult(undefined, { isLoading: true, isFetching: true }));
    const { container } = renderPage();

    expect(screen.getByText('Đang tải...')).toBeInTheDocument();
    expect(screen.queryByText(/Chưa có buổi báo giảng nào/)).not.toBeInTheDocument();
    expect(container.querySelector('[data-column]')).toBeNull();
  });

  test('vừa đổi tuần: dữ liệu tuần trước (data) KHÔNG được đặt vào cột của tuần mới trong lúc tải', () => {
    getLogsMock.mockReturnValue({
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
    expect(screen.queryByText(/Chưa có buổi báo giảng nào/)).not.toBeInTheDocument();
    expect(container.querySelector('[data-column]')).toBeNull();
  });

  test('đang tải lại sau khi ghi (currentData còn) → bảng giữ nguyên, không chớp "Đang tải..."', () => {
    getLogsMock.mockReturnValue(queryResult(WEEK_LOGS, { isFetching: true }));
    renderPage();

    expect(screen.getByText('Bài 1')).toBeInTheDocument();
    expect(screen.queryByText('Đang tải...')).not.toBeInTheDocument();
  });

  test('lỗi tải 403 của guard → câu tiếng Việt cố định; lỗi khác hiện nguyên văn message backend', () => {
    getLogsMock.mockReturnValue(
      queryResult(undefined, { isError: true, error: { status: 403, data: { message: 'Forbidden resource' } } }),
    );
    const forbidden = renderPage();
    expect(screen.getByText('Bạn không có quyền thực hiện thao tác này')).toBeInTheDocument();
    forbidden.unmount();

    getLogsMock.mockReturnValue(
      queryResult(undefined, {
        isError: true,
        error: { status: 400, data: { message: 'Ngày bắt đầu không được sau ngày kết thúc' } },
      }),
    );
    renderPage();
    expect(screen.getByText('Ngày bắt đầu không được sau ngày kết thúc')).toBeInTheDocument();
  });

  test('lỗi mạng khi tải buổi học → câu tiếng Việt dự phòng', () => {
    getLogsMock.mockReturnValue(
      queryResult(undefined, { isError: true, error: { status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' } }),
    );
    renderPage();

    expect(screen.getByText('Không tải được sổ báo giảng, vui lòng thử lại')).toBeInTheDocument();
  });
});

describe('lỗi tải lớp', () => {
  function mockDetailError(error) {
    getClassDetailMock.mockReturnValue(queryResult(undefined, { isError: true, error }));
  }

  test.each([
    ['(h) 403 → "Bạn không có quyền xem lớp này"', { status: 403, data: { message: 'Forbidden resource' } }, 'Bạn không có quyền xem lớp này'],
    ['404 → "Không tìm thấy lớp"', { status: 404, data: { message: 'Không tìm thấy lớp' } }, 'Không tìm thấy lớp'],
    [
      '500 → message của backend',
      { status: 500, data: { message: 'Đã có lỗi xảy ra, vui lòng thử lại sau' } },
      'Đã có lỗi xảy ra, vui lòng thử lại sau',
    ],
    [
      'lỗi mạng → câu dự phòng',
      { status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' },
      'Không tải được thông tin lớp, vui lòng thử lại',
    ],
  ])('%s; không hiện bảng và không tải buổi học', (_label, error, expectedText) => {
    mockDetailError(error);
    const { container } = renderPage();

    expect(screen.getByText(expectedText)).toBeInTheDocument();
    expect(container.querySelector('[data-column]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Theo tuần' })).not.toBeInTheDocument();
    expect(getLogsMock.mock.calls.every(([, options]) => options.skip === true)).toBe(true);
  });
});
