import { makeStore } from './store';
import { conductLogApi } from './conduct-log-api';

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

test('createConductLog gọi đúng POST /positions/:positionId/conduct-logs, KHÔNG gửi positionId/classId trong body', async () => {
  global.fetch.mockReturnValueOnce(
    jsonResponse(201, { conductLog: { _id: 'cl1', points: -5 }, punishments: [] }),
  );
  const store = makeStore();
  await store.dispatch(
    conductLogApi.endpoints.createConductLog.initiate({
      positionId: 'p1',
      classId: 'c1',
      studentId: 's1',
      catalogItemId: 'ci1',
    }),
  );
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('POST');
  expect(request.url).toContain('/positions/p1/conduct-logs');
  expect(JSON.parse(request.body)).toEqual({ studentId: 's1', catalogItemId: 'ci1' });
});

test('getClassConductLogs không truyền studentId gọi đúng GET /classes/:classId/conduct-logs (không có query studentId)', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  const store = makeStore();
  await store.dispatch(conductLogApi.endpoints.getClassConductLogs.initiate({ classId: 'c1' }));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  expect(request.url).toContain('/classes/c1/conduct-logs');
  expect(request.url).not.toContain('studentId');
});

test('getClassConductLogs truyền studentId gọi đúng GET kèm query studentId', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  const store = makeStore();
  await store.dispatch(
    conductLogApi.endpoints.getClassConductLogs.initiate({ classId: 'c1', studentId: 's1' }),
  );
  const request = global.fetch.mock.calls[0][0];
  expect(request.url).toContain('/classes/c1/conduct-logs');
  expect(request.url).toContain('studentId=s1');
});

test('createConductLog thành công invalidate đúng ConductLogs/ConductRating/Punishments/Dashboard của classId truyền vào', async () => {
  const store = makeStore();

  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  await store.dispatch(conductLogApi.endpoints.getClassConductLogs.initiate({ classId: 'c1' }));

  global.fetch.mockReturnValueOnce(
    jsonResponse(201, { conductLog: { _id: 'cl1', points: -5 }, punishments: [] }),
  );
  global.fetch.mockReturnValueOnce(jsonResponse(200, [{ _id: 'cl1', points: -5 }]));

  await store.dispatch(
    conductLogApi.endpoints.createConductLog.initiate({
      positionId: 'p1',
      classId: 'c1',
      studentId: 's1',
      kind: 'VIOLATION',
      points: 5,
      note: 'x',
    }),
  );

  const logCalls = global.fetch.mock.calls.filter(
    (c) => c[0].url.includes('/classes/c1/conduct-logs') && c[0].method === 'GET',
  );
  expect(logCalls).toHaveLength(2);
});

test('createConductLog lỗi 400 vượt giới hạn điểm không bị nuốt, error.data.message giữ nguyên', async () => {
  global.fetch.mockReturnValueOnce(
    jsonResponse(400, {
      message:
        'Dữ liệu gửi lên không hợp lệ: Điểm vượt quá giới hạn cho phép theo loại (vi phạm tối đa 50, điểm cộng tối đa 30)',
    }),
  );
  const store = makeStore();
  const result = await store.dispatch(
    conductLogApi.endpoints.createConductLog.initiate({
      positionId: 'p1',
      classId: 'c1',
      studentId: 's1',
      kind: 'VIOLATION',
      points: 60,
      note: 'x',
    }),
  );
  expect(result.error.status).toBe(400);
  expect(result.error.data.message).toContain('tối đa 50');
});
