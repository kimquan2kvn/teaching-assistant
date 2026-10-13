import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/lib/store/auth-slice';
import { apiSlice } from '@/lib/store/api-slice';
import ChepPhatPage from './page';

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

const getClassPunishmentsMock = jest.fn();
const updatePunishmentStatusMock = jest.fn();
const updatePunishmentLinesMock = jest.fn();
jest.mock('@/lib/store/punishments-api', () => ({
  ...jest.requireActual('@/lib/store/punishments-api'),
  useGetClassPunishmentsQuery: (args) => getClassPunishmentsMock(args),
  useUpdatePunishmentStatusMutation: () => [updatePunishmentStatusMock, { isLoading: false }],
  useUpdatePunishmentLinesMutation: () => [updatePunishmentLinesMock, { isLoading: false }],
}));

const DETAIL = {
  class: { id: 'class-1', code: '11B1-ABCDE', name: '11B1' },
  positions: [
    { id: 'p1', type: 'HOMEROOM', subject: undefined, holder: { id: 'teacher-chu-nhiem', fullName: 'Cô Chủ nhiệm' } },
    { id: 'p2', type: 'SUBJECT', subject: 'Toán', holder: { id: 'teacher-bo-mon', fullName: 'Thầy Bộ môn' } },
  ],
};

const STUDENTS = [
  { _id: 's1', fullName: 'Nguyễn Văn A', status: 'ACTIVE' },
  { _id: 's2', fullName: 'Trần Thị B', status: 'ACTIVE' },
];

const PUNISHMENT_PENDING_OVERDUE = {
  _id: 'pu1',
  studentId: 's1',
  classId: 'class-1',
  kind: 'WEEKLY_THRESHOLD',
  reason: 'Đủ 2 vi phạm trong tuần',
  lines: 20,
  dueDate: '2020-01-01T00:00:00.000Z',
  status: 'PENDING',
  notifyParent: false,
};

const PUNISHMENT_SUBMITTED_PAST_DUE = {
  _id: 'pu2',
  studentId: 's2',
  classId: 'class-1',
  kind: 'HOMEWORK_REPEAT',
  reason: 'Không làm bài tập về nhà (lần 3)',
  lines: 40,
  dueDate: '2020-01-01T00:00:00.000Z',
  status: 'SUBMITTED',
  notifyParent: true,
};

const PUNISHMENTS = [PUNISHMENT_PENDING_OVERDUE, PUNISHMENT_SUBMITTED_PAST_DUE];

function renderPage(user) {
  const store = configureStore({
    reducer: { auth: authReducer, [apiSlice.reducerPath]: apiSlice.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(apiSlice.middleware),
    preloadedState: { auth: { user, accessToken: user ? 'token' : null } },
  });
  return render(
    <Provider store={store}>
      <ChepPhatPage />
    </Provider>,
  );
}

beforeEach(() => {
  getClassDetailMock.mockReset();
  getStudentsMock.mockReset();
  getClassPunishmentsMock.mockReset();
  updatePunishmentStatusMock.mockReset();
  updatePunishmentLinesMock.mockReset();

  getClassDetailMock.mockReturnValue({ data: DETAIL, isLoading: false });
  getStudentsMock.mockReturnValue({ data: STUDENTS, isLoading: false });
  getClassPunishmentsMock.mockReturnValue({ data: PUNISHMENTS, isLoading: false });
  updatePunishmentStatusMock.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  updatePunishmentLinesMock.mockReturnValue({ unwrap: () => Promise.resolve({}) });
});

test('(a) GVCN (isHomeroom=true) thấy nút "Đổi trạng thái"/"Sửa số dòng" trên mỗi dòng', () => {
  renderPage({ id: 'teacher-chu-nhiem', role: 'TEACHER' });

  expect(screen.getAllByRole('button', { name: 'Đổi trạng thái' })).toHaveLength(PUNISHMENTS.length);
  expect(screen.getAllByRole('button', { name: 'Sửa số dòng' })).toHaveLength(PUNISHMENTS.length);
});

test('(b) GVBM (isHomeroom=false) KHÔNG thấy bất kỳ control sửa nào, chỉ xem', () => {
  renderPage({ id: 'teacher-bo-mon', role: 'TEACHER' });

  expect(screen.queryByRole('button', { name: 'Đổi trạng thái' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sửa số dòng' })).not.toBeInTheDocument();
  // Vẫn xem được dữ liệu ở chế độ chỉ xem.
  expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
  expect(screen.getByText('Đủ 2 vi phạm trong tuần')).toBeInTheDocument();
});

test('ADMIN thấy đầy đủ control dù không giữ vị trí HOMEROOM của lớp này', () => {
  renderPage({ id: 'admin-1', role: 'ADMIN' });

  expect(screen.getAllByRole('button', { name: 'Đổi trạng thái' })).toHaveLength(PUNISHMENTS.length);
});

test('(c) đổi trạng thái gọi đúng updatePunishmentStatus({id, classId, status})', async () => {
  renderPage({ id: 'teacher-chu-nhiem', role: 'TEACHER' });

  const doiTrangThaiButtons = screen.getAllByRole('button', { name: 'Đổi trạng thái' });
  await userEvent.click(doiTrangThaiButtons[0]);

  await userEvent.selectOptions(screen.getByLabelText('Trạng thái mới'), 'SUBMITTED');
  await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

  expect(updatePunishmentStatusMock).toHaveBeenCalledWith({ id: 'pu1', classId: 'class-1', status: 'SUBMITTED' });
});

test('sửa số dòng gọi đúng updatePunishmentLines({id, classId, lines})', async () => {
  renderPage({ id: 'teacher-chu-nhiem', role: 'TEACHER' });

  const suaSoDongButtons = screen.getAllByRole('button', { name: 'Sửa số dòng' });
  await userEvent.click(suaSoDongButtons[0]);

  const linesInput = screen.getByLabelText('Số dòng mới');
  await userEvent.clear(linesInput);
  await userEvent.type(linesInput, '45');
  await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

  expect(updatePunishmentLinesMock).toHaveBeenCalledWith({ id: 'pu1', classId: 'class-1', lines: 45 });
});

test('(d) chép phạt PENDING quá hạn hiện tô đỏ/nhãn "Quá hạn"; SUBMITTED dù quá hạn thì KHÔNG tô đỏ', () => {
  renderPage({ id: 'teacher-chu-nhiem', role: 'TEACHER' });

  const rows = screen.getAllByRole('row');
  const pendingRow = rows.find((r) => r.textContent.includes('Nguyễn Văn A'));
  const submittedRow = rows.find((r) => r.textContent.includes('Trần Thị B'));

  expect(pendingRow.textContent).toMatch(/Quá hạn/);
  expect(submittedRow.textContent).not.toMatch(/Quá hạn/);
});

test('(e) notifyParent=true hiện đúng Badge "Đã báo phụ huynh"', () => {
  renderPage({ id: 'teacher-chu-nhiem', role: 'TEACHER' });

  // pu2 (Trần Thị B) có notifyParent true, pu1 (Nguyễn Văn A) có notifyParent false.
  expect(screen.getAllByText('Đã báo phụ huynh')).toHaveLength(1);
});

test('tab lọc trạng thái gọi lại useGetClassPunishmentsQuery với đúng status', async () => {
  renderPage({ id: 'teacher-chu-nhiem', role: 'TEACHER' });

  await userEvent.click(screen.getByRole('button', { name: 'Chưa nộp' }));
  expect(getClassPunishmentsMock).toHaveBeenCalledWith({ classId: 'class-1', status: 'PENDING' });

  await userEvent.click(screen.getByRole('button', { name: 'Đã nộp' }));
  expect(getClassPunishmentsMock).toHaveBeenCalledWith({ classId: 'class-1', status: 'SUBMITTED' });

  await userEvent.click(screen.getByRole('button', { name: 'Nộp muộn' }));
  expect(getClassPunishmentsMock).toHaveBeenCalledWith({ classId: 'class-1', status: 'LATE' });

  await userEvent.click(screen.getByRole('button', { name: 'Tất cả' }));
  expect(getClassPunishmentsMock).toHaveBeenCalledWith({ classId: 'class-1', status: undefined });
});

test('dùng Table shadcn cho bảng chép phạt và Alert shadcn cho lỗi trong hộp thoại', async () => {
  updatePunishmentStatusMock.mockReturnValue({
    unwrap: () => Promise.reject({ status: 400, data: { message: 'Không đổi được trạng thái' } }),
  });
  renderPage({ id: 'teacher-chu-nhiem', role: 'TEACHER' });

  expect(screen.getByRole('table').parentElement).toHaveClass('overflow-auto');
  expect(screen.getByRole('columnheader', { name: 'Học sinh' })).toHaveClass('h-10');

  await userEvent.click(screen.getAllByRole('button', { name: 'Đổi trạng thái' })[0]);
  await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Không đổi được trạng thái');
  expect(alert).toHaveClass('bg-danger-soft');
});
