import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/lib/store/auth-slice';
import { apiSlice } from '@/lib/store/api-slice';
import ViPhamPage from './page';

jest.mock('next/navigation', () => ({ useParams: () => ({ classId: 'class-1' }) }));

const getClassConductLogsMock = jest.fn();
jest.mock('@/lib/store/conduct-log-api', () => ({
  ...jest.requireActual('@/lib/store/conduct-log-api'),
  useGetClassConductLogsQuery: (args) => getClassConductLogsMock(args),
}));

const getStudentsMock = jest.fn();
jest.mock('@/lib/store/students-api', () => ({
  ...jest.requireActual('@/lib/store/students-api'),
  useGetStudentsQuery: (args) => getStudentsMock(args),
}));

const getConductCatalogMock = jest.fn();
jest.mock('@/lib/store/conduct-catalog-api', () => ({
  ...jest.requireActual('@/lib/store/conduct-catalog-api'),
  useGetConductCatalogQuery: () => getConductCatalogMock(),
}));

// Dialog ghi nhận mới được test riêng ở conduct-log-form-dialog.test.jsx — mock tối giản ở đây để test trang
// này không phụ thuộc hành vi chi tiết của nó.
jest.mock('@/components/conduct/conduct-log-form-dialog', () => ({
  ConductLogFormDialog: ({ open }) => (open ? <div data-testid="conduct-log-form-dialog" /> : null),
}));

const ACTIVE_STUDENT = { _id: 's1', fullName: 'Nguyễn Văn A', status: 'ACTIVE' };
const TRANSFERRED_STUDENT = { _id: 's2', fullName: 'Lê Văn C (đã chuyển lớp)', status: 'TRANSFERRED' };
const ALL_STUDENTS = [ACTIVE_STUDENT, TRANSFERRED_STUDENT];

const CATALOG = [{ _id: 'ci1', label: 'Nói chuyện riêng', kind: 'VIOLATION', points: 5 }];

const LOGS = [
  {
    _id: 'cl1',
    studentId: 's1',
    catalogItemId: 'ci1',
    points: -5,
    note: undefined,
    date: '2026-10-01T00:00:00.000Z',
  },
  {
    _id: 'cl2',
    studentId: 's2',
    catalogItemId: null,
    points: 10,
    note: 'Giúp đỡ bạn học',
    date: '2026-10-02T00:00:00.000Z',
  },
];

function renderPage(user = { id: 'teacher-1', role: 'TEACHER' }) {
  const store = configureStore({
    reducer: { auth: authReducer, [apiSlice.reducerPath]: apiSlice.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(apiSlice.middleware),
    preloadedState: { auth: { user, accessToken: 'token' } },
  });
  return render(
    <Provider store={store}>
      <ViPhamPage />
    </Provider>,
  );
}

beforeEach(() => {
  getClassConductLogsMock.mockReset();
  getStudentsMock.mockReset();
  getConductCatalogMock.mockReset();
  getClassConductLogsMock.mockReturnValue({ data: LOGS, isLoading: false, isError: false });
  getStudentsMock.mockReturnValue({ data: ALL_STUDENTS, isLoading: false });
  getConductCatalogMock.mockReturnValue({ data: CATALOG, isLoading: false });
});

test('(d) ghép đúng tên học sinh ĐÃ CHUYỂN LỚP nhờ fetch status:ALL, không hiện trống/ObjectId thô', () => {
  renderPage();

  expect(getStudentsMock).toHaveBeenCalledWith({ classId: 'class-1', status: 'ALL' });
  const table = within(screen.getByRole('table'));
  expect(table.getByText('Lê Văn C (đã chuyển lớp)')).toBeInTheDocument();
  expect(table.queryByText('s2')).not.toBeInTheDocument();
});

test('ghép đúng tên danh mục khi có catalogItemId, hiện note khi là "Khác"', () => {
  renderPage();

  const table = within(screen.getByRole('table'));
  expect(table.getByText('Nói chuyện riêng')).toBeInTheDocument();
  expect(table.getByText('Giúp đỡ bạn học')).toBeInTheDocument();
});

test('hiện điểm có dấu đúng Badge success/danger theo dấu điểm', () => {
  renderPage();

  const table = within(screen.getByRole('table'));
  expect(table.getByText('-5')).toBeInTheDocument();
  expect(table.getByText('+10')).toBeInTheDocument();
});

test('bấm "Ghi nhận mới" mở dialog ghi nhận', async () => {
  renderPage();
  expect(screen.queryByTestId('conduct-log-form-dialog')).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Ghi nhận mới' }));

  expect(screen.getByTestId('conduct-log-form-dialog')).toBeInTheDocument();
});

test('không có quyền xem lớp này (403) → hiện đúng trang lỗi, KHÔNG hiện bảng rỗng', () => {
  getClassConductLogsMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
    error: { status: 403, data: { message: 'Forbidden resource' } },
  });

  renderPage();

  expect(screen.getByText('Bạn không có quyền xem lớp này')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});
