import { makeStore } from './store';
import { conductRatingApi } from './conduct-rating-api';

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

test('getClassConductRating gọi đúng GET /classes/:classId/conduct-rating?date=', async () => {
  global.fetch.mockReturnValueOnce(
    jsonResponse(200, [{ studentId: 's1', score: 100, label: 'Xuất sắc' }]),
  );
  const store = makeStore();
  await store.dispatch(
    conductRatingApi.endpoints.getClassConductRating.initiate({ classId: 'c1', date: '2026-10-08' }),
  );
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  expect(request.url).toContain('/classes/c1/conduct-rating?date=2026-10-08');
});

test('đổi date gọi lại query (cache key khác theo date) và giữ đúng kết quả', async () => {
  const store = makeStore();

  global.fetch.mockReturnValueOnce(
    jsonResponse(200, [{ studentId: 's1', score: 100, label: 'Xuất sắc' }]),
  );
  const first = await store.dispatch(
    conductRatingApi.endpoints.getClassConductRating.initiate({ classId: 'c1', date: '2026-10-08' }),
  );
  expect(first.data).toEqual([{ studentId: 's1', score: 100, label: 'Xuất sắc' }]);

  global.fetch.mockReturnValueOnce(
    jsonResponse(200, [{ studentId: 's1', score: 85, label: 'Khá' }]),
  );
  const second = await store.dispatch(
    conductRatingApi.endpoints.getClassConductRating.initiate({ classId: 'c1', date: '2026-10-15' }),
  );
  expect(second.data).toEqual([{ studentId: 's1', score: 85, label: 'Khá' }]);
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('lỗi trả về giữ nguyên error.data.message (vd mã lớp không hợp lệ)', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(400, { message: 'Mã lớp không hợp lệ' }));
  const store = makeStore();
  const result = await store.dispatch(
    conductRatingApi.endpoints.getClassConductRating.initiate({ classId: 'xxx', date: '2026-10-08' }),
  );
  expect(result.error.status).toBe(400);
  expect(result.error.data).toEqual({ message: 'Mã lớp không hợp lệ' });
});
