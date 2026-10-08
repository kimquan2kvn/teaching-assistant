import { makeStore } from './store';
import { dashboardApi } from './dashboard-api';
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

const DASHBOARD_PAYLOAD = {
  attendanceSummary: { PRESENT: 2, EXCUSED: 0, LATE: 1, UNEXCUSED: 0 },
  recentConductLogs: [{ _id: 'log-1', studentId: 's1', points: -5, note: 'Trễ', date: '2026-10-08T00:00:00.000Z' }],
  conductRating: [{ studentId: 's1', score: 95, label: 'Giỏi' }],
  pendingPunishments: [
    { _id: 'pu-1', studentId: 's1', reason: 'Đủ 2 vi phạm trong tuần', lines: 20, dueDate: '2026-10-15T00:00:00.000Z', status: 'PENDING' },
  ],
};

beforeEach(() => {
  global.fetch = jest.fn();
});

test('getClassDashboard gọi đúng GET /classes/:classId/dashboard?date= và trả đủ 4 khối', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, DASHBOARD_PAYLOAD));
  const store = makeStore();
  const result = await store.dispatch(
    dashboardApi.endpoints.getClassDashboard.initiate({ classId: 'c1', date: '2026-10-08' }),
  );
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  expect(request.url).toContain('/classes/c1/dashboard');
  expect(request.url).toContain('date=2026-10-08');
  expect(result.data).toEqual(DASHBOARD_PAYLOAD);
});

test('đổi date gọi lại query (cache key khác theo date)', async () => {
  const store = makeStore();

  global.fetch.mockReturnValueOnce(jsonResponse(200, DASHBOARD_PAYLOAD));
  await store.dispatch(dashboardApi.endpoints.getClassDashboard.initiate({ classId: 'c1', date: '2026-10-08' }));

  global.fetch.mockReturnValueOnce(jsonResponse(200, { ...DASHBOARD_PAYLOAD, attendanceSummary: { PRESENT: 3, EXCUSED: 0, LATE: 0, UNEXCUSED: 0 } }));
  await store.dispatch(dashboardApi.endpoints.getClassDashboard.initiate({ classId: 'c1', date: '2026-10-09' }));

  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('lỗi trả về giữ nguyên error.data.message (vd không có quyền xem lớp)', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(403, { message: 'Forbidden resource' }));
  const store = makeStore();
  const result = await store.dispatch(
    dashboardApi.endpoints.getClassDashboard.initiate({ classId: 'c1', date: '2026-10-08' }),
  );
  expect(result.error.status).toBe(403);
  expect(result.error.data).toEqual({ message: 'Forbidden resource' });
});

test('markAttendance (attendance-api) thành công invalidate đúng Dashboard của classId, làm getClassDashboard tự refetch', async () => {
  const store = makeStore();

  global.fetch.mockReturnValueOnce(jsonResponse(200, DASHBOARD_PAYLOAD));
  await store.dispatch(dashboardApi.endpoints.getClassDashboard.initiate({ classId: 'c1', date: '2026-10-08' }));

  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  global.fetch.mockReturnValueOnce(jsonResponse(200, DASHBOARD_PAYLOAD));

  await store.dispatch(
    attendanceApi.endpoints.markAttendance.initiate({
      positionId: 'p1',
      classId: 'c1',
      date: '2026-10-08',
      entries: [{ studentId: 's1', status: 'LATE' }],
    }),
  );

  const dashboardCalls = global.fetch.mock.calls.filter(
    (c) => c[0].url.includes('/classes/c1/dashboard') && c[0].method === 'GET',
  );
  expect(dashboardCalls).toHaveLength(2);
});

test('getClassDashboard không ảnh hưởng cache Dashboard của lớp khác (tag theo đúng classId)', async () => {
  const store = makeStore();

  global.fetch.mockReturnValueOnce(jsonResponse(200, DASHBOARD_PAYLOAD));
  await store.dispatch(dashboardApi.endpoints.getClassDashboard.initiate({ classId: 'c2', date: '2026-10-08' }));

  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  await store.dispatch(
    attendanceApi.endpoints.markAttendance.initiate({
      positionId: 'p1',
      classId: 'c1',
      date: '2026-10-08',
      entries: [],
    }),
  );

  const c2Calls = global.fetch.mock.calls.filter((c) => c[0].url.includes('/classes/c2/dashboard'));
  expect(c2Calls).toHaveLength(1);
});
