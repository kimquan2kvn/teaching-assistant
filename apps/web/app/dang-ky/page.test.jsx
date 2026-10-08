import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { makeStore } from '@/lib/store/store';
import DangKyPage from './page';

const pushMock = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

const registerMock = jest.fn();
jest.mock('@/lib/store/api-slice', () => ({
  ...jest.requireActual('@/lib/store/api-slice'),
  useRegisterMutation: () => [registerMock, { isLoading: false }],
}));

beforeEach(() => {
  pushMock.mockClear();
  registerMock.mockClear();
});

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
  render(
    <Provider store={makeStore()}>
      <DangKyPage />
    </Provider>,
  );
  await userEvent.type(screen.getByPlaceholderText('Tên đăng nhập'), 'gv2');
  await userEvent.type(screen.getByPlaceholderText('Họ và tên'), 'Giáo viên 2');
  await userEvent.type(screen.getByPlaceholderText('Mật khẩu'), 'MatKhau123');
  await userEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));
  expect(await screen.findByText('Tên đăng nhập đã tồn tại')).toBeInTheDocument();
});
