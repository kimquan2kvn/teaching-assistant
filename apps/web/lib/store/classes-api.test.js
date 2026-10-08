import { makeStore } from './store';
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

test('createClass gọi đúng POST /classes kèm body', async () => {
  global.fetch.mockReturnValueOnce(
    jsonResponse(201, { class: { _id: 'c1', code: '10A1-ABCDE', name: '10A1' }, positions: [] }),
  );
  const store = makeStore();
  await store.dispatch(classesApi.endpoints.createClass.initiate({ name: '10A1', claimHomeroom: true }));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('POST');
  expect(request.url).toContain('/classes');
  expect(JSON.parse(request.body)).toEqual({ name: '10A1', claimHomeroom: true });
});

test('getClassByCode gọi đúng GET /classes/:code', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, { class: { code: '10A1-ABCDE' }, positions: [] }));
  const store = makeStore();
  await store.dispatch(classesApi.endpoints.getClassByCode.initiate('10A1-ABCDE'));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  expect(request.url).toContain('/classes/10A1-ABCDE');
});

test('getClassByCode trả lỗi 404 giữ nguyên error.data.message', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(404, { message: 'Không tìm thấy lớp với mã này' }));
  const store = makeStore();
  const result = await store.dispatch(classesApi.endpoints.getClassByCode.initiate('khong-ton-tai'));
  expect(result.error.data).toEqual({ message: 'Không tìm thấy lớp với mã này' });
});

test('getClassDetail gọi đúng GET /classes/:classId/detail', async () => {
  global.fetch.mockReturnValueOnce(
    jsonResponse(200, { class: { id: 'c1', code: '10A1-ABCDE', name: '10A1' }, positions: [] }),
  );
  const store = makeStore();
  await store.dispatch(classesApi.endpoints.getClassDetail.initiate('c1'));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  expect(request.url).toContain('/classes/c1/detail');
});
