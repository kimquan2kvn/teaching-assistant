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

test('(d2) giáo viên giữ CẢ HOMEROOM lẫn 1 SUBJECT của CÙNG lớp → bộ chọn "Đang thao tác với vị trí" BẮT BUỘC hiện, không tự ý chọn mặc định rồi giấu đi', () => {
  getClassDetailMock.mockReturnValue({
    data: {
      ...DETAIL,
      positions: [
        { id: 'p-hr', type: 'HOMEROOM', subject: undefined, holder: { id: 'teacher-2-vi-tri', fullName: 'Thầy X' } },
        { id: 'p-toan', type: 'SUBJECT', subject: 'Toán', holder: { id: 'teacher-2-vi-tri', fullName: 'Thầy X' } },
        { id: 'p-van', type: 'SUBJECT', subject: 'Văn', holder: { id: 'teacher-van', fullName: 'Cô Văn' } },
      ],
    },
    isLoading: false,
  });
  getPositionAttendanceMock.mockReturnValue({ data: [] });

  renderPage({ id: 'teacher-2-vi-tri', role: 'TEACHER' });

  expect(screen.getByLabelText('Đang thao tác với vị trí')).toBeInTheDocument();
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

test('không giữ vị trí nào của lớp này (IDOR, vd gõ nhầm URL) → hiện đúng copy "không có quyền", không hiện bảng rỗng', () => {
  getStudentsMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
    error: { status: 403, data: { message: 'Forbidden resource' } },
  });
  getPositionAttendanceMock.mockReturnValue({ data: [] });

  renderPage({ id: 'ke-la', role: 'TEACHER' });

  expect(screen.getByText('Bạn không có quyền xem lớp này')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('(h) GET điểm danh thất bại → hiện lỗi, KHÔNG được coi mọi học sinh là "Có mặt" rồi cho lưu đè', () => {
  getPositionAttendanceMock.mockReturnValue({
    data: undefined,
    isError: true,
    error: { status: 500, data: { message: 'Không tải được dữ liệu điểm danh' } },
  });

  renderPage({ id: 'teacher-chu-nhiem', role: 'TEACHER' });

  expect(screen.getByText('Không tải được dữ liệu điểm danh')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Lưu điểm danh' })).not.toBeInTheDocument();
});

test('(i) lưu điểm danh KHÔNG xoá bản ghi của học sinh đã chuyển lớp (không còn trong roster ACTIVE)', async () => {
  // s2 có bản ghi LATE nhưng KHÔNG có trong roster (đã chuyển lớp) — PUT thay thế toàn bộ nên nếu không mang
  // theo bản ghi này, backend sẽ hiểu là "đã xoá ngoại lệ của s2" (deleteMany $nin), mất lịch sử thật.
  getPositionAttendanceMock.mockReturnValue({
    data: [{ studentId: 's2-da-chuyen-lop', status: 'LATE' }],
  });

  renderPage({ id: 'teacher-chu-nhiem', role: 'TEACHER' });
  await userEvent.click(screen.getByRole('button', { name: 'Lưu điểm danh' }));

  const savedEntries = markAttendanceMock.mock.calls.at(-1)[0].entries;
  expect(savedEntries).toContainEqual({ studentId: 's2-da-chuyen-lop', status: 'LATE' });
});

test('(g) ngày mặc định là ngày hôm nay theo giờ ĐỊA PHƯƠNG, không lùi 1 ngày vào buổi sáng sớm (giờ VN UTC+7)', () => {
  // 2026-10-08T23:30:00Z = 06:30 sáng 2026-10-09 giờ VN — đúng lúc giáo viên điểm danh đầu giờ. Nếu dùng
  // toISOString().slice(0,10) (UTC thuần) sẽ mặc định nhầm sang "2026-10-08".
  jest.useFakeTimers().setSystemTime(new Date('2026-10-08T23:30:00.000Z'));
  getPositionAttendanceMock.mockReturnValue({ data: [] });

  renderPage({ id: 'teacher-chu-nhiem', role: 'TEACHER' });

  expect(getPositionAttendanceMock.mock.calls.at(-1)[0].date).toBe('2026-10-09');
  expect(getClassAttendanceSummaryMock.mock.calls.at(-1)[0].date).toBe('2026-10-09');

  jest.useRealTimers();
});
