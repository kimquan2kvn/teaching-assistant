import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/lib/store/auth-slice';
import ClassDetailPage from './page';

const getClassDetailQueryMock = jest.fn();
jest.mock('@/lib/store/classes-api', () => ({
  ...jest.requireActual('@/lib/store/classes-api'),
  useGetClassDetailQuery: (...args) => getClassDetailQueryMock(...args),
}));

const releasePositionMock = jest.fn();
jest.mock('@/lib/store/positions-api', () => ({
  ...jest.requireActual('@/lib/store/positions-api'),
  useReleasePositionMutation: () => [releasePositionMock, { isLoading: false }],
}));

function renderPage({ userId = 'teacher-1', classId = 'class-1' } = {}) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { user: { id: userId, role: 'TEACHER' }, accessToken: 'token' } },
  });
  return render(
    <Provider store={store}>
      <ClassDetailPage params={{ classId }} />
    </Provider>,
  );
}

beforeEach(() => {
  getClassDetailQueryMock.mockReset();
  releasePositionMock.mockReset();
  releasePositionMock.mockReturnValue({ unwrap: () => Promise.resolve({}) });
});

test('hiện tên lớp, mã lớp và danh sách vị trí (loại + người giữ hoặc Trống)', () => {
  getClassDetailQueryMock.mockReturnValue({
    data: {
      class: { id: 'class-1', code: 'ABC123', name: 'Lớp 10A1' },
      positions: [
        { id: 'pos-1', type: 'HOMEROOM', subject: null, holder: { id: 'teacher-1', fullName: 'Nguyễn Văn A' } },
        { id: 'pos-2', type: 'SUBJECT', subject: 'Toán', holder: null },
      ],
    },
    isLoading: false,
    isError: false,
    error: undefined,
  });

  renderPage();

  expect(screen.getByText('Lớp 10A1')).toBeInTheDocument();
  expect(screen.getByText('ABC123')).toBeInTheDocument();
  expect(screen.getByText('Chủ nhiệm')).toBeInTheDocument();
  expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
  expect(screen.getByText('Toán')).toBeInTheDocument();
  expect(screen.getByText('Trống')).toBeInTheDocument();
});

test('nút "Ngừng phụ trách" CHỈ hiện ở đúng vị trí currentUser đang giữ, không hiện ở vị trí người khác giữ', () => {
  getClassDetailQueryMock.mockReturnValue({
    data: {
      class: { id: 'class-1', code: 'ABC123', name: 'Lớp 10A1' },
      positions: [
        { id: 'pos-1', type: 'HOMEROOM', subject: null, holder: { id: 'teacher-1', fullName: 'Nguyễn Văn A' } },
        { id: 'pos-2', type: 'SUBJECT', subject: 'Toán', holder: { id: 'teacher-2', fullName: 'Trần Thị B' } },
      ],
    },
    isLoading: false,
    isError: false,
    error: undefined,
  });

  renderPage({ userId: 'teacher-1' });

  const buttons = screen.getAllByRole('button', { name: 'Ngừng phụ trách' });
  expect(buttons).toHaveLength(1);
  const row = buttons[0].closest('li');
  expect(row).toHaveTextContent('Nguyễn Văn A');
  expect(row).not.toHaveTextContent('Trần Thị B');
});

test('bấm "Ngừng phụ trách" mở dialog xác nhận, bấm Xác nhận gọi đúng releasePosition(positionId)', async () => {
  getClassDetailQueryMock.mockReturnValue({
    data: {
      class: { id: 'class-1', code: 'ABC123', name: 'Lớp 10A1' },
      positions: [
        { id: 'pos-1', type: 'HOMEROOM', subject: null, holder: { id: 'teacher-1', fullName: 'Nguyễn Văn A' } },
        { id: 'pos-2', type: 'SUBJECT', subject: 'Toán', holder: { id: 'teacher-1', fullName: 'Nguyễn Văn A' } },
      ],
    },
    isLoading: false,
    isError: false,
    error: undefined,
  });

  renderPage({ userId: 'teacher-1' });

  const buttons = screen.getAllByRole('button', { name: 'Ngừng phụ trách' });
  expect(buttons).toHaveLength(2);

  // Bấm nút của vị trí thứ 2 (pos-2) — phải gọi đúng positionId của HÀNG NÀY, không phải hàng đầu (pos-1),
  // dễ sai nếu dialog dùng chung 1 state nhưng không gắn đúng positionId theo từng hàng.
  await userEvent.click(buttons[1]);
  expect(await screen.findByRole('dialog')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
  expect(releasePositionMock).toHaveBeenCalledWith('pos-2');
});

test('query trả lỗi 403 hiện đúng copy "không có quyền", không hiện bảng vị trí rỗng', () => {
  getClassDetailQueryMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
    error: { status: 403, data: { message: 'Forbidden resource' } },
  });

  renderPage();

  expect(screen.getByText('Bạn không có quyền xem lớp này')).toBeInTheDocument();
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  expect(screen.queryByText('Trống')).not.toBeInTheDocument();
});

test('query trả lỗi 404 hiện "Không tìm thấy lớp"', () => {
  getClassDetailQueryMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
    error: { status: 404, data: { message: 'Không tìm thấy lớp' } },
  });

  renderPage();

  expect(screen.getByText('Không tìm thấy lớp')).toBeInTheDocument();
});
