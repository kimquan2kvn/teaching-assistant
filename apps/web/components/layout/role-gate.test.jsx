import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { setCredentials } from '@/lib/store/auth-slice';
import { RoleGate } from './role-gate';

const DENIED_TEXT = 'Bạn không có quyền xem trang này';
const CHILD_TEXT = 'Nội dung trang giáo viên';

function makeStore(role) {
  return configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { user: role ? { id: 'u1', role } : null, accessToken: role ? 'token' : null } },
  });
}

// Probe là mock đếm số lần children THẬT SỰ được render: hook query bên trong children chỉ chạy khi component chạy,
// nên "bị chặn" phải nghĩa là Probe chưa từng được gọi (không phải chỉ là bị ẩn).
function renderGate({ role, roles = ['TEACHER'], denied } = {}) {
  const store = makeStore(role);
  const Probe = jest.fn(() => <p>{CHILD_TEXT}</p>);
  const utils = render(
    <Provider store={store}>
      <RoleGate roles={roles} denied={denied}>
        <Probe />
      </RoleGate>
    </Provider>,
  );
  return { Probe, store, ...utils };
}

test('user chưa tải (null) → "Đang tải..." dạng role=status; KHÔNG hiện từ chối, KHÔNG render children', () => {
  const { Probe } = renderGate({ role: null });
  expect(screen.getByRole('status')).toHaveTextContent('Đang tải...');
  expect(screen.queryByText(DENIED_TEXT)).not.toBeInTheDocument();
  expect(screen.queryByText(CHILD_TEXT)).not.toBeInTheDocument();
  expect(Probe).not.toHaveBeenCalled();
});

test('role nằm trong roles → hiện children', () => {
  const { Probe } = renderGate({ role: 'TEACHER', roles: ['TEACHER'] });
  expect(screen.getByText(CHILD_TEXT)).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByText(DENIED_TEXT)).not.toBeInTheDocument();
  expect(Probe).toHaveBeenCalled();
});

test('roles có nhiều vai trò: ADMIN thuộc ["TEACHER", "ADMIN"] → hiện children', () => {
  renderGate({ role: 'ADMIN', roles: ['TEACHER', 'ADMIN'] });
  expect(screen.getByText(CHILD_TEXT)).toBeInTheDocument();
});

test.each(['ADMIN', 'STUDENT'])(
  '%s vào trang chỉ dành cho TEACHER → câu từ chối mặc định, children KHÔNG được render',
  (role) => {
    const { Probe } = renderGate({ role, roles: ['TEACHER'] });
    expect(screen.getByText(DENIED_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(CHILD_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(Probe).not.toHaveBeenCalled();
  },
);

test('có denied → hiện denied thay câu mặc định; children vẫn KHÔNG được render', () => {
  const { Probe } = renderGate({ role: 'ADMIN', denied: <p>Trang này chỉ dành cho giáo viên</p> });
  expect(screen.getByText('Trang này chỉ dành cho giáo viên')).toBeInTheDocument();
  expect(screen.queryByText(DENIED_TEXT)).not.toBeInTheDocument();
  expect(Probe).not.toHaveBeenCalled();
});

test('denied={null} nghĩa là bị từ chối thì không hiện gì (không rơi về câu mặc định)', () => {
  const { container, Probe } = renderGate({ role: 'ADMIN', denied: null });
  expect(screen.queryByText(DENIED_TEXT)).not.toBeInTheDocument();
  expect(container).toBeEmptyDOMElement();
  expect(Probe).not.toHaveBeenCalled();
});

test('user về muộn (Providers khôi phục phiên bất đồng bộ): từ "Đang tải..." sang children khi store có user đúng vai trò', () => {
  const { Probe, store } = renderGate({ role: null });
  expect(Probe).not.toHaveBeenCalled();

  act(() => {
    store.dispatch(setCredentials({ user: { id: 'u1', role: 'TEACHER' }, accessToken: 'token' }));
  });

  expect(screen.getByText(CHILD_TEXT)).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('user về muộn nhưng sai vai trò: từ "Đang tải..." sang câu từ chối, children không bao giờ được render', () => {
  const { Probe, store } = renderGate({ role: null });

  act(() => {
    store.dispatch(setCredentials({ user: { id: 'u2', role: 'ADMIN' }, accessToken: 'token' }));
  });

  expect(screen.getByText(DENIED_TEXT)).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(Probe).not.toHaveBeenCalled();
});
