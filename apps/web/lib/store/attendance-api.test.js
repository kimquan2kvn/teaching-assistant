import { makeStore } from './store';
import { attendanceApi } from './attendance-api';

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

test('getPositionAttendance gọi đúng GET /positions/:positionId/attendance?date=', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  const store = makeStore();
  await store.dispatch(
    attendanceApi.endpoints.getPositionAttendance.initiate({ positionId: 'p1', date: '2026-10-09' }),
  );
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  expect(request.url).toContain('/positions/p1/attendance');
  expect(request.url).toContain('date=2026-10-09');
});

test('markAttendance gọi đúng PUT /positions/:positionId/attendance?date= kèm body entries', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  const store = makeStore();
  const entries = [{ studentId: 's1', status: 'UNEXCUSED' }];
  await store.dispatch(
    attendanceApi.endpoints.markAttendance.initiate({
      positionId: 'p1',
      classId: 'c1',
      date: '2026-10-09',
      entries,
    }),
  );
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('PUT');
  expect(request.url).toContain('/positions/p1/attendance');
  expect(request.url).toContain('date=2026-10-09');
  expect(JSON.parse(request.body)).toEqual({ entries });
});

test('getClassAttendanceSummary gọi đúng GET /classes/:classId/attendance/summary?date=', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, { PRESENT: 0, EXCUSED: 0, LATE: 0, UNEXCUSED: 0 }));
  const store = makeStore();
  await store.dispatch(
    attendanceApi.endpoints.getClassAttendanceSummary.initiate({ classId: 'c1', date: '2026-10-09' }),
  );
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  expect(request.url).toContain('/classes/c1/attendance/summary');
  expect(request.url).toContain('date=2026-10-09');
});

test('markAttendance thành công invalidate đúng PositionAttendance của positionId, làm getPositionAttendance tự refetch', async () => {
  const store = makeStore();

  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  await store.dispatch(attendanceApi.endpoints.getPositionAttendance.initiate({ positionId: 'p1', date: '2026-10-09' }));

  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  global.fetch.mockReturnValueOnce(jsonResponse(200, [{ studentId: 's1', status: 'UNEXCUSED' }]));

  await store.dispatch(
    attendanceApi.endpoints.markAttendance.initiate({
      positionId: 'p1',
      classId: 'c1',
      date: '2026-10-09',
      entries: [{ studentId: 's1', status: 'UNEXCUSED' }],
    }),
  );

  const positionAttendanceCalls = global.fetch.mock.calls.filter(
    (c) => c[0].url.includes('/positions/p1/attendance') && c[0].method === 'GET',
  );
  expect(positionAttendanceCalls).toHaveLength(2);
});

test('markAttendance không ảnh hưởng cache PositionAttendance của vị trí khác (tag theo đúng positionId)', async () => {
  const store = makeStore();

  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  await store.dispatch(attendanceApi.endpoints.getPositionAttendance.initiate({ positionId: 'p2', date: '2026-10-09' }));

  global.fetch.mockReturnValueOnce(jsonResponse(200, []));

  await store.dispatch(
    attendanceApi.endpoints.markAttendance.initiate({
      positionId: 'p1',
      classId: 'c1',
      date: '2026-10-09',
      entries: [],
    }),
  );

  const p2Calls = global.fetch.mock.calls.filter((c) => c[0].url.includes('/positions/p2/attendance'));
  expect(p2Calls).toHaveLength(1);
});

test('markAttendance thành công invalidate ClassAttendanceSummary của đúng classId, làm getClassAttendanceSummary tự refetch', async () => {
  const store = makeStore();

  global.fetch.mockReturnValueOnce(jsonResponse(200, { PRESENT: 3, EXCUSED: 0, LATE: 0, UNEXCUSED: 0 }));
  await store.dispatch(attendanceApi.endpoints.getClassAttendanceSummary.initiate({ classId: 'c1', date: '2026-10-09' }));

  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  global.fetch.mockReturnValueOnce(jsonResponse(200, { PRESENT: 2, EXCUSED: 0, LATE: 0, UNEXCUSED: 1 }));

  await store.dispatch(
    attendanceApi.endpoints.markAttendance.initiate({
      positionId: 'p1',
      classId: 'c1',
      date: '2026-10-09',
      entries: [{ studentId: 's1', status: 'UNEXCUSED' }],
    }),
  );

  const summaryCalls = global.fetch.mock.calls.filter(
    (c) => c[0].url.includes('/classes/c1/attendance/summary') && c[0].method === 'GET',
  );
  expect(summaryCalls).toHaveLength(2);
});
