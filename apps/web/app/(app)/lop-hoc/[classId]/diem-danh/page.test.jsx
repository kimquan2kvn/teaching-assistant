import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/lib/store/auth-slice';
import { apiSlice } from '@/lib/store/api-slice';
import DiemDanhPage from './page';

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

const getPositionAttendanceMock = jest.fn();
const getClassAttendanceSummaryMock = jest.fn();
const markAttendanceMock = jest.fn();
jest.mock('@/lib/store/attendance-api', () => ({
  ...jest.requireActual('@/lib/store/attendance-api'),
  useGetPositionAttendanceQuery: (args) => getPositionAttendanceMock(args),
  useGetClassAttendanceSummaryQuery: (args) => getClassAttendanceSummaryMock(args),
  useMarkAttendanceMutation: () => [markAttendanceMock, { isLoading: false }],
}));

// Lớp có 1 HOMEROOM (GVCN) + 2 SUBJECT (Toán, Văn), mỗi vị trí giữ bởi 1 giáo viên khác nhau — đúng kịch bản
// phổ biến nhất (không ai giữ 2 vị trí cùng lúc trong các test này).
const DETAIL = {
  class: { id: 'class-1', code: '11B1-ABCDE', name: '11B1' },
  positions: [
    { id: 'p-hr', type: 'HOMEROOM', subject: undefined, holder: { id: 'teacher-chu-nhiem', fullName: 'Cô Chủ nhiệm' } },
    { id: 'p-toan', type: 'SUBJECT', subject: 'Toán', holder: { id: 'teacher-toan', fullName: 'Thầy Toán' } },
    { id: 'p-van', type: 'SUBJECT', subject: 'Văn', holder: { id: 'teacher-van', fullName: 'Cô Văn' } },
  ],
};

const STUDENTS = [
  { _id: 's1', fullName: 'Nguyễn Văn A', dob: '2010-01-01T00:00:00.000Z', status: 'ACTIVE' },
  { _id: 's2', fullName: 'Trần Thị B', dob: '2010-02-02T00:00:00.000Z', status: 'ACTIVE' },
  { _id: 's3', fullName: 'Lê Văn C', dob: '2010-03-03T00:00:00.000Z', status: 'ACTIVE' },
];

const SUMMARY = { PRESENT: 2, EXCUSED: 0, LATE: 1, UNEXCUSED: 0 };

function renderPage(user) {
  const store = configureStore({
    reducer: { auth: authReducer, [apiSlice.reducerPath]: apiSlice.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(apiSlice.middleware),
    preloadedState: { auth: { user, accessToken: user ? 'token' : null } },
  });
  return render(
    <Provider store={store}>
      <DiemDanhPage />
    </Provider>,
  );
}

function findRowByText(text) {
  const rows = screen.getAllByRole('row');
  const row = rows.find((r) => within(r).queryByText(text));
  if (!row) throw new Error(`Không tìm thấy dòng chứa "${text}"`);
  return row;
}

beforeEach(() => {
  getClassDetailMock.mockReset();
  getStudentsMock.mockReset();
  getPositionAttendanceMock.mockReset();
  getClassAttendanceSummaryMock.mockReset();
  markAttendanceMock.mockReset();

  getClassDetailMock.mockReturnValue({ data: DETAIL, isLoading: false });
  getStudentsMock.mockReturnValue({ data: STUDENTS, isLoading: false });
  getClassAttendanceSummaryMock.mockReturnValue({ data: SUMMARY });
  markAttendanceMock.mockImplementation(() => ({ unwrap: () => Promise.resolve([]) }));
});

test('(a) roster 3 học sinh, getPositionAttendance trả 1 bản ghi LATE → bảng hiện đúng 1 dòng LATE, 2 dòng còn lại mặc định "Có mặt"', () => {
  getPositionAttendanceMock.mockImplementation(({ positionId }) => ({
    data: positionId === 'p-hr' ? [{ studentId: 's2', status: 'LATE' }] : [],
  }));

  renderPage({ id: 'teacher-chu-nhiem', role: 'TEACHER' });

  expect(getPositionAttendanceMock.mock.calls.at(-1)[0]).toEqual(
    expect.objectContaining({ positionId: 'p-hr' }),
  );

  const rowA = findRowByText('Nguyễn Văn A');
  const rowB = findRowByText('Trần Thị B');
  const rowC = findRowByText('Lê Văn C');

  expect(within(rowA).getByRole('button', { name: 'Có mặt' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(rowB).getByRole('button', { name: 'Muộn' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(rowC).getByRole('button', { name: 'Có mặt' })).toHaveAttribute('aria-pressed', 'true');
});

test('(b) đổi 1 học sinh đang "Có mặt" sang "Không phép" rồi lưu → gọi markAttendance với entries CHỈ chứa đúng học sinh đó', async () => {
  getPositionAttendanceMock.mockReturnValue({ data: [] });

  renderPage({ id: 'teacher-chu-nhiem', role: 'TEACHER' });

  const rowA = findRowByText('Nguyễn Văn A');
  await userEvent.click(within(rowA).getByRole('button', { name: 'Không phép' }));
  await userEvent.click(screen.getByRole('button', { name: 'Lưu điểm danh' }));

  expect(markAttendanceMock).toHaveBeenCalledWith(
    expect.objectContaining({
      positionId: 'p-hr',
      classId: 'class-1',
      entries: [{ studentId: 's1', status: 'UNEXCUSED' }],
    }),
  );
});

test('(c) đổi 1 học sinh đang LATE (từ dữ liệu fetch về) ngược lại "Có mặt" rồi lưu → entries KHÔNG chứa học sinh đó', async () => {
  getPositionAttendanceMock.mockImplementation(({ positionId }) => ({
    data: positionId === 'p-hr' ? [{ studentId: 's2', status: 'LATE' }] : [],
  }));

  renderPage({ id: 'teacher-chu-nhiem', role: 'TEACHER' });

  const rowB = findRowByText('Trần Thị B');
  await userEvent.click(within(rowB).getByRole('button', { name: 'Có mặt' }));
  await userEvent.click(screen.getByRole('button', { name: 'Lưu điểm danh' }));

  expect(markAttendanceMock).toHaveBeenCalledWith(
    expect.objectContaining({ positionId: 'p-hr', classId: 'class-1', entries: [] }),
  );
});

test('(d) GVBM thuần (myPositions.length === 1, không phải HOMEROOM) → không render bộ chọn "Xem vị trí khác"', () => {
  getPositionAttendanceMock.mockReturnValue({ data: [] });

  renderPage({ id: 'teacher-toan', role: 'TEACHER' });

  expect(screen.queryByLabelText('Xem vị trí khác')).not.toBeInTheDocument();
  // GVBM thuần chỉ giữ đúng 1 vị trí nên cũng không cần bộ chọn "Đang thao tác với vị trí".
  expect(screen.queryByLabelText('Đang thao tác với vị trí')).not.toBeInTheDocument();
});

test('(e) GVCN giữ HOMEROOM + chọn xem 1 vị trí SUBJECT khác → ẩn hết control ghi, chỉ hiện bảng đọc', async () => {
  getPositionAttendanceMock.mockImplementation(({ positionId }) => ({
    data: positionId === 'p-hr' ? [{ studentId: 's2', status: 'LATE' }] : [],
  }));

  renderPage({ id: 'teacher-chu-nhiem', role: 'TEACHER' });

  await userEvent.selectOptions(screen.getByLabelText('Xem vị trí khác'), 'p-toan');

  expect(getPositionAttendanceMock.mock.calls.at(-1)[0]).toEqual(
    expect.objectContaining({ positionId: 'p-toan' }),
  );
  expect(screen.queryByRole('button', { name: 'Lưu điểm danh' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Không phép' })).not.toBeInTheDocument();

  const rowA = findRowByText('Nguyễn Văn A');
  expect(within(rowA).getByText('Có mặt')).toBeInTheDocument();
});

test('(f) đổi ngày (nút lùi 1 ngày) → gọi lại cả getPositionAttendance lẫn getClassAttendanceSummary với date mới', async () => {
  getPositionAttendanceMock.mockReturnValue({ data: [] });

  renderPage({ id: 'teacher-chu-nhiem', role: 'TEACHER' });

  const initialDate = getPositionAttendanceMock.mock.calls.at(-1)[0].date;
  expect(getClassAttendanceSummaryMock.mock.calls.at(-1)[0].date).toBe(initialDate);

  await userEvent.click(screen.getByRole('button', { name: 'Lùi 1 ngày' }));

  const [y, m, d] = initialDate.split('-').map(Number);
  const expectedPrevDate = new Date(Date.UTC(y, m - 1, d));
  expectedPrevDate.setUTCDate(expectedPrevDate.getUTCDate() - 1);
  const expectedDateStr = expectedPrevDate.toISOString().slice(0, 10);

  expect(getPositionAttendanceMock.mock.calls.at(-1)[0].date).toBe(expectedDateStr);
  expect(getClassAttendanceSummaryMock.mock.calls.at(-1)[0].date).toBe(expectedDateStr);
});
