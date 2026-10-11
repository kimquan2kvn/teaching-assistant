import { waitFor } from '@testing-library/react';
import { makeStore } from './store';
import { schoolCalendarApi } from './school-calendar-api';
import { makeHoliday, makeSchoolYear } from '../test-fixtures/phase3';

// Mẫu thật của GET /school-years/:id/calendar-stats (đúng 4 khóa, xem holidays.e2e.spec.ts ở backend).
const STATS = { totalHolidayDays: 4, leHolidayDays: 2, dotXuatHolidayDays: 2, remainingTeachingDays: 6 };

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

// Định tuyến theo "METHOD /đường-dẫn" thay vì xếp hàng mockReturnValueOnce: sau 1 lần ghi, nhiều query refetch
// cùng lúc nên thứ tự gọi fetch không cố định.
function mockFetchRoutes(routes) {
  global.fetch = jest.fn((request) => {
    const { pathname } = new URL(request.url);
    const route = routes[`${request.method} ${pathname}`];
    if (!route) return jsonResponse(404, { message: `Test chưa mock ${request.method} ${pathname}` });
    return route(request);
  });
}

function callsTo(method, pathname) {
  return global.fetch.mock.calls.filter(
    ([request]) => request.method === method && new URL(request.url).pathname === pathname,
  );
}

beforeEach(() => {
  global.fetch = jest.fn();
});

test('getSchoolYears gọi đúng GET /school-years', async () => {
  mockFetchRoutes({ 'GET /school-years': () => jsonResponse(200, [makeSchoolYear()]) });
  const store = makeStore();
  const result = await store.dispatch(schoolCalendarApi.endpoints.getSchoolYears.initiate());
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  expect(new URL(request.url).pathname).toBe('/school-years');
  expect(result.data).toEqual([makeSchoolYear()]);
});

test('getHolidays gọi đúng GET /school-years/:schoolYearId/holidays', async () => {
  mockFetchRoutes({ 'GET /school-years/y1/holidays': () => jsonResponse(200, [makeHoliday()]) });
  const store = makeStore();
  const result = await store.dispatch(schoolCalendarApi.endpoints.getHolidays.initiate('y1'));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  expect(new URL(request.url).pathname).toBe('/school-years/y1/holidays');
  expect(result.data).toEqual([makeHoliday()]);
});

test('getCalendarStats gọi đúng GET /school-years/:schoolYearId/calendar-stats và KHÔNG gửi asOf (backend mặc định hôm nay giờ VN)', async () => {
  mockFetchRoutes({ 'GET /school-years/y1/calendar-stats': () => jsonResponse(200, STATS) });
  const store = makeStore();
  const result = await store.dispatch(schoolCalendarApi.endpoints.getCalendarStats.initiate('y1'));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  const url = new URL(request.url);
  expect(url.pathname).toBe('/school-years/y1/calendar-stats');
  expect(url.search).toBe('');
  expect(result.data).toEqual(STATS);
});

test('createHoliday gọi đúng POST /holidays kèm đủ 5 trường', async () => {
  mockFetchRoutes({ 'POST /holidays': () => jsonResponse(201, makeHoliday()) });
  const store = makeStore();
  await store.dispatch(
    schoolCalendarApi.endpoints.createHoliday.initiate({
      schoolYearId: 'y1',
      name: 'Nghỉ lễ',
      type: 'LE',
      startDate: '2026-01-08',
      endDate: '2026-01-08',
    }),
  );
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('POST');
  expect(new URL(request.url).pathname).toBe('/holidays');
  expect(JSON.parse(request.body)).toEqual({
    schoolYearId: 'y1',
    name: 'Nghỉ lễ',
    type: 'LE',
    startDate: '2026-01-08',
    endDate: '2026-01-08',
  });
});

test('updateHoliday gọi đúng PATCH /holidays/:id; body không rò id/schoolYearId (schoolYearId chỉ để invalidate)', async () => {
  mockFetchRoutes({ 'PATCH /holidays/h1': () => jsonResponse(200, makeHoliday({ name: 'x' })) });
  const store = makeStore();
  await store.dispatch(
    schoolCalendarApi.endpoints.updateHoliday.initiate({ id: 'h1', schoolYearId: 'y1', name: 'x' }),
  );
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('PATCH');
  expect(new URL(request.url).pathname).toBe('/holidays/h1');
  expect(JSON.parse(request.body)).toEqual({ name: 'x' });

  global.fetch.mockClear();
  await store.dispatch(
    schoolCalendarApi.endpoints.updateHoliday.initiate({
      id: 'h1',
      schoolYearId: 'y1',
      name: 'Nghỉ Tết',
      type: 'KHAC',
      startDate: '2026-02-14',
      endDate: '2026-02-22',
    }),
  );
  expect(JSON.parse(global.fetch.mock.calls[0][0].body)).toEqual({
    name: 'Nghỉ Tết',
    type: 'KHAC',
    startDate: '2026-02-14',
    endDate: '2026-02-22',
  });
});

test('deleteHoliday gọi đúng DELETE /holidays/:id không kèm body và trả { deleted: true }', async () => {
  mockFetchRoutes({ 'DELETE /holidays/h1': () => jsonResponse(200, { deleted: true }) });
  const store = makeStore();
  const result = await store
    .dispatch(schoolCalendarApi.endpoints.deleteHoliday.initiate({ id: 'h1', schoolYearId: 'y1' }))
    .unwrap();
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('DELETE');
  expect(new URL(request.url).pathname).toBe('/holidays/h1');
  expect(request.body).toBeUndefined();
  expect(result).toEqual({ deleted: true });
});

const WRITES = [
  [
    'createHoliday',
    'POST /holidays',
    201,
    makeHoliday(),
    { schoolYearId: 'y1', name: 'Nghỉ lễ', type: 'LE', startDate: '2026-01-08', endDate: '2026-01-08' },
  ],
  ['updateHoliday', 'PATCH /holidays/h1', 200, makeHoliday({ name: 'Đổi tên' }), { id: 'h1', schoolYearId: 'y1', name: 'Đổi tên' }],
  ['deleteHoliday', 'DELETE /holidays/h1', 200, { deleted: true }, { id: 'h1', schoolYearId: 'y1' }],
];

test.each(WRITES)(
  '%s thành công: getHolidays và getCalendarStats của đúng năm học tự refetch, năm học khác thì không',
  async (endpointName, route, status, responseBody, arg) => {
    mockFetchRoutes({
      'GET /school-years/y1/holidays': () => jsonResponse(200, [makeHoliday()]),
      'GET /school-years/y1/calendar-stats': () => jsonResponse(200, STATS),
      'GET /school-years/y2/holidays': () => jsonResponse(200, []),
      'GET /school-years/y2/calendar-stats': () => jsonResponse(200, STATS),
      [route]: () => jsonResponse(status, responseBody),
    });
    const store = makeStore();
    const { getHolidays, getCalendarStats } = schoolCalendarApi.endpoints;
    await Promise.all([
      store.dispatch(getHolidays.initiate('y1')),
      store.dispatch(getCalendarStats.initiate('y1')),
      store.dispatch(getHolidays.initiate('y2')),
      store.dispatch(getCalendarStats.initiate('y2')),
    ]);

    await store.dispatch(schoolCalendarApi.endpoints[endpointName].initiate(arg)).unwrap();

    await waitFor(() => {
      expect(callsTo('GET', '/school-years/y1/holidays')).toHaveLength(2);
      expect(callsTo('GET', '/school-years/y1/calendar-stats')).toHaveLength(2);
    });
    expect(callsTo('GET', '/school-years/y2/holidays')).toHaveLength(1);
    expect(callsTo('GET', '/school-years/y2/calendar-stats')).toHaveLength(1);
  },
);

// Thông báo thật của backend: POST (và PATCH gửi đủ 2 ngày) đi qua ZodValidationPipe nên có tiền tố
// "Dữ liệu gửi lên không hợp lệ: "; PATCH chỉ gửi 1 ngày bị service chặn nên chỉ có câu trần.
const END_BEFORE_START = 'Ngày kết thúc không được trước ngày bắt đầu';
const REJECTED = [
  [
    'createHoliday',
    'POST /holidays',
    { schoolYearId: 'y1', name: 'Nghỉ', type: 'LE', startDate: '2026-01-10', endDate: '2026-01-09' },
    `Dữ liệu gửi lên không hợp lệ: ${END_BEFORE_START}`,
  ],
  ['updateHoliday', 'PATCH /holidays/h1', { id: 'h1', schoolYearId: 'y1', endDate: '2026-01-07' }, END_BEFORE_START],
];

test.each(REJECTED)(
  '%s lỗi 400: giữ nguyên error.data.message của backend qua .unwrap() (không bị nuốt)',
  async (endpointName, route, arg, message) => {
    mockFetchRoutes({
      [route]: () => jsonResponse(400, { statusCode: 400, error: 'Bad Request', message }),
    });
    const store = makeStore();

    await expect(store.dispatch(schoolCalendarApi.endpoints[endpointName].initiate(arg)).unwrap()).rejects.toMatchObject({
      status: 400,
      data: { message },
    });
  },
);
