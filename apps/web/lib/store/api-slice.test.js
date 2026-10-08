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

test.each([
  ['login', () => apiSlice.endpoints.login.initiate({ username: 'gv1', password: 'sai' })],
  ['register', () => apiSlice.endpoints.register.initiate({ username: 'gv1', password: 'x', fullName: 'A' })],
])(
  '%s trả 401 không tự gọi lại /auth/refresh, trả thẳng lỗi gốc cho caller',
  async (_name, buildAction) => {
    global.fetch.mockReturnValueOnce(jsonResponse(401, { message: 'Sai tên đăng nhập hoặc mật khẩu' }));
    const store = makeStore();
    const result = await store.dispatch(buildAction());
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.error.data).toEqual({ message: 'Sai tên đăng nhập hoặc mật khẩu' });
  },
);

test('refresh thất bại thì xoá luôn cache RTK Query, không giữ dữ liệu phiên cũ', async () => {
  global.fetch
    .mockReturnValueOnce(jsonResponse(200, { id: '1', username: 'gv1' })) // me lần đầu thành công → có cache
    .mockReturnValueOnce(jsonResponse(401, {})) // me lần 2 → 401
    .mockReturnValueOnce(jsonResponse(401, { message: 'hết hạn' })); // refresh thất bại
  const store = makeStore();
  await store.dispatch(apiSlice.endpoints.me.initiate());
  expect(apiSlice.endpoints.me.select()(store.getState()).data).toEqual({ id: '1', username: 'gv1' });

  await store.dispatch(apiSlice.endpoints.me.initiate(undefined, { forceRefetch: true }));

  expect(apiSlice.endpoints.me.select()(store.getState()).data).toBeUndefined();
});

test('tagTypes có đủ các tag Phase 2 (điểm danh, vi phạm, xếp loại, chép phạt, dashboard) cho Bước 2-6 dùng', async () => {
  // RTK Query tự console.error "Tag type 'X' was used, but not specified in `tagTypes`!" (dev build) nếu 1
  // endpoint dùng providesTags với tag CHƯA khai báo — dùng chính cơ chế này để chứng minh tagTypes mới đã
  // đăng ký đúng, thay vì chỉ đoán theo tên biến.
  const newTagTypes = [
    'PositionAttendance',
    'ClassAttendanceSummary',
    'ConductCatalog',
    'ConductLogs',
    'ConductRating',
    'Punishments',
    'Dashboard',
  ];
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  global.fetch = jest.fn().mockReturnValue(
    Promise.resolve({
      status: 200,
      text: () => Promise.resolve('{}'),
      clone() {
        return { text: () => Promise.resolve('{}') };
      },
    }),
  );
  const probeApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
      __probePhase2Tags: builder.query({
        query: () => '/__probe',
        providesTags: newTagTypes.map((type) => ({ type, id: 'LIST' })),
      }),
    }),
    overrideExisting: true,
  });
  const store = makeStore();
  await store.dispatch(probeApi.endpoints.__probePhase2Tags.initiate());
  for (const type of newTagTypes) {
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining(`Tag type '${type}' was used`));
  }
  errorSpy.mockRestore();
});
