import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/lib/store/auth-slice';
import BangDieuKhienPage from './page';

jest.mock('next/navigation', () => ({ useParams: () => ({ classId: 'class-1' }) }));

const getClassDashboardMock = jest.fn();
jest.mock('@/lib/store/dashboard-api', () => ({
  ...jest.requireActual('@/lib/store/dashboard-api'),
  useGetClassDashboardQuery: (...args) => getClassDashboardMock(...args),
}));

const getStudentsMock = jest.fn();
jest.mock('@/lib/store/students-api', () => ({
  ...jest.requireActual('@/lib/store/students-api'),
  useGetStudentsQuery: (...args) => getStudentsMock(...args),
}));

const getConductCatalogMock = jest.fn();
jest.mock('@/lib/store/conduct-catalog-api', () => ({
  ...jest.requireActual('@/lib/store/conduct-catalog-api'),
  useGetConductCatalogQuery: (...args) => getConductCatalogMock(...args),
}));

const STUDENTS = [
  { _id: 's1', fullName: 'Nguyễn Văn A', status: 'ACTIVE' },
  { _id: 's2', fullName: 'Trần Thị B', status: 'ACTIVE' },
];

const DASHBOARD_DATA = {
  attendanceSummary: { PRESENT: 1, EXCUSED: 0, LATE: 1, UNEXCUSED: 0 },
  recentConductLogs: [
    { _id: 'log-1', studentId: 's1', points: -5, note: 'Đi học muộn', date: '2026-10-08T00:00:00.000Z' },
  ],
  conductRating: [
    { studentId: 's1', score: 95, label: 'Giỏi' },
    { studentId: 's2', score: 80, label: 'Khá' },
  ],
  pendingPunishments: [
    {
      _id: 'pu-1',
      studentId: 's2',
      reason: 'Đủ 2 vi phạm trong tuần',
      lines: 20,
      dueDate: '2026-10-15T00:00:00.000Z',
      status: 'PENDING',
    },
  ],
};

function renderPage() {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { user: { id: 'teacher-1', role: 'TEACHER' }, accessToken: 'token' } },
  });
  return render(
    <Provider store={store}>
      <BangDieuKhienPage />
    </Provider>,
  );
}

beforeEach(() => {
  getClassDashboardMock.mockReset();
  getStudentsMock.mockReset();
  getConductCatalogMock.mockReset();
  getStudentsMock.mockReturnValue({ data: STUDENTS, isLoading: false });
  getConductCatalogMock.mockReturnValue({ data: [{ _id: 'cat-1', label: 'Nói chuyện riêng' }] });
  getClassDashboardMock.mockReturnValue({ data: DASHBOARD_DATA, isLoading: false, isError: false, error: undefined });
});

test('hiện đủ 4 khối: thống kê điểm danh, vi phạm/điểm cộng gần nhất, xếp loại tuần, chép phạt chưa nộp', () => {
  renderPage();

  // (1) thống kê điểm danh hôm nay
  expect(screen.getByText('Có mặt')).toBeInTheDocument();
  expect(screen.getByText('Muộn')).toBeInTheDocument();

  // (2) vi phạm/điểm cộng gần nhất — ghép đúng tên học sinh từ roster, không hiện ObjectId thô
  // (học sinh A xuất hiện cả ở bảng vi phạm lẫn khối xếp loại "Cao nhất" bên dưới nên dùng getAllByText)
  expect(screen.getAllByText('Nguyễn Văn A').length).toBeGreaterThan(0);
  expect(screen.getByText('-5')).toBeInTheDocument();
  expect(screen.getByText('Đi học muộn')).toBeInTheDocument();

  // (3) xếp loại rèn luyện tuần hiện tại
  expect(screen.getByText('Giỏi')).toBeInTheDocument();
  expect(screen.getAllByText('Trần Thị B').length).toBeGreaterThan(0);

  // (4) chép phạt đang "Chưa nộp"
  expect(screen.getByText('Đủ 2 vi phạm trong tuần')).toBeInTheDocument();
  expect(screen.getByText(/Chưa nộp/)).toBeInTheDocument();
});

test('vi phạm/điểm cộng ghi từ danh mục (không có note) hiện đúng tên danh mục, không để trống', () => {
  getClassDashboardMock.mockReturnValue({
    data: {
      ...DASHBOARD_DATA,
      recentConductLogs: [
        { _id: 'log-catalog', studentId: 's1', points: -5, catalogItemId: 'cat-1', date: '2026-10-08T00:00:00.000Z' },
      ],
    },
    isLoading: false,
    isError: false,
    error: undefined,
  });

  renderPage();

  expect(screen.getByText('Nói chuyện riêng')).toBeInTheDocument();
});

test('ghi rõ chỉ điểm danh + xếp loại tuần đổi theo ngày, 2 khối còn lại không phụ thuộc ngày', () => {
  renderPage();
  expect(
    screen.getByText(/thống kê điểm danh.*xếp loại rèn luyện|điểm danh.*và.*xếp loại/i),
  ).toBeInTheDocument();
});

test('đổi ngày (nút "Ngày sau") gọi lại useGetClassDashboardQuery với date mới', async () => {
  renderPage();

  const firstCallArgs = getClassDashboardMock.mock.calls.at(-1)[0];
  expect(firstCallArgs.classId).toBe('class-1');
  const initialDate = firstCallArgs.date;

  await userEvent.click(screen.getByRole('button', { name: 'Ngày sau' }));

  const lastCallArgs = getClassDashboardMock.mock.calls.at(-1)[0];
  expect(lastCallArgs.date).not.toBe(initialDate);
});

test('ngày mặc định là hôm nay theo giờ ĐỊA PHƯƠNG, không lùi 1 ngày vào buổi sáng sớm (giờ VN UTC+7)', () => {
  // 2026-10-08T23:30:00Z = 06:30 sáng 2026-10-09 giờ VN — nếu dùng toISOString().slice(0,10) sẽ mặc định nhầm
  // sang "2026-10-08", khiến dashboard hiện thống kê điểm danh/tuần xếp loại của NGÀY/TUẦN TRƯỚC.
  jest.useFakeTimers().setSystemTime(new Date('2026-10-08T23:30:00.000Z'));
  renderPage();
  expect(getClassDashboardMock.mock.calls.at(-1)[0].date).toBe('2026-10-09');
  jest.useRealTimers();
});

test('query lỗi 403 hiện "Bạn không có quyền xem lớp này", không render 4 khối', () => {
  getClassDashboardMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
    error: { status: 403, data: { message: 'Forbidden resource' } },
  });

  renderPage();

  expect(screen.getByText('Bạn không có quyền xem lớp này')).toBeInTheDocument();
  expect(screen.queryByText('Có mặt')).not.toBeInTheDocument();
});
