import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/lib/store/auth-slice';
import { apiSlice } from '@/lib/store/api-slice';
import { UserMenu } from './user-menu';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const logoutMock = jest.fn(() => ({ unwrap: () => Promise.resolve({ success: true }) }));
jest.mock('@/lib/store/api-slice', () => ({
  ...jest.requireActual('@/lib/store/api-slice'),
  useLogoutMutation: () => [logoutMock, { isLoading: false }],
}));

function renderLoggedIn() {
  const store = configureStore({
    reducer: { auth: authReducer, [apiSlice.reducerPath]: apiSlice.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(apiSlice.middleware),
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

test('bấm Đăng xuất cũng xoá cache RTK Query, không để lộ dữ liệu phiên cũ cho người đăng nhập sau', async () => {
  const { store } = renderLoggedIn();
  await store.dispatch(apiSlice.util.upsertQueryData('me', undefined, { id: '1', username: 'nguoi-cu' }));
  expect(apiSlice.endpoints.me.select()(store.getState()).data).toEqual({ id: '1', username: 'nguoi-cu' });

  await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));

  expect(apiSlice.endpoints.me.select()(store.getState()).data).toBeUndefined();
});
