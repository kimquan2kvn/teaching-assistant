import { makeStore } from './store';
import * as lessonLogsModule from './lesson-logs-api';
import { lessonLogsApi } from './lesson-logs-api';
import { apiErrorMessage } from '../utils';
import { makeLessonLog, makeWeekLog } from '../test-fixtures/phase3';

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

beforeEach(() => {
  global.fetch = jest.fn();
});

const flushRefetches = () => new Promise((resolve) => setTimeout(resolve, 0));

function pathOf(request) {
  const { pathname, search } = new URL(request.url);
  return `${pathname}${search}`;
}

// Một lần ghi sổ báo giảng kéo nhiều refetch song song nên mock theo "METHOD /đường-dẫn?query" thay vì theo thứ tự gọi.
function routeFetch(routes) {
  global.fetch.mockImplementation((request) => {
    const key = `${request.method} ${pathOf(request)}`;
    if (!(key in routes)) return jsonResponse(404, { message: `Chưa mock ${key}` });
    return jsonResponse(200, routes[key]);
  });
}

const callsOf = (method, path) =>
  global.fetch.mock.calls.filter(([request]) => request.method === method && pathOf(request) === path);

test('xuất đủ 3 hook theo hợp đồng của plan', () => {
  for (const name of [
    'useGetPositionLessonLogsQuery',
    'useGetTeacherWeekLessonLogsQuery',
    'useUpdateLessonLogMutation',
  ]) {
    expect([name, typeof lessonLogsModule[name]]).toEqual([name, 'function']);
  }
});

test('getPositionLessonLogs gọi GET /positions/:positionId/lesson-logs không kèm query khi không có from/to', async () => {
  const logs = [makeLessonLog(), makeLessonLog({ _id: 'l2', ppctItemId: 'i2' })];
  global.fetch.mockReturnValueOnce(jsonResponse(200, logs));
  const store = makeStore();
  const result = await store.dispatch(lessonLogsApi.endpoints.getPositionLessonLogs.initiate({ positionId: 'p1' }));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  expect(pathOf(request)).toBe('/positions/p1/lesson-logs');
  expect(request.url).not.toContain('undefined');
  expect(result.data).toEqual(logs);
});

test('getPositionLessonLogs gửi cả from và to khi có đủ', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  const store = makeStore();
  await store.dispatch(
    lessonLogsApi.endpoints.getPositionLessonLogs.initiate({
      positionId: 'p1',
      from: '2026-01-12',
      to: '2026-01-18',
    }),
  );
  const url = new URL(global.fetch.mock.calls[0][0].url);
  expect(url.pathname).toBe('/positions/p1/lesson-logs');
  expect(url.searchParams.get('from')).toBe('2026-01-12');
  expect(url.searchParams.get('to')).toBe('2026-01-18');
});

test.each([
  ['chỉ from', { from: '2026-01-12' }, '?from=2026-01-12'],
  ['chỉ to', { to: '2026-01-18' }, '?to=2026-01-18'],
])('getPositionLessonLogs %s thì chỉ gắn đúng tham số đó', async (_label, range, expectedSearch) => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  const store = makeStore();
  await store.dispatch(lessonLogsApi.endpoints.getPositionLessonLogs.initiate({ positionId: 'p1', ...range }));
  expect(new URL(global.fetch.mock.calls[0][0].url).search).toBe(expectedSearch);
});

// Ô ngày bị xóa trống cho ra chuỗi rỗng; backend trả 400 cho `from=` nên không bao giờ được gửi lên.
test.each([
  ['chuỗi rỗng', { from: '', to: '' }],
  ['null', { from: null, to: null }],
  ['undefined', { from: undefined, to: undefined }],
])('getPositionLessonLogs với from/to là %s không gắn tham số nào', async (_label, range) => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  const store = makeStore();
  await store.dispatch(lessonLogsApi.endpoints.getPositionLessonLogs.initiate({ positionId: 'p1', ...range }));
  const url = new URL(global.fetch.mock.calls[0][0].url);
  expect(url.search).toBe('');
  expect(url.href).not.toContain('undefined');
  expect(url.href).not.toContain('null');
});

test('getTeacherWeekLessonLogs gọi GET /lesson-logs/week?weekStart= và trả nguyên MẢNG (không bọc object)', async () => {
  const logs = [makeWeekLog(), makeWeekLog({ _id: 'l2', date: '2026-01-08T00:00:00.000Z' })];
  global.fetch.mockReturnValueOnce(jsonResponse(200, logs));
  const store = makeStore();
  const result = await store.dispatch(
    lessonLogsApi.endpoints.getTeacherWeekLessonLogs.initiate({ weekStart: '2026-01-12' }),
  );
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  expect(request.url).toContain('/lesson-logs/week');
  expect(request.url).toContain('weekStart=2026-01-12');
  expect(Array.isArray(result.data)).toBe(true);
  expect(result.data).toEqual(logs);
});

test.each([
  ['{}', {}],
  ['undefined', undefined],
])('getTeacherWeekLessonLogs(%s) không gửi weekStart để backend dùng tuần hiện tại', async (_label, arg) => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  const store = makeStore();
  await store.dispatch(lessonLogsApi.endpoints.getTeacherWeekLessonLogs.initiate(arg));
  const request = global.fetch.mock.calls[0][0];
  expect(request.url).toContain('/lesson-logs/week');
  expect(request.url).not.toContain('weekStart');
});

// `done: false` (bỏ tích) là thao tác hợp lệ nên phải được gửi lên chứ không bị coi như "không có".
test.each([
  ['tích đã thực hiện', { done: true }],
  ['bỏ tích', { done: false }],
  ['chuyển ngày', { date: '2026-01-22' }],
  ['chuyển ngày và tích cùng lúc', { date: '2026-01-22', done: true }],
])(
  'updateLessonLog %s gọi đúng PATCH /positions/:positionId/lesson-logs/:logId, body chỉ có date/done',
  async (_label, change) => {
    global.fetch.mockReturnValueOnce(jsonResponse(200, makeLessonLog(change)));
    const store = makeStore();
    await store.dispatch(
      lessonLogsApi.endpoints.updateLessonLog.initiate({ positionId: 'p1', logId: 'l1', ...change }),
    );
    const request = global.fetch.mock.calls[0][0];
    expect(request.method).toBe('PATCH');
    expect(pathOf(request)).toBe('/positions/p1/lesson-logs/l1');
    expect(JSON.parse(request.body)).toEqual(change);
  },
);

test.each([
  ['tích đã thực hiện', { done: true }],
  ['chuyển ngày', { date: '2026-01-22' }],
])(
  'updateLessonLog %s thành công refetch mọi query sổ báo giảng của đúng vị trí và lưới tuần, không đụng vị trí khác',
  async (_label, change) => {
    routeFetch({
      'GET /positions/p1/lesson-logs': [makeLessonLog()],
      'GET /positions/p1/lesson-logs?from=2026-01-12&to=2026-01-18': [],
      'GET /positions/p2/lesson-logs': [],
      'GET /lesson-logs/week?weekStart=2026-01-12': [makeWeekLog()],
      'GET /lesson-logs/week?weekStart=2026-01-19': [],
      'PATCH /positions/p1/lesson-logs/l1': makeLessonLog(change),
    });
    const store = makeStore();
    const { endpoints } = lessonLogsApi;
    await store.dispatch(endpoints.getPositionLessonLogs.initiate({ positionId: 'p1' }));
    await store.dispatch(
      endpoints.getPositionLessonLogs.initiate({ positionId: 'p1', from: '2026-01-12', to: '2026-01-18' }),
    );
    await store.dispatch(endpoints.getPositionLessonLogs.initiate({ positionId: 'p2' }));
    await store.dispatch(endpoints.getTeacherWeekLessonLogs.initiate({ weekStart: '2026-01-12' }));
    await store.dispatch(endpoints.getTeacherWeekLessonLogs.initiate({ weekStart: '2026-01-19' }));
    global.fetch.mockClear();

    await store.dispatch(endpoints.updateLessonLog.initiate({ positionId: 'p1', logId: 'l1', ...change }));
    await flushRefetches();

    expect(callsOf('GET', '/positions/p1/lesson-logs')).toHaveLength(1);
    expect(callsOf('GET', '/positions/p1/lesson-logs?from=2026-01-12&to=2026-01-18')).toHaveLength(1);
    expect(callsOf('GET', '/lesson-logs/week?weekStart=2026-01-12')).toHaveLength(1);
    expect(callsOf('GET', '/lesson-logs/week?weekStart=2026-01-19')).toHaveLength(1);
    expect(callsOf('GET', '/positions/p2/lesson-logs')).toHaveLength(0);
  },
);

// Thông điệp đúng chữ của backend (lesson-log-engine.service.ts assertCanMoveLog, lesson-logs.service.ts và shared
// lesson-log.schema.ts). PATCH qua ZodValidationPipe nên lỗi body có tiền tố "Dữ liệu gửi lên không hợp lệ: ".
const MOVE_ERRORS = [
  [400, 'Ngày này không có tiết của môn'],
  [409, 'Ngày này đã có buổi học khác, không thể chuyển vào'],
  [404, 'Không tìm thấy buổi học'],
  [400, 'Dữ liệu gửi lên không hợp lệ: Cần gửi ít nhất một trong hai trường: date hoặc done'],
  [400, 'Dữ liệu gửi lên không hợp lệ: Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd'],
];

test.each(MOVE_ERRORS)(
  'updateLessonLog lỗi %i giữ nguyên status và message tiếng Việt của backend qua .unwrap(): %s',
  async (status, message) => {
    global.fetch.mockReturnValueOnce(jsonResponse(status, { statusCode: status, message, error: 'Lỗi' }));
    const store = makeStore();

    const request = lessonLogsApi.endpoints.updateLessonLog.initiate({
      positionId: 'p1',
      logId: 'l1',
      date: '2026-01-06',
    });
    const error = await store
      .dispatch(request)
      .unwrap()
      .catch((e) => e);

    expect(error).toMatchObject({ status, data: { message } });
    expect(apiErrorMessage(error, 'Không lưu được thay đổi')).toBe(message);
  },
);

test('getPositionLessonLogs giữ nguyên lỗi 400 của backend khi khoảng ngày ngược (from sau to)', async () => {
  const message = 'Ngày bắt đầu không được sau ngày kết thúc';
  global.fetch.mockReturnValueOnce(jsonResponse(400, { statusCode: 400, message, error: 'Bad Request' }));
  const store = makeStore();

  const result = await store.dispatch(
    lessonLogsApi.endpoints.getPositionLessonLogs.initiate({ positionId: 'p1', from: '2026-01-18', to: '2026-01-12' }),
  );

  expect(result.error).toMatchObject({ status: 400, data: { message } });
  expect(apiErrorMessage(result.error, 'Không tải được sổ báo giảng')).toBe(message);
});
