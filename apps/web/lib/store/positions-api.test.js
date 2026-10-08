import { makeStore } from './store';
import { positionsApi } from './positions-api';
import { classesApi } from './classes-api';

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

test('getMyPositions gọi đúng GET /positions/mine', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  const store = makeStore();
  await store.dispatch(positionsApi.endpoints.getMyPositions.initiate());
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  expect(request.url).toContain('/positions/mine');
});

test('joinPosition gọi đúng POST /positions/join kèm body', async () => {
  global.fetch.mockReturnValueOnce(
    jsonResponse(201, { _id: 'p1', classId: 'c1', type: 'SUBJECT', subject: 'Toán', holderId: 'u1' }),
  );
  const store = makeStore();
  await store.dispatch(positionsApi.endpoints.joinPosition.initiate({ code: '10A1-ABCDE', type: 'SUBJECT', subject: 'Toán' }));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('POST');
  expect(request.url).toContain('/positions/join');
  expect(JSON.parse(request.body)).toEqual({ code: '10A1-ABCDE', type: 'SUBJECT', subject: 'Toán' });
});

test('releasePosition gọi đúng POST /positions/:id/release', async () => {
  global.fetch.mockReturnValueOnce(
    jsonResponse(201, { _id: 'p1', classId: 'c1', type: 'SUBJECT', subject: 'Toán', holderId: null }),
  );
  const store = makeStore();
  await store.dispatch(positionsApi.endpoints.releasePosition.initiate('p1'));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('POST');
  expect(request.url).toContain('/positions/p1/release');
});

test('reassignPosition gọi đúng PATCH /positions/:id/reassign kèm teacherId trong body', async () => {
  global.fetch.mockReturnValueOnce(
    jsonResponse(200, { _id: 'p1', classId: 'c1', type: 'SUBJECT', subject: 'Toán', holderId: 'u2' }),
  );
  const store = makeStore();
  await store.dispatch(
    positionsApi.endpoints.reassignPosition.initiate({
      positionId: 'p1',
      teacherId: 'u2',
      classId: 'c1',
      oldTeacherId: 'u1',
    }),
  );
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('PATCH');
  expect(request.url).toContain('/positions/p1/reassign');
  expect(JSON.parse(request.body)).toEqual({ teacherId: 'u2' });
});

test('joinPosition thành công làm getMyPositions tự refetch (đếm số lần fetch /positions/mine tăng)', async () => {
  const store = makeStore();

  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  await store.dispatch(positionsApi.endpoints.getMyPositions.initiate());

  global.fetch.mockReturnValueOnce(
    jsonResponse(201, { _id: 'p1', classId: 'c1', type: 'SUBJECT', subject: 'Toán', holderId: 'u1' }),
  );
  global.fetch.mockReturnValueOnce(jsonResponse(200, [{ id: 'p1', type: 'SUBJECT', subject: 'Toán', class: { id: 'c1' } }]));

  await store.dispatch(positionsApi.endpoints.joinPosition.initiate({ code: '10A1-ABCDE', type: 'SUBJECT', subject: 'Toán' }));

  const minePositionCalls = global.fetch.mock.calls.filter((c) => c[0].url.includes('/positions/mine'));
  expect(minePositionCalls).toHaveLength(2);
});

test('joinPosition thành công invalidate đúng ClassDetail của classId trả về, làm getClassDetail tự refetch', async () => {
  const store = makeStore();

  global.fetch.mockReturnValueOnce(jsonResponse(200, { class: { id: 'c1' }, positions: [] }));
  await store.dispatch(classesApi.endpoints.getClassDetail.initiate('c1'));

  global.fetch.mockReturnValueOnce(
    jsonResponse(201, { _id: 'p1', classId: 'c1', type: 'SUBJECT', subject: 'Toán', holderId: 'u1' }),
  );
  global.fetch.mockReturnValueOnce(jsonResponse(200, { class: { id: 'c1' }, positions: [] }));

  await store.dispatch(positionsApi.endpoints.joinPosition.initiate({ code: '10A1-ABCDE', type: 'SUBJECT', subject: 'Toán' }));

  const classDetailCalls = global.fetch.mock.calls.filter((c) => c[0].url.includes('/classes/c1/detail'));
  expect(classDetailCalls).toHaveLength(2);
});

test('joinPosition lỗi 409 không bị nuốt, error.data.message giữ nguyên', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(409, { message: 'Vị trí này đã có người giữ hoặc không tồn tại' }));
  const store = makeStore();
  const result = await store.dispatch(
    positionsApi.endpoints.joinPosition.initiate({ code: '10A1-ABCDE', type: 'SUBJECT', subject: 'Toán' }),
  );
  expect(result.error.status).toBe(409);
  expect(result.error.data).toEqual({ message: 'Vị trí này đã có người giữ hoặc không tồn tại' });
});
