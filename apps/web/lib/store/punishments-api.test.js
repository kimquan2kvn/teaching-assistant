import { makeStore } from './store';
import { punishmentsApi } from './punishments-api';

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

test('getClassPunishments gọi đúng GET /classes/:classId/punishments không có status', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  const store = makeStore();
  await store.dispatch(punishmentsApi.endpoints.getClassPunishments.initiate({ classId: 'c1' }));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  expect(request.url).toContain('/classes/c1/punishments');
  expect(request.url).not.toContain('status=');
});

test('getClassPunishments gọi đúng GET /classes/:classId/punishments?status= khi có status', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  const store = makeStore();
  await store.dispatch(punishmentsApi.endpoints.getClassPunishments.initiate({ classId: 'c1', status: 'PENDING' }));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  expect(request.url).toContain('/classes/c1/punishments');
  expect(request.url).toContain('status=PENDING');
});

test('updatePunishmentStatus gọi đúng PATCH /punishments/:id/status kèm body {status}, không gửi classId', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, { _id: 'p1', status: 'SUBMITTED' }));
  const store = makeStore();
  await store.dispatch(
    punishmentsApi.endpoints.updatePunishmentStatus.initiate({ id: 'p1', classId: 'c1', status: 'SUBMITTED' }),
  );
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('PATCH');
  expect(request.url).toContain('/punishments/p1/status');
  expect(JSON.parse(request.body)).toEqual({ status: 'SUBMITTED' });
});

test('updatePunishmentLines gọi đúng PATCH /punishments/:id/lines kèm body {lines}, không gửi classId', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, { _id: 'p1', lines: 40 }));
  const store = makeStore();
  await store.dispatch(punishmentsApi.endpoints.updatePunishmentLines.initiate({ id: 'p1', classId: 'c1', lines: 40 }));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('PATCH');
  expect(request.url).toContain('/punishments/p1/lines');
  expect(JSON.parse(request.body)).toEqual({ lines: 40 });
});

test('updatePunishmentStatus thành công invalidate đúng Punishments của classId, làm getClassPunishments tự refetch', async () => {
  const store = makeStore();

  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  await store.dispatch(punishmentsApi.endpoints.getClassPunishments.initiate({ classId: 'c1' }));

  global.fetch.mockReturnValueOnce(jsonResponse(200, { _id: 'p1', status: 'SUBMITTED' }));
  global.fetch.mockReturnValueOnce(jsonResponse(200, [{ _id: 'p1', status: 'SUBMITTED' }]));

  await store.dispatch(
    punishmentsApi.endpoints.updatePunishmentStatus.initiate({ id: 'p1', classId: 'c1', status: 'SUBMITTED' }),
  );

  const listCalls = global.fetch.mock.calls.filter(
    (c) => c[0].url.includes('/classes/c1/punishments') && c[0].method === 'GET',
  );
  expect(listCalls).toHaveLength(2);
});

test('updatePunishmentStatus không ảnh hưởng cache Punishments của lớp khác (tag theo đúng classId)', async () => {
  const store = makeStore();

  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  await store.dispatch(punishmentsApi.endpoints.getClassPunishments.initiate({ classId: 'c2' }));

  global.fetch.mockReturnValueOnce(jsonResponse(200, { _id: 'p1', status: 'SUBMITTED' }));
  await store.dispatch(
    punishmentsApi.endpoints.updatePunishmentStatus.initiate({ id: 'p1', classId: 'c1', status: 'SUBMITTED' }),
  );

  const c2Calls = global.fetch.mock.calls.filter((c) => c[0].url.includes('/classes/c2/punishments'));
  expect(c2Calls).toHaveLength(1);
});
