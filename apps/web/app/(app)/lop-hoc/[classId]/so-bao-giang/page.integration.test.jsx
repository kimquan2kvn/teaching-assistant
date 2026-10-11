import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { makeStore } from '@/lib/store/store';
import { setCredentials } from '@/lib/store/auth-slice';
import { CLASS_DETAIL, makeLessonLog } from '@/lib/test-fixtures/phase3';
import LessonLogsPage from './page';

// Test tích hợp với store RTK Query THẬT + fetch giả (không mock hook): chứng minh các giả định của trang về
// ngữ nghĩa RTK Query mà test mock-hook chỉ mô phỏng lại — currentData khi đổi tuần, isFetching ngay sau mutation,
// hình dạng lỗi thật của fetchBaseQuery.

const WEEK_PATH = '/positions/p-toan/lesson-logs?from=2026-01-12&to=2026-01-18';
const NEXT_WEEK_PATH = '/positions/p-toan/lesson-logs?from=2026-01-19&to=2026-01-25';
const PATCH_PATH = '/positions/p-toan/lesson-logs/l1';

const LOG_MON = makeLessonLog({ _id: 'l1', date: '2026-01-12T00:00:00.000Z' });
const LOG_WED = makeLessonLog({
  _id: 'l2',
  ppctItemId: 'i2',
  date: '2026-01-14T00:00:00.000Z',
  ppctItem: { order: 2, week: 1, periodLabel: '2', title: 'Bài 2', periodCount: 1, requirement: '' },
});
const NEXT_WEEK_LOG = makeLessonLog({
  _id: 'l9',
  ppctItemId: 'i9',
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
    'GET /classes/class-1/detail': CLASS_DETAIL,
    [`GET ${WEEK_PATH}`]: [LOG_MON, LOG_WED],
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
      <LessonLogsPage params={{ classId: 'class-1' }} searchParams={{}} />
    </Provider>,
  );
  const column = (date) => utils.container.querySelector(`[data-column="${date}"]`);
  const card = (logId) => utils.container.querySelector(`[data-log-id="${logId}"]`);
  return { ...utils, column, card };
}

test('tải lớp rồi tải đúng khoảng tuần bằng hook thật; buổi nằm đúng cột ngày', async () => {
  const { column } = renderPage();

  expect(await screen.findByText('Bài 1')).toBeInTheDocument();
  expect(within(column('2026-01-12')).getByText('Bài 1')).toBeInTheDocument();
  expect(within(column('2026-01-14')).getByText('Bài 2')).toBeInTheDocument();
  expect(callsOf('GET', WEEK_PATH)).toHaveLength(1);
});

test('đổi tuần: trong lúc tải tuần mới KHÔNG hiện buổi của tuần trước và không chớp câu "rỗng"; tải xong hiện buổi mới', async () => {
  const gate = deferred();
  routes[`GET ${NEXT_WEEK_PATH}`] = () => gate.promise;
  renderPage();
  await screen.findByText('Bài 1');

  await userEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));

  expect(screen.getByText('Đang tải...')).toBeInTheDocument();
  expect(screen.queryByText('Bài 1')).not.toBeInTheDocument();
  expect(screen.queryByText('Bài 2')).not.toBeInTheDocument();
  expect(screen.queryByText(/Chưa có buổi báo giảng nào/)).not.toBeInTheDocument();

  gate.resolve(jsonResponse(200, [NEXT_WEEK_LOG]));

  expect(await screen.findByText('Bài 9')).toBeInTheDocument();
  expect(screen.queryByText('Bài 1')).not.toBeInTheDocument();
});

describe('tích "Đã thực hiện" với invalidation thật', () => {
  test('PATCH {done:true}; trong lúc danh sách tải lại checkbox vẫn đã tích và dùng được; tải xong theo dữ liệu mới', async () => {
    renderPage();
    const checkbox = await screen.findByRole('checkbox', { name: 'Đã thực hiện: Bài 1' });
    expect(checkbox).not.toBeChecked();

    const refetchGate = deferred();
    routes[`PATCH ${PATCH_PATH}`] = () => jsonResponse(200, { ...LOG_MON, done: true });
    routes[`GET ${WEEK_PATH}`] = () => refetchGate.promise;
    await userEvent.click(checkbox);

    // Mutation xong → RTK Query tải lại danh sách (đang được giữ lại): dữ liệu cũ vẫn là done=false.
    await waitFor(() => expect(callsOf('GET', WEEK_PATH)).toHaveLength(2));
    expect(callsOf('PATCH', PATCH_PATH)).toHaveLength(1);
    expect(JSON.parse(callsOf('PATCH', PATCH_PATH)[0][0].body)).toEqual({ done: true });
    const duringRefetch = screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' });
    expect(duringRefetch).toBeChecked();
    expect(duringRefetch).toBeEnabled();

    refetchGate.resolve(jsonResponse(200, [{ ...LOG_MON, done: true }, LOG_WED]));

    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' })).toBeChecked());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('tải lại xong mà dữ liệu vẫn done=false (vd bị người khác bỏ tích) → checkbox theo dữ liệu, không bị giữ mãi', async () => {
    renderPage();
    const checkbox = await screen.findByRole('checkbox', { name: 'Đã thực hiện: Bài 1' });

    const refetchGate = deferred();
    routes[`PATCH ${PATCH_PATH}`] = () => jsonResponse(200, { ...LOG_MON, done: true });
    routes[`GET ${WEEK_PATH}`] = () => refetchGate.promise;
    await userEvent.click(checkbox);
    await waitFor(() => expect(callsOf('GET', WEEK_PATH)).toHaveLength(2));
    expect(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' })).toBeChecked();

    refetchGate.resolve(jsonResponse(200, [LOG_MON, LOG_WED]));

    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' })).not.toBeChecked());
  });

  test('PATCH bị 403 của guard (body thật của Nest) → câu tiếng Việt cố định, checkbox về trạng thái trong dữ liệu', async () => {
    renderPage();
    const checkbox = await screen.findByRole('checkbox', { name: 'Đã thực hiện: Bài 1' });
    routes[`PATCH ${PATCH_PATH}`] = () =>
      jsonResponse(403, { statusCode: 403, message: 'Forbidden resource', error: 'Forbidden' });

    await userEvent.click(checkbox);

    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn không có quyền thực hiện thao tác này');
    expect(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Đã thực hiện: Bài 1' })).toBeEnabled();
  });
});

describe('kéo-thả với backend thật (giả lập)', () => {
  test('thả sang 15/01: PATCH {date:"2026-01-15"}; sau khi danh sách tải lại thẻ chuyển sang cột 15/01 và có thông báo', async () => {
    const { card, column } = renderPage();
    await screen.findByText('Bài 1');
    routes[`PATCH ${PATCH_PATH}`] = () => jsonResponse(200, { ...LOG_MON, date: '2026-01-15T00:00:00.000Z' });
    routes[`GET ${WEEK_PATH}`] = [
      { ...LOG_MON, date: '2026-01-15T00:00:00.000Z', isManuallyAdjusted: true },
      LOG_WED,
    ];

    fireEvent.dragStart(card('l1'));
    fireEvent.drop(column('2026-01-15'));

    await waitFor(() => expect(column('2026-01-15').querySelector('[data-log-id="l1"]')).not.toBeNull());
    expect(column('2026-01-12').querySelector('[data-log-id="l1"]')).toBeNull();
    expect(JSON.parse(callsOf('PATCH', PATCH_PATH)[0][0].body)).toEqual({ date: '2026-01-15' });
    expect(
      screen.getByText('Đã chuyển buổi học sang ngày 15/01/2026. Các buổi chưa chốt của môn đã được xếp lại.'),
    ).toBeInTheDocument();
    expect(within(column('2026-01-15')).getByText('Đã chỉnh tay')).toBeInTheDocument();
  });

  test('thả vào ngày không có tiết: 400 thật của backend hiện nguyên văn và thẻ vẫn ở cột cũ (kể cả sau lần tải lại do invalidation)', async () => {
    const { card, column } = renderPage();
    await screen.findByText('Bài 1');
    routes[`PATCH ${PATCH_PATH}`] = () =>
      jsonResponse(400, { statusCode: 400, message: 'Ngày này không có tiết của môn', error: 'Bad Request' });

    fireEvent.dragStart(card('l1'));
    fireEvent.drop(column('2026-01-16'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ngày này không có tiết của môn');
    // RTK Query vẫn invalidate khi mutation lỗi nên có thể có thêm một lần tải lại: chờ nó xong rồi kiểm bảng.
    await waitFor(() => expect(callsOf('GET', WEEK_PATH).length).toBeGreaterThanOrEqual(1));
    expect(column('2026-01-12').querySelector('[data-log-id="l1"]')).not.toBeNull();
    expect(column('2026-01-16').querySelector('[data-log-id="l1"]')).toBeNull();
  });

  test('thả hai lần liền nhau khi PATCH còn đang chờ → chỉ có 1 request PATCH', async () => {
    const patchGate = deferred();
    const { card, column } = renderPage();
    await screen.findByText('Bài 1');
    routes[`PATCH ${PATCH_PATH}`] = () => patchGate.promise;

    fireEvent.dragStart(card('l1'));
    fireEvent.drop(column('2026-01-15'));
    await waitFor(() => expect(callsOf('PATCH', PATCH_PATH)).toHaveLength(1));
    fireEvent.dragStart(card('l1'));
    fireEvent.drop(column('2026-01-16'));

    expect(callsOf('PATCH', PATCH_PATH)).toHaveLength(1);
    expect(card('l1')).toHaveAttribute('aria-busy', 'true');

    patchGate.resolve(jsonResponse(200, { ...LOG_MON, date: '2026-01-15T00:00:00.000Z' }));
    await waitFor(() => expect(card('l1')).not.toHaveAttribute('aria-busy'));
  });
});
