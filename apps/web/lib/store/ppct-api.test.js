import { waitFor } from '@testing-library/react';
import { makeStore } from './store';
import { ppctApi } from './ppct-api';
import { makePpctItem } from '../test-fixtures/phase3';

// Mẫu thật của 1 dòng preview (ppct-import.ts ở backend): week/periodCount là null khi ô sai, note luôn là chuỗi.
const PREVIEW_ROW = {
  rowNumber: 2,
  week: 1,
  title: 'Bài 1',
  periodCount: 1,
  periodLabel: '1',
  requirement: '',
  note: '',
  errors: [],
};
const COMMIT_ROW = { week: 1, periodLabel: '1', title: 'Bài 1', periodCount: 1, requirement: '' };

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

test('getPositionPpct gọi đúng GET /positions/:positionId/ppct', async () => {
  mockFetchRoutes({ 'GET /positions/p1/ppct': () => jsonResponse(200, [makePpctItem()]) });
  const store = makeStore();
  const result = await store.dispatch(ppctApi.endpoints.getPositionPpct.initiate('p1'));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  expect(new URL(request.url).pathname).toBe('/positions/p1/ppct');
  expect(result.data).toEqual([makePpctItem()]);
});

test('createPpctItem gọi đúng POST /positions/:positionId/ppct; body không rò positionId', async () => {
  mockFetchRoutes({ 'POST /positions/p1/ppct': () => jsonResponse(201, makePpctItem()) });
  const store = makeStore();
  await store.dispatch(ppctApi.endpoints.createPpctItem.initiate({ positionId: 'p1', ...COMMIT_ROW, note: 'Ghi chú' }));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('POST');
  expect(new URL(request.url).pathname).toBe('/positions/p1/ppct');
  expect(JSON.parse(request.body)).toEqual({ ...COMMIT_ROW, note: 'Ghi chú' });
});

// PATCH {note:''} xóa được ghi chú (backend lưu chuỗi rỗng); vắng khóa note thì giữ ghi chú cũ — nên slice không
// được tự lọc bỏ giá trị rỗng khỏi body.
test('updatePpctItem gọi đúng PATCH /positions/:positionId/ppct/:itemId; body không rò positionId/itemId và giữ nguyên note rỗng', async () => {
  mockFetchRoutes({ 'PATCH /positions/p1/ppct/i1': () => jsonResponse(200, makePpctItem({ note: '' })) });
  const store = makeStore();
  await store.dispatch(ppctApi.endpoints.updatePpctItem.initiate({ positionId: 'p1', itemId: 'i1', note: '' }));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('PATCH');
  expect(new URL(request.url).pathname).toBe('/positions/p1/ppct/i1');
  expect(JSON.parse(request.body)).toEqual({ note: '' });

  global.fetch.mockClear();
  await store.dispatch(
    ppctApi.endpoints.updatePpctItem.initiate({ positionId: 'p1', itemId: 'i1', title: 'Bài mới', periodCount: 2 }),
  );
  expect(JSON.parse(global.fetch.mock.calls[0][0].body)).toEqual({ title: 'Bài mới', periodCount: 2 });
});

test('deletePpctItem gọi đúng DELETE /positions/:positionId/ppct/:itemId không kèm body và trả { deleted: true }', async () => {
  mockFetchRoutes({ 'DELETE /positions/p1/ppct/i1': () => jsonResponse(200, { deleted: true }) });
  const store = makeStore();
  const result = await store
    .dispatch(ppctApi.endpoints.deletePpctItem.initiate({ positionId: 'p1', itemId: 'i1' }))
    .unwrap();
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('DELETE');
  expect(new URL(request.url).pathname).toBe('/positions/p1/ppct/i1');
  expect(request.body).toBeUndefined();
  expect(result).toEqual({ deleted: true });
});

test('importPpctCommit gọi đúng POST /positions/:positionId/ppct/import/commit kèm { rows } và trả danh sách mục đã tạo', async () => {
  mockFetchRoutes({
    'POST /positions/p1/ppct/import/commit': () => jsonResponse(201, [makePpctItem(), makePpctItem({ _id: 'i2', order: 2 })]),
  });
  const store = makeStore();
  const rows = [COMMIT_ROW, { ...COMMIT_ROW, week: 2, title: 'Bài 2' }];
  const result = await store.dispatch(ppctApi.endpoints.importPpctCommit.initiate({ positionId: 'p1', rows })).unwrap();
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('POST');
  expect(new URL(request.url).pathname).toBe('/positions/p1/ppct/import/commit');
  expect(JSON.parse(request.body)).toEqual({ rows });
  expect(result).toHaveLength(2);
});

test('importPpctPreview gửi body là FormData (không phải JSON) kèm field file và trả { rows }', async () => {
  mockFetchRoutes({ 'POST /positions/p1/ppct/import/preview': () => jsonResponse(201, { rows: [PREVIEW_ROW] }) });
  const store = makeStore();
  const file = new File(['x'], 'ppct.xlsx');
  const result = await store.dispatch(ppctApi.endpoints.importPpctPreview.initiate({ positionId: 'p1', file })).unwrap();
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('POST');
  expect(new URL(request.url).pathname).toBe('/positions/p1/ppct/import/preview');
  expect(request.body).toBeInstanceOf(FormData);
  expect(request.body.get('file')).toBe(file);
  expect(result).toEqual({ rows: [PREVIEW_ROW] });
});

const WRITES = [
  ['createPpctItem', 'POST /positions/p1/ppct', 201, makePpctItem(), { positionId: 'p1', ...COMMIT_ROW }],
  [
    'updatePpctItem',
    'PATCH /positions/p1/ppct/i1',
    200,
    makePpctItem({ title: 'Bài mới' }),
    { positionId: 'p1', itemId: 'i1', title: 'Bài mới' },
  ],
  ['deletePpctItem', 'DELETE /positions/p1/ppct/i1', 200, { deleted: true }, { positionId: 'p1', itemId: 'i1' }],
  ['importPpctCommit', 'POST /positions/p1/ppct/import/commit', 201, [makePpctItem()], { positionId: 'p1', rows: [COMMIT_ROW] }],
];

test.each(WRITES)(
  '%s thành công: getPositionPpct của đúng vị trí tự refetch, vị trí khác thì không',
  async (endpointName, route, status, responseBody, arg) => {
    mockFetchRoutes({
      'GET /positions/p1/ppct': () => jsonResponse(200, [makePpctItem()]),
      'GET /positions/p2/ppct': () => jsonResponse(200, []),
      [route]: () => jsonResponse(status, responseBody),
    });
    const store = makeStore();
    await Promise.all([
      store.dispatch(ppctApi.endpoints.getPositionPpct.initiate('p1')),
      store.dispatch(ppctApi.endpoints.getPositionPpct.initiate('p2')),
    ]);

    await store.dispatch(ppctApi.endpoints[endpointName].initiate(arg)).unwrap();

    await waitFor(() => expect(callsTo('GET', '/positions/p1/ppct')).toHaveLength(2));
    expect(callsTo('GET', '/positions/p2/ppct')).toHaveLength(1);
  },
);

test('importPpctPreview chỉ đọc file: không làm query nào refetch (ghi thật như createPpctItem thì có)', async () => {
  mockFetchRoutes({
    'GET /positions/p1/ppct': () => jsonResponse(200, [makePpctItem()]),
    'POST /positions/p1/ppct/import/preview': () => jsonResponse(201, { rows: [PREVIEW_ROW] }),
    'POST /positions/p1/ppct': () => jsonResponse(201, makePpctItem()),
  });
  const store = makeStore();
  await store.dispatch(ppctApi.endpoints.getPositionPpct.initiate('p1'));

  await store
    .dispatch(ppctApi.endpoints.importPpctPreview.initiate({ positionId: 'p1', file: new File(['x'], 'ppct.xlsx') }))
    .unwrap();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(callsTo('GET', '/positions/p1/ppct')).toHaveLength(1);

  await store.dispatch(ppctApi.endpoints.createPpctItem.initiate({ positionId: 'p1', ...COMMIT_ROW })).unwrap();
  await waitFor(() => expect(callsTo('GET', '/positions/p1/ppct')).toHaveLength(2));
});

const REJECTED = [
  [
    'createPpctItem',
    'POST /positions/p1/ppct',
    409,
    'Dữ liệu đã tồn tại, không thể ghi trùng',
    { positionId: 'p1', ...COMMIT_ROW },
  ],
  [
    'importPpctPreview',
    'POST /positions/p1/ppct/import/preview',
    400,
    'File không đúng định dạng Excel (.xlsx)',
    { positionId: 'p1', file: new File(['x'], 'ppct.xlsx') },
  ],
];

test.each(REJECTED)(
  '%s bị backend từ chối: giữ nguyên error.data.message qua .unwrap() (không bị nuốt)',
  async (endpointName, route, status, message, arg) => {
    mockFetchRoutes({ [route]: () => jsonResponse(status, { statusCode: status, message }) });
    const store = makeStore();

    await expect(store.dispatch(ppctApi.endpoints[endpointName].initiate(arg)).unwrap()).rejects.toMatchObject({
      status,
      data: { message },
    });
  },
);
