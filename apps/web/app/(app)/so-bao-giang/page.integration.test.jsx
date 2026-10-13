import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { makeStore } from '@/lib/store/store';
import { setCredentials } from '@/lib/store/auth-slice';
import { makeMyPosition, makeWeekLog } from '@/lib/test-fixtures/phase3';
import WeeklyLessonLogsPage from './page';

// Test tích hợp với store RTK Query THẬT + fetch giả (không mock hook): chứng minh các giả định của trang về ngữ nghĩa
// RTK Query mà test mock-hook chỉ mô phỏng lại — currentData khi đổi tuần, isFetching ngay sau mutation, tag
// TeacherWeek làm mới lưới tuần sau khi ghi, và việc vai trò bị chặn không bắn request nào.

const WEEK_PATH = '/lesson-logs/week?weekStart=2026-01-12';
const NEXT_WEEK_PATH = '/lesson-logs/week?weekStart=2026-01-19';
const VAN_PATCH_PATH = '/positions/p-van/lesson-logs/w-van';

const MY_POSITIONS = [makeMyPosition(), makeMyPosition({ id: 'p-van', subject: 'Ngữ văn' })];

const TOAN_MON = makeWeekLog({ _id: 'w-toan', date: '2026-01-12T00:00:00.000Z' });
const VAN_MON = makeWeekLog({
  _id: 'w-van',
  positionId: 'p-van',
  ppctItemId: 'i-van',
  date: '2026-01-12T00:00:00.000Z',
  position: { _id: 'p-van', classId: 'class-1', className: '11A4', subject: 'Ngữ văn' },
  ppctItem: { order: 1, week: 1, periodLabel: '1', title: 'Bài Văn 1', periodCount: 1, requirement: '' },
});
const NEXT_WEEK_LOG = makeWeekLog({
  _id: 'w-next',
  date: '2026-01-19T00:00:00.000Z',
  ppctItem: { order: 9, week: 3, periodLabel: '9', title: 'Bài 9', periodCount: 1, requirement: '' },
});

function jsonResponse(status, body) {
  const text = JSON.stringify(body);
  return Promise.resolve({
    status,
    text: () => Promise.resolve(text),
    clone() {
      return { text: () => Promise.resolve(text) };
    },
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function pathOf(request) {
  const { pathname, search } = new URL(request.url);
  return `${pathname}${search}`;
}

const callsOf = (method, path) =>
  global.fetch.mock.calls.filter(([request]) => request.method === method && pathOf(request) === path);

// Bảng định tuyến theo "METHOD /đường-dẫn?query": giá trị là body JSON (200) hoặc hàm trả promise của response
// (để giữ một response lại và kiểm trạng thái "đang chờ").
let routes;

beforeEach(() => {
  routes = {
    'GET /positions/mine': MY_POSITIONS,
    [`GET ${WEEK_PATH}`]: [TOAN_MON, VAN_MON],
  };
  global.fetch = jest.fn((request) => {
    const key = `${request.method} ${pathOf(request)}`;
    const handler = routes[key];
    if (handler === undefined) return jsonResponse(404, { message: `Chưa mock ${key}` });
    return typeof handler === 'function' ? handler(request) : jsonResponse(200, handler);
  });
  // Chỉ giả Date (10:00 sáng Thứ Tư 14/01/2026 giờ VN): giữ nguyên mọi bộ hẹn giờ cho React và RTK Query.
  jest.useFakeTimers({
    now: new Date('2026-01-14T03:00:00.000Z'),
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
});

afterEach(() => {
  jest.useRealTimers();
});

function renderPage({ user = { id: 'u-toan', role: 'TEACHER' } } = {}) {
  const store = makeStore();
  store.dispatch(setCredentials({ user, accessToken: 'token' }));
  const utils = render(
    <Provider store={store}>
      <WeeklyLessonLogsPage />
    </Provider>,
  );
  const column = (date) => utils.container.querySelector(`[data-column="${date}"]`);
  const card = (logId) => utils.container.querySelector(`[data-log-id="${logId}"]`);
  return { ...utils, column, card };
}

test('tải môn của giáo viên và lưới tuần bằng hook thật; thẻ có lớp-môn và nằm đúng cột', async () => {
  const { column } = renderPage();

  expect(await screen.findByText('Bài Văn 1')).toBeInTheDocument();
  const monday = column('2026-01-12');
  expect(within(monday).getByText('11A4 · Toán')).toBeInTheDocument();
  expect(within(monday).getByText('11A4 · Ngữ văn')).toBeInTheDocument();
  expect(callsOf('GET', WEEK_PATH)).toHaveLength(1);
  const options = within(screen.getByLabelText('Lớp/môn')).getAllByRole('option').map((option) => option.textContent);
  expect(options).toEqual(['Tất cả các lớp', '11A4 — Toán', '11A4 — Ngữ văn']);
});

test('lọc theo lớp/môn là lọc phía client: không gửi thêm request nào', async () => {
  const { card } = renderPage();
  await screen.findByText('Bài Văn 1');
  const requestsBefore = global.fetch.mock.calls.length;

  await userEvent.selectOptions(screen.getByLabelText('Lớp/môn'), 'p-van');

  expect(card('w-toan')).toBeNull();
  expect(card('w-van')).not.toBeNull();
  expect(global.fetch.mock.calls.length).toBe(requestsBefore);
});

test('đổi tuần: trong lúc tải tuần mới KHÔNG hiện buổi của tuần trước và không chớp câu "rỗng"; tải xong hiện buổi mới', async () => {
  const gate = deferred();
  routes[`GET ${NEXT_WEEK_PATH}`] = () => gate.promise;
  renderPage();
  await screen.findByText('Bài Văn 1');

  await userEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));

  expect(screen.getByText('Đang tải...')).toBeInTheDocument();
  expect(screen.queryByText('Bài Văn 1')).not.toBeInTheDocument();
  expect(screen.queryByText(/Tuần này không có buổi học nào/)).not.toBeInTheDocument();

  gate.resolve(jsonResponse(200, [NEXT_WEEK_LOG]));

  expect(await screen.findByText('Bài 9')).toBeInTheDocument();
});

test('tích buổi Văn: PATCH vào vị trí của chính buổi đó; lưới tuần được tải lại (tag TeacherWeek) và checkbox không nháy về giá trị cũ', async () => {
  renderPage();
  const checkbox = await screen.findByRole('checkbox', { name: 'Đã thực hiện: Bài Văn 1' });

  const refetchGate = deferred();
  routes[`PATCH ${VAN_PATCH_PATH}`] = () => jsonResponse(200, { ...VAN_MON, done: true });
  routes[`GET ${WEEK_PATH}`] = () => refetchGate.promise;
  await userEvent.click(checkbox);

  await waitFor(() => expect(callsOf('GET', WEEK_PATH)).toHaveLength(2));
  expect(JSON.parse(callsOf('PATCH', VAN_PATCH_PATH)[0][0].body)).toEqual({ done: true });
  const duringRefetch = screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài Văn 1' });
  expect(duringRefetch).toBeChecked();
  expect(duringRefetch).toBeEnabled();

  refetchGate.resolve(jsonResponse(200, [TOAN_MON, { ...VAN_MON, done: true }]));

  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài Văn 1' })).toBeChecked());
});

test('hai thao tác ghi chồng nhau (chuyển ngày Văn đang treo, tích Toán xong ngay): checkbox Toán giữ tích suốt thời gian đó, rồi dọn khi danh sách tải lại', async () => {
  const { card, column } = renderPage();
  await screen.findByText('Bài Văn 1');

  // RTK Query hoãn invalidation của mutation vừa xong khi còn mutation khác đang chạy: chưa có refetch nào, checkbox
  // không được quay về log.done cũ trong lúc đó.
  const vanGate = deferred();
  routes[`PATCH ${VAN_PATCH_PATH}`] = () => vanGate.promise;
  fireEvent.dragStart(card('w-van'));
  fireEvent.drop(column('2026-01-15'));
  await waitFor(() => expect(callsOf('PATCH', VAN_PATCH_PATH)).toHaveLength(1));

  // Đồng hồ chỉ giả Date và đứng yên: nhích để lúc lưu Toán xong khác mốc lúc tải danh sách ban đầu.
  jest.setSystemTime(new Date('2026-01-14T03:00:30.000Z'));
  const refetchGate = deferred();
  routes['PATCH /positions/p-toan/lesson-logs/w-toan'] = () => jsonResponse(200, { ...TOAN_MON, done: true });
  routes[`GET ${WEEK_PATH}`] = () => refetchGate.promise;
  await userEvent.click(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' }));
  await waitFor(() => expect(callsOf('PATCH', '/positions/p-toan/lesson-logs/w-toan')).toHaveLength(1));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  expect(callsOf('GET', WEEK_PATH)).toHaveLength(1);
  expect(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' })).toBeChecked();

  jest.setSystemTime(new Date('2026-01-14T03:01:00.000Z'));
  vanGate.resolve(jsonResponse(200, { ...VAN_MON, date: '2026-01-15T00:00:00.000Z' }));
  await waitFor(() => expect(callsOf('GET', WEEK_PATH)).toHaveLength(2));
  expect(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' })).toBeChecked();

  // Danh sách tải lại xong thì giá trị dự định hết tác dụng: checkbox theo dữ liệu mới (cố ý trả done=false để thấy).
  refetchGate.resolve(jsonResponse(200, [{ ...TOAN_MON, done: false }, VAN_MON]));
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' })).not.toBeChecked());
});

test('thả thẻ Văn sang 15/01: PATCH {date} vào vị trí của buổi đó; tải lại xong thẻ nằm ở cột mới và có thông báo', async () => {
  const { card, column } = renderPage();
  await screen.findByText('Bài Văn 1');
  routes[`PATCH ${VAN_PATCH_PATH}`] = () => jsonResponse(200, { ...VAN_MON, date: '2026-01-15T00:00:00.000Z' });
  routes[`GET ${WEEK_PATH}`] = [TOAN_MON, { ...VAN_MON, date: '2026-01-15T00:00:00.000Z', isManuallyAdjusted: true }];

  fireEvent.dragStart(card('w-van'));
  fireEvent.drop(column('2026-01-15'));

  await waitFor(() => expect(column('2026-01-15').querySelector('[data-log-id="w-van"]')).not.toBeNull());
  expect(JSON.parse(callsOf('PATCH', VAN_PATCH_PATH)[0][0].body)).toEqual({ date: '2026-01-15' });
  expect(
    screen.getByText('Đã chuyển buổi học sang ngày 15/01/2026. Các buổi chưa chốt của môn đã được xếp lại.'),
  ).toBeInTheDocument();
});

test('thả vào ngày không có tiết: 400 thật hiện nguyên văn, thẻ vẫn ở cột cũ', async () => {
  const { card, column } = renderPage();
  await screen.findByText('Bài Văn 1');
  routes[`PATCH ${VAN_PATCH_PATH}`] = () =>
    jsonResponse(400, { statusCode: 400, message: 'Ngày này không có tiết của môn', error: 'Bad Request' });

  fireEvent.dragStart(card('w-van'));
  fireEvent.drop(column('2026-01-16'));

  expect(await screen.findByRole('alert')).toHaveTextContent('Ngày này không có tiết của môn');
  expect(column('2026-01-12').querySelector('[data-log-id="w-van"]')).not.toBeNull();
  expect(column('2026-01-16').querySelector('[data-log-id="w-van"]')).toBeNull();
});

test.each([
  ['ADMIN', { id: 'u-admin', role: 'ADMIN' }],
  ['STUDENT', { id: 'u-hs', role: 'STUDENT' }],
])('%s vào thẳng URL: câu giải thích và KHÔNG có request nào tới backend', async (_label, user) => {
  renderPage({ user });

  expect(screen.getByText(/chỉ dành cho giáo viên/)).toBeInTheDocument();
  // Chờ một nhịp (trong act: next/link cập nhật state ở idle callback) để chắc chắn không có request nào đẩy đi muộn.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(global.fetch).not.toHaveBeenCalled();
});
