# Nền tảng Frontend (Đăng nhập, Route bảo vệ, Kết nối API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Người dùng đăng nhập/đăng ký được thật, phiên sống sót qua reload, token tự refresh khi hết hạn giữa
chừng, route được bảo vệ, và sidebar sẵn sàng lọc theo role — nền tảng để các sub-project UI sau (lớp/học
sinh, điểm danh/vi phạm, PPCT/TKB) chỉ cần thêm trang + endpoint mới mà không phải lo lại phần auth.

**Architecture:** Access token sống trong Redux (bộ nhớ, không persist); refresh token là cookie `httpOnly` đã
có sẵn từ backend Phase 1. `apiSlice`'s `baseQuery` được bọc thêm `baseQueryWithReauth`: gặp `401` thì tự gọi
`/auth/refresh` (dùng 1 promise dùng chung để nhiều request 401 cùng lúc chỉ refresh 1 lần), thử lại request gốc
nếu thành công, xoá Redux state + điều hướng `/dang-nhap` nếu thất bại. `middleware.js` chặn nhanh ở edge dựa
theo sự tồn tại của cookie `refresh_token` (không đọc được access token, chỉ chặn người rõ ràng đã đăng xuất).

**Tech Stack:** Next.js 14 App Router (đã có), Redux Toolkit + RTK Query (đã có khung, chưa có endpoint), Jest +
React Testing Library (đã có, xem `sidebar.test.jsx`/`store.test.js`/`providers.test.jsx` để giữ đúng phong
cách test hiện tại của dự án).

**Spec:** [docs/superpowers/specs/2026-10-08-fe-foundation-auth-design.md](../specs/2026-10-08-fe-foundation-auth-design.md)

## Global Constraints

- Access token KHÔNG BAO GIỜ lưu vào `localStorage`/`sessionStorage` — chỉ lưu trong Redux state (bộ nhớ),
  theo đúng lý do bảo mật đã ghi trong spec (tránh lộ qua XSS).
- `fetchBaseQuery` phải có `credentials: 'include'` để trình duyệt gửi/nhận cookie `refresh_token` (web
  `:3000` gọi api `:3001`, khác origin ở dev).
- `/auth/refresh` (`AuthService.refresh()`) chỉ trả `{ accessToken, refreshToken }`, KHÔNG có `user` — mọi chỗ
  cần khôi phục `user` sau refresh phải gọi thêm `GET /auth/me`.
- Lỗi hiển thị cho người dùng (đăng nhập/đăng ký) phải là `error.data.message` nguyên văn từ backend, không
  được thay bằng message tự nghĩ (trừ khi hoàn toàn không có `error.data.message`, lúc đó mới dùng fallback
  chung chung).
- Route công khai (không bị middleware chặn): `/dang-nhap`, `/dang-ky`. Mọi route khác yêu cầu cookie
  `refresh_token`.
- Giữ đúng phong cách test hiện có: Jest + React Testing Library, mô tả test bằng tiếng Việt, `jest.mock` cho
  module phụ thuộc ngoài (xem `sidebar.test.jsx` mock `next/navigation`).

## Review Focus

- `middleware.js` chặn nhầm chính `/dang-nhap`/`/dang-ky` khi không có cookie → redirect vòng lặp vô hạn (mỗi
  lần redirect về `/dang-nhap` lại bị chính middleware chặn tiếp vì `/dang-nhap` "không phải route công khai"
  nếu so sánh path sai) — phải test rõ 2 route này KHÔNG bị redirect dù không có cookie. → test ở Task 4.
- Nhiều request cùng gặp `401` gần như đồng thời (vd 1 trang gọi 3 query cùng lúc, access token vừa hết hạn)
  chỉ được gọi `/auth/refresh` ĐÚNG 1 LẦN — nếu không có cơ chế dùng chung 1 promise, mỗi request tự refresh
  riêng sẽ sinh nhiều lần xoay vòng refresh token cùng lúc (y hệt bug đã gặp ở backend Phase 1A với 2 request
  refresh đồng thời). → test ở Task 2.
- Refresh thất bại (refresh token cũng hết hạn/bị thu hồi) phải XOÁ SẠCH Redux state (`accessToken`/`user` về
  `null`) trước khi điều hướng `/dang-nhap` — nếu chỉ điều hướng mà quên xoá state, quay lại trang cũ bằng nút
  Back của trình duyệt sẽ hiển thị tạm thời dữ liệu của phiên đã hết hạn trước khi middleware kịp chặn. → test ở
  Task 2.
- `Sidebar` lọc theo role phải mặc định ẨN mục có khai báo `roles` khi CHƯA BIẾT role (lúc `user` còn `null`,
  trước khi bước khôi phục phiên ở `Providers` chạy xong) — không chỉ ẩn khi role không khớp. Nếu lỡ coi
  "chưa biết role" là "role nào cũng qua được", người dùng sẽ thấy nháy 1 nhịp mục dành riêng cho ADMIN trước
  khi bị ẩn lại. → test ở Task 7.
- Thông báo lỗi đăng nhập/đăng ký phải đúng NGUYÊN VĂN message backend trả (vd đăng ký trùng username phải hiện
  đúng lỗi "Tên đăng nhập đã tồn tại" chứ không phải 1 message chung "Có lỗi xảy ra") — nếu component tự thay
  message, người dùng đăng ký trùng tên sẽ không hiểu vì sao thất bại. → test ở Task 5, Task 6.

---

## Task 1: `auth-slice` — reducer thật + selector

**Files:**
- Modify: `apps/web/lib/store/auth-slice.js`
- Test: `apps/web/lib/store/auth-slice.test.js` (mới)

**Interfaces:**
- Produces: `setCredentials({user, accessToken})` (action creator), `clearCredentials()` (action creator),
  `selectCurrentUser(state)` (trả `state.auth.user`), export mặc định `authReducer` (giữ nguyên, đã export) —
  Task 2 (`baseQueryWithReauth`), Task 3 (`Providers`), Task 5/6 (trang đăng nhập/đăng ký), Task 7 (`Sidebar`)
  đều dùng các export này.

- [ ] **Step 1: Viết test trước — `apps/web/lib/store/auth-slice.test.js`**

```js
import authReducer, { setCredentials, clearCredentials, selectCurrentUser } from './auth-slice';

const initialState = { user: null, accessToken: null };

test('setCredentials lưu đúng user và accessToken', () => {
  const user = { id: '1', username: 'gv1', fullName: 'Giáo viên 1', role: 'TEACHER' };
  const state = authReducer(initialState, setCredentials({ user, accessToken: 'abc' }));
  expect(state).toEqual({ user, accessToken: 'abc' });
});

test('clearCredentials reset về initial state', () => {
  const dirty = { user: { id: '1' }, accessToken: 'abc' };
  expect(authReducer(dirty, clearCredentials())).toEqual(initialState);
});

test('selectCurrentUser đọc đúng state.auth.user', () => {
  const user = { id: '1', role: 'ADMIN' };
  expect(selectCurrentUser({ auth: { user, accessToken: 'x' } })).toBe(user);
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL** (`pnpm --filter web run test -- auth-slice`)

- [ ] **Step 3: Implement trong `apps/web/lib/store/auth-slice.js`**

```js
import { createSlice } from '@reduxjs/toolkit';

const initialState = { user: null, accessToken: null };

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(state, action) {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
    },
    clearCredentials() {
      return initialState;
    },
  },
});

export const { setCredentials, clearCredentials } = authSlice.actions;
export const selectCurrentUser = (state) => state.auth.user;
export default authSlice.reducer;
```

- [ ] **Step 4: Chạy test — xác nhận PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/store/auth-slice.js apps/web/lib/store/auth-slice.test.js
git commit -m "feat(web): add real auth-slice reducers and selector"
```

---

## Task 2: `api-slice` — endpoint thật + tự động refresh khi 401

**Files:**
- Modify: `apps/web/lib/store/api-slice.js`
- Test: `apps/web/lib/store/api-slice.test.js` (mới)

**Interfaces:**
- Consumes: `setCredentials`/`clearCredentials` (Task 1).
- Produces: `apiSlice` (export đã có, nay có endpoint thật), hooks `useLoginMutation`, `useRegisterMutation`,
  `useRefreshMutation`, `useMeQuery`, `useLazyMeQuery`, `useLogoutMutation` — Task 3 (`Providers`) dùng
  `refresh`/`me` qua `apiSlice.endpoints.refresh.initiate()`/`apiSlice.endpoints.me.initiate()` (gọi tay, không
  qua hook, vì chạy trong `useEffect` không phải render); Task 5/6 dùng `useLoginMutation`/`useRegisterMutation`;
  Task 8 dùng `useLogoutMutation`.

- [ ] **Step 1: Viết test trước — `apps/web/lib/store/api-slice.test.js`**

(Dựng 1 store thật bằng `makeStore()`, mock `global.fetch` trả về `Response` giả theo từng kịch bản — đây là
cách RTK Query tự khuyến nghị test `baseQuery` tuỳ biến, không cần mock cả module `@reduxjs/toolkit/query`.)

```js
import { makeStore } from './store';
import { apiSlice } from './api-slice';

// `fetchBaseQuery` KHÔNG gọi `response.json()` — nó gọi `response.text()` (parse JSON thủ công bên trong) và
// còn gọi thêm `response.clone().text()` song song (để log lúc lỗi parse). Mock phải có đủ 2 method này, và
// field dùng để xét thành/bại là `status` (không phải `ok`). Tham số `global.fetch` nhận được là 1 `Request`
// object thật (không phải chuỗi URL) — dùng `request.url` để kiểm tra URL, không dùng `String(request)`.
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
```

(`jsdom` không có `window.location.href` gán được dễ dàng trong Jest mặc định — KHÔNG assert việc điều hướng ở
test này, chỉ assert Redux state đã bị xoá; việc điều hướng chỉ cần code có gọi, không cần test lại hành vi của
trình duyệt.)

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Implement trong `apps/web/lib/store/api-slice.js`**

```js
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { setCredentials, clearCredentials } from './auth-slice';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = getState().auth.accessToken;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return headers;
  },
});

let refreshPromise = null;

async function baseQueryWithReauth(args, api, extraOptions) {
  let result = await rawBaseQuery(args, api, extraOptions);
  if (result.error?.status === 401) {
    if (!refreshPromise) {
      refreshPromise = rawBaseQuery({ url: '/auth/refresh', method: 'POST' }, api, extraOptions).finally(() => {
        refreshPromise = null;
      });
    }
    const refreshResult = await refreshPromise;
    if (refreshResult.data) {
      api.dispatch(setCredentials({ user: api.getState().auth.user, accessToken: refreshResult.data.accessToken }));
      result = await rawBaseQuery(args, api, extraOptions);
    } else {
      api.dispatch(clearCredentials());
      if (typeof window !== 'undefined') window.location.href = '/dang-nhap';
    }
  }
  return result;
}

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: [],
  endpoints: (builder) => ({
    login: builder.mutation({ query: (body) => ({ url: '/auth/login', method: 'POST', body }) }),
    register: builder.mutation({ query: (body) => ({ url: '/auth/register', method: 'POST', body }) }),
    refresh: builder.mutation({ query: () => ({ url: '/auth/refresh', method: 'POST' }) }),
    me: builder.query({ query: () => '/auth/me' }),
    logout: builder.mutation({ query: () => ({ url: '/auth/logout', method: 'POST' }) }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useRefreshMutation,
  useMeQuery,
  useLazyMeQuery,
  useLogoutMutation,
} = apiSlice;
```

(`refreshPromise` là biến module-level, dùng chung cho mọi request — đây chính là cơ chế "1 promise dùng
chung" chống gọi `/auth/refresh` nhiều lần đồng thời nêu ở Review Focus. `.finally()` xoá promise ngay khi
refresh xong — kể cả thành công hay thất bại — để lần 401 TIẾP THEO (sau khi đã refresh xong 1 lần) được phép
thử refresh lại từ đầu, không bị kẹt vĩnh viễn vào promise cũ.)

- [ ] **Step 4: Chạy test — xác nhận PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/store/api-slice.js apps/web/lib/store/api-slice.test.js
git commit -m "feat(web): add real auth endpoints with 401 auto-refresh"
```

---

## Task 3: `Providers` — khôi phục phiên đăng nhập lúc mount

**Files:**
- Modify: `apps/web/components/providers.jsx`
- Modify: `apps/web/components/providers.test.jsx`

**Interfaces:**
- Consumes: `apiSlice.endpoints.refresh`/`apiSlice.endpoints.me` (Task 2), `setCredentials` (Task 1).
- Produces: không export gì mới — hành vi nội bộ của `Providers`.

- [ ] **Step 1: Thêm test trước — nối vào `apps/web/components/providers.test.jsx`**

```js
import { apiSlice } from '@/lib/store/api-slice';

// Cùng 1 helper mock như Task 2 (`api-slice.test.js`) — `fetchBaseQuery` đọc response qua `.text()`/
// `.clone().text()`, không phải `.json()`. Thêm `beforeEach` stub `global.fetch` trả 401 mặc định: từ task
// này trở đi, MỌI lần `Providers` được mount đều tự gọi `/auth/refresh` (xem Step 3) — bài test gốc
// "mỗi lần Providers được dựng tạo store riêng..." đã có từ trước trong file này sẽ gọi `fetch` thật nếu
// không stub, gây lỗi/cảnh báo promise reject không được bắt. Test đó không cần quan tâm tới auth nên 401 mặc
// định là đủ, các test MỚI dưới đây tự override bằng `mockReturnValueOnce` riêng.
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
  global.fetch = jest.fn().mockReturnValue(jsonResponse(401, {}));
});

test('lúc mount, gọi /auth/refresh rồi /auth/me để khôi phục phiên nếu cookie còn hạn', async () => {
  global.fetch = jest
    .fn()
    .mockReturnValueOnce(jsonResponse(200, { accessToken: 'restored-token' }))
    .mockReturnValueOnce(jsonResponse(200, { id: '1', username: 'gv1', role: 'TEACHER' }));

  let capturedStore;
  render(
    <Providers>
      <StoreProbe onStore={(s) => (capturedStore = s)} />
    </Providers>,
  );

  await waitFor(() => {
    expect(capturedStore.getState().auth.user).toEqual({ id: '1', username: 'gv1', role: 'TEACHER' });
  });
  expect(capturedStore.getState().auth.accessToken).toBe('restored-token');
});

test('refresh thất bại lúc mount thì auth vẫn giữ null, không gọi /auth/me', async () => {
  global.fetch = jest.fn().mockReturnValueOnce(jsonResponse(401, {}));

  let capturedStore;
  render(
    <Providers>
      <StoreProbe onStore={(s) => (capturedStore = s)} />
    </Providers>,
  );

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  expect(capturedStore.getState().auth).toEqual({ user: null, accessToken: null });
});
```

(Thêm `import { waitFor } from '@testing-library/react';` ở đầu file nếu chưa có; `StoreProbe` đã định nghĩa sẵn
trong file này từ trước.)

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Sửa `apps/web/components/providers.jsx`**

Thêm `useEffect` sau khi tạo `storeRef.current`, dispatch `refresh` rồi `me` nếu refresh thành công:

```jsx
useEffect(() => {
  const store = storeRef.current;
  store.dispatch(apiSlice.endpoints.refresh.initiate()).then((refreshResult) => {
    if ('data' in refreshResult && refreshResult.data) {
      store.dispatch(apiSlice.endpoints.me.initiate()).then((meResult) => {
        if ('data' in meResult && meResult.data) {
          store.dispatch(setCredentials({ user: meResult.data, accessToken: refreshResult.data.accessToken }));
        }
      });
    }
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

(Import thêm `useEffect` từ `react`, `apiSlice` từ `@/lib/store/api-slice`, `setCredentials` từ
`@/lib/store/auth-slice` ở đầu file.)

- [ ] **Step 4: Chạy test — xác nhận PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/providers.jsx apps/web/components/providers.test.jsx
git commit -m "feat(web): restore session on mount via refresh + me"
```

---

## Task 4: `middleware.js` — chặn route chưa đăng nhập

**Files:**
- Create: `apps/web/middleware.js`
- Test: `apps/web/middleware.test.js` (mới)

**Interfaces:** Không có interface nào task khác tiêu thụ — độc lập hoàn toàn với Task 1-3.

- [ ] **Step 1: Viết test trước — `apps/web/middleware.test.js`**

```js
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

test('có cookie refresh_token → không redirect (response không có header Location)', () => {
  const req = new NextRequest('http://localhost:3000/', {
    headers: { cookie: 'refresh_token=abc' },
  });
  const res = middleware(req);
  expect(res?.headers.get('location')).toBeNull();
});

test('không có cookie + route không công khai → redirect /dang-nhap', () => {
  const req = new NextRequest('http://localhost:3000/', { headers: {} });
  const res = middleware(req);
  expect(res?.headers.get('location')).toContain('/dang-nhap');
});

test.each(['/dang-nhap', '/dang-ky'])('không có cookie + %s → KHÔNG redirect (tránh vòng lặp)', (path) => {
  const req = new NextRequest(`http://localhost:3000${path}`, { headers: {} });
  const res = middleware(req);
  expect(res?.headers.get('location')).toBeNull();
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Implement `apps/web/middleware.js`**

```js
import { NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/dang-nhap', '/dang-ky'];

export function middleware(request) {
  const hasSession = request.cookies.has('refresh_token');
  const isPublicPath = PUBLIC_PATHS.includes(request.nextUrl.pathname);
  if (!hasSession && !isPublicPath) {
    return NextResponse.redirect(new URL('/dang-nhap', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next|favicon.ico).*)'] };
```

- [ ] **Step 4: Chạy test — xác nhận PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/middleware.js apps/web/middleware.test.js
git commit -m "feat(web): add middleware protecting routes without a session cookie"
```

---

## Task 5: Trang đăng nhập (`/dang-nhap`)

**Files:**
- Create: `apps/web/app/dang-nhap/page.jsx`
- Test: `apps/web/app/dang-nhap/page.test.jsx`

**Interfaces:**
- Consumes: `useLoginMutation` (Task 2), `setCredentials` (Task 1).
- Produces: không export gì mới — trang độc lập.

- [ ] **Step 1: Viết test trước — `apps/web/app/dang-nhap/page.test.jsx`**

(Mock `useLoginMutation` và `next/navigation`'s `useRouter`, render trong `<Provider store={makeStore()}>` —
không cần mock `useDispatch` vì dùng store thật.)

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { makeStore } from '@/lib/store/store';
import DangNhapPage from './page';

const pushMock = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

const loginMock = jest.fn();
jest.mock('@/lib/store/api-slice', () => ({
  ...jest.requireActual('@/lib/store/api-slice'),
  useLoginMutation: () => [loginMock, { isLoading: false }],
}));

beforeEach(() => {
  pushMock.mockClear();
  loginMock.mockClear();
});

test('submit đúng username/password gọi login mutation, thành công điều hướng về /', async () => {
  loginMock.mockReturnValue({
    unwrap: () =>
      Promise.resolve({ accessToken: 'abc', user: { id: '1', username: 'gv1', role: 'TEACHER' } }),
  });
  render(
    <Provider store={makeStore()}>
      <DangNhapPage />
    </Provider>,
  );
  await userEvent.type(screen.getByPlaceholderText('Tên đăng nhập'), 'gv1');
  await userEvent.type(screen.getByPlaceholderText('Mật khẩu'), 'MatKhau123');
  await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
  expect(loginMock).toHaveBeenCalledWith({ username: 'gv1', password: 'MatKhau123' });
  expect(pushMock).toHaveBeenCalledWith('/');
});

test('sai mật khẩu hiện ĐÚNG message backend trả, không phải message tự nghĩ', async () => {
  loginMock.mockReturnValue({
    unwrap: () => Promise.reject({ data: { message: 'Sai tên đăng nhập hoặc mật khẩu' } }),
  });
  render(
    <Provider store={makeStore()}>
      <DangNhapPage />
    </Provider>,
  );
  await userEvent.type(screen.getByPlaceholderText('Tên đăng nhập'), 'gv1');
  await userEvent.type(screen.getByPlaceholderText('Mật khẩu'), 'sai');
  await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
  expect(await screen.findByText('Sai tên đăng nhập hoặc mật khẩu')).toBeInTheDocument();
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Implement `apps/web/app/dang-nhap/page.jsx`**

```jsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { useLoginMutation } from '@/lib/store/api-slice';
import { setCredentials } from '@/lib/store/auth-slice';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function DangNhapPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [login, { isLoading }] = useLoginMutation();
  const dispatch = useDispatch();
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      const result = await login({ username, password }).unwrap();
      dispatch(setCredentials({ user: result.user, accessToken: result.accessToken }));
      router.push('/');
    } catch (err) {
      setError(err?.data?.message ?? 'Đăng nhập thất bại, vui lòng thử lại');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-24 flex max-w-sm flex-col gap-4 px-4">
      <h1 className="font-heading text-xl font-semibold">Đăng nhập</h1>
      <Input
        placeholder="Tên đăng nhập"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
      />
      <Input
        type="password"
        placeholder="Mật khẩu"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={isLoading}>
        Đăng nhập
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Chạy test — xác nhận PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dang-nhap
git commit -m "feat(web): add login page"
```

---

## Task 6: Trang đăng ký (`/dang-ky`)

**Files:**
- Create: `apps/web/app/dang-ky/page.jsx`
- Test: `apps/web/app/dang-ky/page.test.jsx`

**Interfaces:**
- Consumes: `useRegisterMutation` (Task 2), `setCredentials` (Task 1).

- [ ] **Step 1: Viết test trước — `apps/web/app/dang-ky/page.test.jsx`**

(Khuôn mẫu giống hệt Task 5, đổi `useLoginMutation` → `useRegisterMutation`, thêm field `fullName`.)

```jsx
test('đăng ký thành công điều hướng thẳng về / (không bắt đăng nhập lại)', async () => {
  registerMock.mockReturnValue({
    unwrap: () =>
      Promise.resolve({ accessToken: 'abc', user: { id: '1', username: 'gv2', role: 'TEACHER' } }),
  });
  render(
    <Provider store={makeStore()}>
      <DangKyPage />
    </Provider>,
  );
  await userEvent.type(screen.getByPlaceholderText('Tên đăng nhập'), 'gv2');
  await userEvent.type(screen.getByPlaceholderText('Họ và tên'), 'Giáo viên 2');
  await userEvent.type(screen.getByPlaceholderText('Mật khẩu'), 'MatKhau123');
  await userEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));
  expect(registerMock).toHaveBeenCalledWith({ username: 'gv2', fullName: 'Giáo viên 2', password: 'MatKhau123' });
  expect(pushMock).toHaveBeenCalledWith('/');
});

test('đăng ký trùng username hiện đúng message backend trả', async () => {
  registerMock.mockReturnValue({
    unwrap: () => Promise.reject({ data: { message: 'Tên đăng nhập đã tồn tại' } }),
  });
  // ... render + submit như trên ...
  expect(await screen.findByText('Tên đăng nhập đã tồn tại')).toBeInTheDocument();
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Implement `apps/web/app/dang-ky/page.jsx`**

(Giống cấu trúc `dang-nhap/page.jsx` ở Task 5, thêm field `fullName`, gọi `useRegisterMutation` với
`{ username, password, fullName }`, cùng logic `setCredentials` + `router.push('/')` khi thành công.)

- [ ] **Step 4: Chạy test — xác nhận PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dang-ky
git commit -m "feat(web): add register page"
```

---

## Task 7: Sidebar lọc theo role

**Files:**
- Modify: `apps/web/components/layout/nav-data.js`
- Modify: `apps/web/components/layout/sidebar.jsx`
- Modify: `apps/web/components/layout/sidebar.test.jsx`

**Interfaces:**
- Consumes: `selectCurrentUser` (Task 1).
- Produces: `NAV_GROUPS` items có thêm field tuỳ chọn `roles?: string[]` — sub-project 2 (UI Phase 1) sẽ thêm
  mục mới có `roles: ['ADMIN']` (vd "Quản lý giáo viên") dùng đúng field này.

- [ ] **Step 1: Thêm test trước — nối vào `apps/web/components/layout/sidebar.test.jsx`**

```jsx
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/lib/store/auth-slice';

function renderWithRole(role) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { user: role ? { id: '1', role } : null, accessToken: role ? 'x' : null } },
  });
  return render(
    <Provider store={store}>
      <Sidebar />
    </Provider>,
  );
}

test('mục có roles=["ADMIN"] ẨN với role TEACHER', () => {
  renderWithRole('TEACHER');
  expect(screen.queryByText('Mục chỉ ADMIN (test)')).not.toBeInTheDocument();
});

test('mục có roles=["ADMIN"] HIỆN với role ADMIN', () => {
  renderWithRole('ADMIN');
  expect(screen.getByText('Mục chỉ ADMIN (test)')).toBeInTheDocument();
});

test('mục có roles=["ADMIN"] ẨN khi chưa biết role (user=null, chưa khôi phục phiên xong)', () => {
  renderWithRole(null);
  expect(screen.queryByText('Mục chỉ ADMIN (test)')).not.toBeInTheDocument();
});
```

(3 test trên cần 1 mục test tạm có `roles: ['ADMIN']` và label `'Mục chỉ ADMIN (test)'` — thêm trực tiếp vào
`NAV_GROUPS` trong bước implement, KHÔNG dùng mục thật nào hiện có vì chưa có mục nào cần giới hạn role ở phase
này; để lại mục test này trong `nav-data.js` vì sub-project 2 sẽ thay nó bằng mục "Quản lý giáo viên" thật có
cùng `roles: ['ADMIN']` — nếu implementer thấy để mục test giả trong code sản phẩm không phù hợp, có thể thay
ngay bằng 1 mục ẩn/thật hợp lý hơn miễn vẫn giữ đúng 3 test trên pass.)

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Sửa `apps/web/components/layout/sidebar.jsx`**

```jsx
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '@/lib/store/auth-slice';
// ...
export function Sidebar({ className }) {
  const pathname = usePathname();
  const currentUser = useSelector(selectCurrentUser);

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || (currentUser && item.roles.includes(currentUser.role))),
  })).filter((group) => group.items.length > 0);

  return (
    <nav ...>
      {visibleGroups.map(...)}
    </nav>
  );
}
```

- [ ] **Step 4: Chạy test — xác nhận PASS** (cả 3 test mới lẫn 3 test cũ của `sidebar.test.jsx`)

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/layout/nav-data.js apps/web/components/layout/sidebar.jsx apps/web/components/layout/sidebar.test.jsx
git commit -m "feat(web): filter sidebar items by current user role"
```

---

## Task 8: Nút đăng xuất ở header

**Files:**
- Create: `apps/web/components/layout/user-menu.jsx`
- Test: `apps/web/components/layout/user-menu.test.jsx`
- Modify: `apps/web/app/layout.jsx` (thêm `<UserMenu />` vào header, cạnh `<SearchBox />`)

**Interfaces:**
- Consumes: `selectCurrentUser` (Task 1), `useLogoutMutation` (Task 2), `clearCredentials` (Task 1).

- [ ] **Step 1: Viết test trước — `apps/web/components/layout/user-menu.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/lib/store/auth-slice';
import { UserMenu } from './user-menu';

const logoutMock = jest.fn(() => ({ unwrap: () => Promise.resolve({ success: true }) }));
jest.mock('@/lib/store/api-slice', () => ({
  ...jest.requireActual('@/lib/store/api-slice'),
  useLogoutMutation: () => [logoutMock, { isLoading: false }],
}));

function renderLoggedIn() {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { user: { id: '1', fullName: 'Giáo viên 1', role: 'TEACHER' }, accessToken: 'x' } },
  });
  return { store, ...render(<Provider store={store}><UserMenu /></Provider>) };
}

test('hiển thị đúng tên người dùng hiện tại', () => {
  renderLoggedIn();
  expect(screen.getByText('Giáo viên 1')).toBeInTheDocument();
});

test('bấm Đăng xuất gọi logout mutation và xoá Redux state', async () => {
  const { store } = renderLoggedIn();
  await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
  expect(logoutMock).toHaveBeenCalled();
  expect(store.getState().auth).toEqual({ user: null, accessToken: null });
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

- [ ] **Step 3: Implement `apps/web/components/layout/user-menu.jsx`**

```jsx
'use client';

import { useDispatch, useSelector } from 'react-redux';
import { useRouter } from 'next/navigation';
import { selectCurrentUser, clearCredentials } from '@/lib/store/auth-slice';
import { useLogoutMutation } from '@/lib/store/api-slice';
import { Button } from '@/components/ui/button';

export function UserMenu() {
  const user = useSelector(selectCurrentUser);
  const [logout] = useLogoutMutation();
  const dispatch = useDispatch();
  const router = useRouter();

  if (!user) return null;

  async function handleLogout() {
    try {
      await logout().unwrap();
    } finally {
      dispatch(clearCredentials());
      router.push('/dang-nhap');
    }
  }

  return (
    <div className="ml-auto flex items-center gap-3">
      <span className="text-sm text-fg">{user.fullName}</span>
      <Button variant="ghost" size="sm" onClick={handleLogout}>
        Đăng xuất
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Chạy test — xác nhận PASS**

- [ ] **Step 5: Thêm `<UserMenu />` vào header trong `apps/web/app/layout.jsx`** (cạnh `<SearchBox />`, cùng
  `<header>`)

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/layout/user-menu.jsx apps/web/components/layout/user-menu.test.jsx apps/web/app/layout.jsx
git commit -m "feat(web): add logout button to header"
```

---

## Task 9: Verify toàn bộ + báo cáo

**Files:** không tạo/sửa file nguồn — chỉ verify.

- [ ] **Step 1: Chạy toàn bộ monorepo từ root**

```bash
nvm use 20
pnpm install --frozen-lockfile
pnpm run lint
pnpm run build
pnpm run test
```

Expected: cả 4 lệnh PASS (lưu ý `pnpm run build` build thật Next.js — nếu middleware/route mới có lỗi cú pháp
sẽ lộ ra ở bước này, không chỉ ở `next lint`).

- [ ] **Step 2: Không phải code — báo cáo lại cho người dùng: những gì đã làm, kết quả test, rồi chờ duyệt
  trước khi sang sub-project 2 (UI Phase 1).**

---

## Tổng kết Self-Review

- **Spec coverage:** đăng nhập (Task 5), đăng ký (Task 6), giữ phiên qua reload (Task 3), tự động refresh khi
  401 (Task 2), đăng xuất (Task 8), route bảo vệ (Task 4), sidebar lọc role (Task 7) — đủ 7 mục phạm vi của
  spec.
  "Ngoài phạm vi" của spec (`mustChangePassword`, đổi mật khẩu chủ động, đồng bộ nhiều tab) đúng là không có
  task nào — khớp với spec.
- **Step scan:** mỗi step pin đúng tên hàm/test cụ thể; phần JSX của `dang-ky/page.jsx` ở Task 6 để "giống Task
  5" thay vì chép lại nguyên văn, vì đó đúng là bản sao gần như y hệt chỉ khác field — tránh lặp 1 khối code
  dài không quyết định gì mới.
- **Type consistency:** `setCredentials({user, accessToken})` dùng nhất quán đúng shape này xuyên suốt Task 1,
  2, 3, 5, 6, 8 — không đổi tên field giữa các task.
- **Review Focus:** cả 5 mục (redirect vòng lặp ở `/dang-nhap`/`/dang-ky`, refresh dùng chung 1 promise, xoá
  state khi refresh thất bại, ẩn mục role khi chưa biết role, message lỗi nguyên văn backend) đều có test cụ
  thể ở đúng task sở hữu.
- **Proportion:** Task 6 cố tình không viết lại toàn bộ JSX (tham chiếu lại Task 5) để tránh file dài hơn mức
  cần thiết; các task còn lại code mẫu là chính bản implementation tối thiểu (hàm ngắn, không có phần nào "còn
  phải tự nghĩ thêm" ngoài import path).
