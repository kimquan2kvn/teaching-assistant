import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import XepLoaiPage from './page';

jest.mock('next/navigation', () => ({ useParams: () => ({ classId: 'class-1' }) }));

const getStudentsMock = jest.fn();
jest.mock('@/lib/store/students-api', () => ({
  ...jest.requireActual('@/lib/store/students-api'),
  useGetStudentsQuery: (args) => getStudentsMock(args),
}));

const getClassConductRatingMock = jest.fn();
jest.mock('@/lib/store/conduct-rating-api', () => ({
  ...jest.requireActual('@/lib/store/conduct-rating-api'),
  useGetClassConductRatingQuery: (args) => getClassConductRatingMock(args),
}));

const STUDENTS = [
  { _id: 's1', fullName: 'Nguyễn Văn A', status: 'ACTIVE' },
  { _id: 's2', fullName: 'Trần Thị B', status: 'ACTIVE' },
];

const WEEK_1_RATING = [
  { studentId: 's1', score: 100, label: 'Xuất sắc' },
  { studentId: 's2', score: 70, label: 'Đạt' },
];

const WEEK_2_RATING = [
  { studentId: 's1', score: 110, label: 'Xuất sắc' },
  { studentId: 's2', score: 60, label: 'Cần rèn luyện' },
];

beforeEach(() => {
  getStudentsMock.mockReset();
  getClassConductRatingMock.mockReset();
  getStudentsMock.mockReturnValue({ data: STUDENTS, isLoading: false });
  getClassConductRatingMock.mockReturnValue({ data: WEEK_1_RATING, isLoading: false });
});

test('học sinh điểm 100 (chưa có nhật ký nào) vẫn hiện đúng 1 dòng, nhãn "Xuất sắc" (≥95)', () => {
  render(<XepLoaiPage />);

  const row = screen.getByText('Nguyễn Văn A').closest('tr');
  expect(row).not.toBeNull();
  expect(within(row).getByText('100')).toBeInTheDocument();
  expect(within(row).getByText('Xuất sắc')).toBeInTheDocument();
});

test('sắp xếp mặc định theo điểm giảm dần', () => {
  render(<XepLoaiPage />);

  const rows = screen.getAllByRole('row').slice(1); // bỏ dòng tiêu đề
  expect(rows[0]).toHaveTextContent('Nguyễn Văn A');
  expect(rows[1]).toHaveTextContent('Trần Thị B');
});

test('điểm vượt trần 100 vẫn hiện đúng số, không bị cắt', () => {
  getClassConductRatingMock.mockReturnValue({ data: WEEK_2_RATING, isLoading: false });
  render(<XepLoaiPage />);

  const row = screen.getByText('Nguyễn Văn A').closest('tr');
  expect(within(row).getByText('110')).toBeInTheDocument();
});

test('cột điểm dùng font-mono theo quy ước hiển thị số liệu', () => {
  render(<XepLoaiPage />);
  const row = screen.getByText('Nguyễn Văn A').closest('tr');
  const scoreCell = within(row).getByText('100');
  expect(scoreCell.className).toEqual(expect.stringContaining('font-mono'));
});

test('đổi ngày (tuần khác) gọi lại query với date mới và bảng cập nhật theo response mới', async () => {
  render(<XepLoaiPage />);

  expect(screen.getByText('70')).toBeInTheDocument();

  getClassConductRatingMock.mockReturnValue({ data: WEEK_2_RATING, isLoading: false });
  const dateInput = screen.getByLabelText('Chọn tuần (theo ngày)');
  await userEvent.clear(dateInput);
  await userEvent.type(dateInput, '2026-10-15');

  expect(getClassConductRatingMock).toHaveBeenLastCalledWith({ classId: 'class-1', date: '2026-10-15' });
  expect(screen.getByText('60')).toBeInTheDocument();
  expect(screen.queryByText('70')).not.toBeInTheDocument();
});

test('lỗi 403 (IDOR, không giữ vị trí nào của lớp) hiện đúng copy "không có quyền", không hiện bảng rỗng', () => {
  getClassConductRatingMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
    error: { status: 403, data: { message: 'Forbidden resource' } },
  });

  render(<XepLoaiPage />);

  expect(screen.getByText('Bạn không có quyền xem lớp này')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('dùng Table shadcn cho bảng xếp loại', () => {
  render(<XepLoaiPage />);

  expect(screen.getByRole('table').parentElement).toHaveClass('overflow-auto');
  expect(screen.getByRole('columnheader', { name: 'Xếp loại' })).toHaveClass('h-10');
});
