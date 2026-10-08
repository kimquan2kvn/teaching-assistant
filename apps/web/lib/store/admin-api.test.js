import { makeStore } from './store';
import { adminApi } from './admin-api';

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

test('getTeachers gọi đúng GET /admin/teachers', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  const store = makeStore();
  await store.dispatch(adminApi.endpoints.getTeachers.initiate());
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  expect(request.url).toContain('/admin/teachers');
});

test('setTeacherActive(isActive:false) gọi đúng PATCH /admin/teachers/:id/active kèm body', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, { success: true }));
  const store = makeStore();
  await store.dispatch(adminApi.endpoints.setTeacherActive.initiate({ id: 't1', isActive: false }));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('PATCH');
  expect(request.url).toContain('/admin/teachers/t1/active');
  expect(JSON.parse(request.body)).toEqual({ isActive: false });
});

test('setTeacherActive(isActive:true) gọi đúng body ngược lại (test riêng, không gộp)', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, { success: true }));
  const store = makeStore();
  await store.dispatch(adminApi.endpoints.setTeacherActive.initiate({ id: 't1', isActive: true }));
  const request = global.fetch.mock.calls[0][0];
  expect(JSON.parse(request.body)).toEqual({ isActive: true });
});

test('getTeacherPositions gọi đúng GET /admin/teachers/:id/positions', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  const store = makeStore();
  await store.dispatch(adminApi.endpoints.getTeacherPositions.initiate('t1'));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  expect(request.url).toContain('/admin/teachers/t1/positions');
});

test('setTeacherActive thành công invalidate Teachers, làm getTeachers tự refetch', async () => {
  const store = makeStore();

  global.fetch.mockReturnValueOnce(jsonResponse(200, [{ id: 't1', isActive: true }]));
  await store.dispatch(adminApi.endpoints.getTeachers.initiate());

  global.fetch.mockReturnValueOnce(jsonResponse(200, { success: true }));
  global.fetch.mockReturnValueOnce(jsonResponse(200, [{ id: 't1', isActive: false }]));

  await store.dispatch(adminApi.endpoints.setTeacherActive.initiate({ id: 't1', isActive: false }));

  const teacherListCalls = global.fetch.mock.calls.filter(
    (c) => c[0].url.includes('/admin/teachers') && !c[0].url.includes('/positions') && !c[0].url.includes('/active'),
  );
  expect(teacherListCalls).toHaveLength(2);
});
