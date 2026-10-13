import { render, screen } from '@testing-library/react';
import LopHocPage from './page';

const useGetMyPositionsQueryMock = jest.fn();
jest.mock('@/lib/store/positions-api', () => ({
  ...jest.requireActual('@/lib/store/positions-api'),
  useGetMyPositionsQuery: (...args) => useGetMyPositionsQueryMock(...args),
}));

beforeEach(() => {
  useGetMyPositionsQueryMock.mockReset();
});

test('đang tải: hiện skeleton, không hiện danh sách lớp hay CTA rỗng', () => {
  useGetMyPositionsQueryMock.mockReturnValue({ data: undefined, isLoading: true, error: undefined });
  render(<LopHocPage />);
  expect(screen.getByRole('status')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Xem lớp' })).not.toBeInTheDocument();
  expect(screen.queryByText('Bạn chưa giữ vị trí nào')).not.toBeInTheDocument();
});

test('lỗi: hiện đúng error.data.message từ backend', () => {
  useGetMyPositionsQueryMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    error: { data: { message: 'Không thể kết nối tới máy chủ' } },
  });
  render(<LopHocPage />);
  expect(screen.getByText('Không thể kết nối tới máy chủ')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Không thể kết nối tới máy chủ');
});

test('lỗi không kèm message cụ thể: hiện fallback thay vì màn trắng', () => {
  useGetMyPositionsQueryMock.mockReturnValue({ data: undefined, isLoading: false, error: {} });
  render(<LopHocPage />);
  expect(screen.getByText('Không tải được danh sách lớp, vui lòng thử lại')).toBeInTheDocument();
});

test('mảng rỗng: hiện đúng CTA to, rõ, không hiện skeleton/danh sách', () => {
  useGetMyPositionsQueryMock.mockReturnValue({ data: [], isLoading: false, error: undefined });
  render(<LopHocPage />);
  expect(screen.getByText('Bạn chưa giữ vị trí nào')).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Xem lớp' })).not.toBeInTheDocument();
});

test('2 phần tử: hiện đúng 2 thẻ, đúng loại vị trí, đúng href từng link', () => {
  useGetMyPositionsQueryMock.mockReturnValue({
    data: [
      { id: 'p1', type: 'HOMEROOM', class: { id: 'c1', code: 'L10A1', name: 'Lớp 10A1' } },
      { id: 'p2', type: 'SUBJECT', subject: 'Toán', class: { id: 'c2', code: 'L10A2', name: 'Lớp 10A2' } },
    ],
    isLoading: false,
    error: undefined,
  });
  render(<LopHocPage />);

  expect(screen.getByText('Lớp 10A1')).toBeInTheDocument();
  expect(screen.getByText('L10A1')).toBeInTheDocument();
  expect(screen.getByText('Chủ nhiệm')).toBeInTheDocument();

  expect(screen.getByText('Lớp 10A2')).toBeInTheDocument();
  expect(screen.getByText('L10A2')).toBeInTheDocument();
  expect(screen.getByText('Toán')).toBeInTheDocument();

  const xemLopLinks = screen.getAllByRole('link', { name: 'Xem lớp' });
  expect(xemLopLinks).toHaveLength(2);
  expect(xemLopLinks[0]).toHaveAttribute('href', '/lop-hoc/c1');
  expect(xemLopLinks[1]).toHaveAttribute('href', '/lop-hoc/c2');

  const xemHocSinhLinks = screen.getAllByRole('link', { name: 'Xem học sinh' });
  expect(xemHocSinhLinks).toHaveLength(2);
  expect(xemHocSinhLinks[0]).toHaveAttribute('href', '/lop-hoc/c1/hoc-sinh');
  expect(xemHocSinhLinks[1]).toHaveAttribute('href', '/lop-hoc/c2/hoc-sinh');
});

test('2 nút cố định trên cùng luôn hiện, trỏ đúng path', () => {
  useGetMyPositionsQueryMock.mockReturnValue({ data: [], isLoading: false, error: undefined });
  render(<LopHocPage />);
  expect(screen.getByRole('link', { name: 'Tạo lớp mới' })).toHaveAttribute('href', '/lop-hoc/tao-moi');
  expect(screen.getByRole('link', { name: 'Tham gia bằng mã lớp' })).toHaveAttribute(
    'href',
    '/lop-hoc/tham-gia',
  );
});
