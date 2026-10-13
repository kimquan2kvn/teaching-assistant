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

// Các endpoint này tự thân đã là "chưa đăng nhập": 1 lỗi 401 từ chính chúng nghĩa là sai thông tin đăng
// nhập/đăng ký (hoặc refresh token đã hết hạn), KHÔNG PHẢI access token hết hạn giữa chừng. Nếu đi qua nhánh
// "thử refresh rồi gọi lại request gốc" như mọi endpoint khác, 1 lần sai mật khẩu sẽ kích hoạt gọi thêm
// /auth/refresh (luôn thất bại vì chưa đăng nhập), rồi điều hướng khỏi trang trước khi người dùng kịp đọc
// thông báo lỗi thật — y hệt bug phát hiện khi review.
const NO_REAUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

async function baseQueryWithReauth(args, api, extraOptions) {
  let result = await rawBaseQuery(args, api, extraOptions);
  const requestUrl = typeof args === 'string' ? args : args.url;
  if (result.error?.status === 401 && !NO_REAUTH_PATHS.includes(requestUrl)) {
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
      api.dispatch(apiSlice.util.resetApiState());
      if (typeof window !== 'undefined') window.location.href = '/dang-nhap';
    }
  }
  return result;
}

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    'MyPositions',
    'ClassDetail',
    'Students',
    'Teachers',
    'TeacherPositions',
    'PositionAttendance',
    'ClassAttendanceSummary',
    'ConductCatalog',
    'ConductLogs',
    'ConductRating',
    'Punishments',
    'Dashboard',
    'SchoolYears',
    'Holidays',
    'CalendarStats',
    'TimetableSlots',
    'PpctItems',
    'LessonLogs',
    'TeacherWeek',
  ],
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
