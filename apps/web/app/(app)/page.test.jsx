import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/lib/store/auth-slice';
import DashboardPage from './page';

const getMyPositionsMock = jest.fn();
jest.mock('@/lib/store/positions-api', () => ({
  ...jest.requireActual('@/lib/store/positions-api'),
  useGetMyPositionsQuery: (...args) => getMyPositionsMock(...args),
}));

// Dashboard của lớp (khi chỉ có đúng 1 lớp) nhúng thẳng `ClassDashboardContent` từ trang `bang-dieu-khien` —
// mock tối giản để test trang chủ không phụ thuộc chi tiết implementation của khối đó (đã có test riêng ở
// page.test.jsx của chính trang bang-dieu-khien).
jest.mock('./lop-hoc/[classId]/bang-dieu-khien/page', () => ({
  ClassDashboardContent: ({ classId }) => <div data-testid="class-dashboard-content">dashboard:{classId}</div>,
}));

function renderPage() {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { user: { id: 'teacher-1', role: 'TEACHER' }, accessToken: 'token' } },
  });
  return render(
    <Provider store={store}>
      <DashboardPage />
    </Provider>,
  );
}

beforeEach(() => {
  getMyPositionsMock.mockReset();
});

test('0 lớp: giữ nguyên CTA (tạo lớp mới / tham gia bằng mã lớp), không render dashboard nào (test hồi quy)', () => {
  getMyPositionsMock.mockReturnValue({ data: [], isLoading: false, error: undefined });

  renderPage();

  expect(screen.getByRole('link', { name: 'Tạo lớp mới' })).toHaveAttribute('href', '/lop-hoc/tao-moi');
  expect(screen.getByRole('link', { name: 'Tham gia bằng mã lớp' })).toHaveAttribute('href', '/lop-hoc/tham-gia');
  expect(screen.queryByTestId('class-dashboard-content')).not.toBeInTheDocument();
});

test('lỗi tải danh sách lớp: hiện thông báo lỗi, không nhầm sang CTA 0 lớp hay dashboard', () => {
  getMyPositionsMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    error: { status: 500, data: { message: 'Không tải được danh sách lớp, vui lòng thử lại' } },
  });

  renderPage();

  expect(screen.getByText('Không tải được danh sách lớp, vui lòng thử lại')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Tạo lớp mới' })).not.toBeInTheDocument();
  expect(screen.queryByTestId('class-dashboard-content')).not.toBeInTheDocument();
});

test('đúng 1 lớp (dedupe theo class.id khi giữ nhiều vị trí cùng 1 lớp): nhúng thẳng dashboard của lớp đó', () => {
  getMyPositionsMock.mockReturnValue({
    data: [
      { id: 'pos-1', type: 'HOMEROOM', subject: null, class: { id: 'class-1', code: 'ABC123', name: 'Lớp 10A1' } },
      { id: 'pos-2', type: 'SUBJECT', subject: 'Toán', class: { id: 'class-1', code: 'ABC123', name: 'Lớp 10A1' } },
    ],
    isLoading: false,
    error: undefined,
  });

  renderPage();

  expect(screen.getByText('Lớp 10A1')).toBeInTheDocument();
  expect(screen.getByTestId('class-dashboard-content')).toHaveTextContent('dashboard:class-1');
  expect(screen.queryByRole('link', { name: 'Tạo lớp mới' })).not.toBeInTheDocument();
});

test('nhiều lớp: hiện danh sách chọn lớp (style PositionCard), KHÔNG tự ý chọn đại 1 lớp', () => {
  getMyPositionsMock.mockReturnValue({
    data: [
      { id: 'pos-1', type: 'HOMEROOM', subject: null, class: { id: 'class-1', code: 'ABC123', name: 'Lớp 10A1' } },
      { id: 'pos-2', type: 'HOMEROOM', subject: null, class: { id: 'class-2', code: 'XYZ789', name: 'Lớp 11B2' } },
    ],
    isLoading: false,
    error: undefined,
  });

  renderPage();

  expect(screen.getByText('Chọn lớp để xem bảng điều khiển')).toBeInTheDocument();
  expect(screen.getByText('Lớp 10A1')).toBeInTheDocument();
  expect(screen.getByText('Lớp 11B2')).toBeInTheDocument();
  expect(
    screen.getAllByRole('link').filter((a) => a.getAttribute('href') === '/lop-hoc/class-1/bang-dieu-khien'),
  ).toHaveLength(1);
  expect(
    screen.getAllByRole('link').filter((a) => a.getAttribute('href') === '/lop-hoc/class-2/bang-dieu-khien'),
  ).toHaveLength(1);
  expect(screen.queryByTestId('class-dashboard-content')).not.toBeInTheDocument();
});
