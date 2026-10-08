import { makeStore } from './store';
import { apiSlice } from './api-slice';

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

test('request thường (không 401) không gọi /auth/refresh', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, { id: '1', username: 'gv1' }));
  const store = makeStore();
  await store.dispatch(apiSlice.endpoints.me.initiate());
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('401 → tự gọi /auth/refresh → refresh thành công → thử lại request gốc thành công', async () => {
  global.fetch
    .mockReturnValueOnce(jsonResponse(401, { message: 'hết hạn' })) // request gốc lần 1
    .mockReturnValueOnce(jsonResponse(200, { accessToken: 'new-token' })) // /auth/refresh
    .mockReturnValueOnce(jsonResponse(200, { id: '1', username: 'gv1' })); // request gốc lần 2 (retry)
  const store = makeStore();
  const result = await store.dispatch(apiSlice.endpoints.me.initiate());
  expect(result.data).toEqual({ id: '1', username: 'gv1' });
  expect(global.fetch).toHaveBeenCalledTimes(3);
  const refreshRequest = global.fetch.mock.calls[1][0];
  expect(refreshRequest.url).toContain('/auth/refresh');
});

test('2 request cùng 401 gần như đồng thời chỉ gọi /auth/refresh đúng 1 lần', async () => {
  global.fetch
    .mockReturnValueOnce(jsonResponse(401, {})) // request A lần 1
    .mockReturnValueOnce(jsonResponse(401, {})) // request B lần 1
    .mockReturnValueOnce(jsonResponse(200, { accessToken: 'new-token' })) // /auth/refresh (dùng chung)
    .mockReturnValueOnce(jsonResponse(200, { id: 'a' })) // request A retry
    .mockReturnValueOnce(jsonResponse(200, { id: 'b' })); // request B retry
  const store = makeStore();
  await Promise.all([
    store.dispatch(apiSlice.endpoints.me.initiate(undefined, { forceRefetch: true })),
    store.dispatch(apiSlice.endpoints.me.initiate(undefined, { forceRefetch: true })),
  ]);
  const refreshCalls = global.fetch.mock.calls.filter((c) => c[0].url.includes('/auth/refresh'));
  expect(refreshCalls).toHaveLength(1);
});

test('refresh thất bại → xoá Redux state (auth về null)', async () => {
  global.fetch
    .mockReturnValueOnce(jsonResponse(401, {})) // request gốc
    .mockReturnValueOnce(jsonResponse(401, { message: 'Refresh token không hợp lệ' })); // /auth/refresh thất bại
  const store = makeStore();
  store.dispatch({ type: 'auth/setCredentials', payload: { user: { id: '1' }, accessToken: 'old' } });
  await store.dispatch(apiSlice.endpoints.me.initiate());
  expect(store.getState().auth).toEqual({ user: null, accessToken: null });
});

test('gọi thẳng /auth/refresh và chính nó trả 401 thì không tự gọi lại refresh thêm lần nữa', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(401, { message: 'Refresh token không hợp lệ' }));
  const store = makeStore();
  await store.dispatch(apiSlice.endpoints.refresh.initiate());
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
