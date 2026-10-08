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
