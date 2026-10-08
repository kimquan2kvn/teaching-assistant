import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/lib/store/auth-slice';
import { apiSlice } from '@/lib/store/api-slice';
import HocSinhPage from './page';

jest.mock('next/navigation', () => ({ useParams: () => ({ classId: 'class-1' }) }));

const getClassDetailMock = jest.fn();
jest.mock('@/lib/store/classes-api', () => ({
  ...jest.requireActual('@/lib/store/classes-api'),
  useGetClassDetailQuery: (classId) => getClassDetailMock(classId),
}));

const getStudentsMock = jest.fn();
jest.mock('@/lib/store/students-api', () => ({
  ...jest.requireActual('@/lib/store/students-api'),
  useGetStudentsQuery: (args) => getStudentsMock(args),
}));

// Hai dialog thêm/sửa và đánh dấu chuyển đi do 2 agent khác dựng song song (chưa chắc đã tồn tại lúc viết
// test này) — mock tối giản để test của page này không phụ thuộc vào implementation thật của chúng.
jest.mock('@/components/students/student-form-dialog', () => ({
  StudentFormDialog: ({ mode, student }) => (
    <div data-testid="student-form-dialog">
      {mode}:{student?.fullName ?? ''}
    </div>
  ),
}));
jest.mock('@/components/students/transfer-dialog', () => ({
  TransferDialog: ({ studentName }) => <div data-testid="transfer-dialog">{studentName}</div>,
}));

const DETAIL = {
  class: { id: 'class-1', code: '11B1-ABCDE', name: '11B1' },
  positions: [
    { id: 'p1', type: 'HOMEROOM', subject: undefined, holder: { id: 'teacher-chu-nhiem', fullName: 'Cô Chủ nhiệm' } },
    { id: 'p2', type: 'SUBJECT', subject: 'Toán', holder: { id: 'teacher-bo-mon', fullName: 'Thầy Bộ môn' } },
  ],
};

const ACTIVE_STUDENTS = [
  { _id: 's1', fullName: 'Nguyễn Văn A', dob: '2010-05-03T00:00:00.000Z', status: 'ACTIVE' },
  { _id: 's2', fullName: 'Trần Thị B', dob: '2010-11-20T00:00:00.000Z', status: 'ACTIVE' },
];
const TRANSFERRED_STUDENT = { _id: 's3', fullName: 'Lê Văn C', dob: '2010-01-15T00:00:00.000Z', status: 'TRANSFERRED' };
const ALL_STUDENTS = [...ACTIVE_STUDENTS, TRANSFERRED_STUDENT];

function renderPage(user) {
  const store = configureStore({
    reducer: { auth: authReducer, [apiSlice.reducerPath]: apiSlice.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(apiSlice.middleware),
    preloadedState: { auth: { user, accessToken: user ? 'token' : null } },
  });
  return render(
    <Provider store={store}>
      <HocSinhPage />
    </Provider>,
  );
}

beforeEach(() => {
  getClassDetailMock.mockReset();
  getStudentsMock.mockReset();
  getClassDetailMock.mockReturnValue({ data: DETAIL, isLoading: false });
  getStudentsMock.mockImplementation(({ status }) => ({
    data: status === 'ALL' ? ALL_STUDENTS : ACTIVE_STUDENTS,
    isLoading: false,
  }));
});

test('GVCN (isHomeroom=true) thấy nút "Sửa"/"Đánh dấu chuyển đi" trên từng dòng và 2 nút thêm/nhập ở trên', () => {
  renderPage({ id: 'teacher-chu-nhiem', role: 'TEACHER' });

  expect(screen.getByRole('button', { name: 'Thêm học sinh' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Nhập từ Excel' })).toHaveAttribute(
    'href',
    '/lop-hoc/class-1/hoc-sinh/nhap-excel',
  );

  const suaButtons = screen.getAllByRole('button', { name: 'Sửa' });
  const chuyenDiButtons = screen.getAllByRole('button', { name: 'Đánh dấu chuyển đi' });
  expect(suaButtons).toHaveLength(ACTIVE_STUDENTS.length);
  expect(chuyenDiButtons).toHaveLength(ACTIVE_STUDENTS.length);

  // Ngày sinh hiện đúng định dạng dd/mm/yyyy, không phải ISO gốc từ backend.
  expect(screen.getByText('03/05/2010')).toBeInTheDocument();
});

test('GVBM (isHomeroom=false) KHÔNG thấy bất kỳ nút/cột hành động nào, chỉ xem', () => {
  renderPage({ id: 'teacher-bo-mon', role: 'TEACHER' });

  expect(screen.queryByRole('button', { name: 'Thêm học sinh' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Nhập từ Excel' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Đánh dấu chuyển đi' })).not.toBeInTheDocument();

  // Vẫn thấy dữ liệu học sinh ở chế độ chỉ xem.
  expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
});

test('ADMIN thấy đầy đủ nút hành động dù không giữ vị trí HOMEROOM của lớp này', () => {
  renderPage({ id: 'admin-1', role: 'ADMIN' });

  expect(screen.getByRole('button', { name: 'Thêm học sinh' })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Sửa' })).toHaveLength(ACTIVE_STUDENTS.length);
});

test('toggle "Đã chuyển đi" gọi lại useGetStudentsQuery với status=ALL rồi lọc client-side chỉ còn học sinh TRANSFERRED', async () => {
  renderPage({ id: 'teacher-chu-nhiem', role: 'TEACHER' });

  expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
  expect(screen.queryByText('Lê Văn C')).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Đã chuyển đi' }));

  expect(getStudentsMock).toHaveBeenCalledWith({ classId: 'class-1', status: 'ALL' });
  expect(screen.getByText('Lê Văn C')).toBeInTheDocument();
  expect(screen.queryByText('Nguyễn Văn A')).not.toBeInTheDocument();
  expect(screen.queryByText('Trần Thị B')).not.toBeInTheDocument();
});
