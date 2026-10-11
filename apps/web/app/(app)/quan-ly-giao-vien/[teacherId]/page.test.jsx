import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeacherPositionsPage from './page';

const useGetTeacherPositionsQueryMock = jest.fn();
const useGetTeachersQueryMock = jest.fn();
const reassignPositionMock = jest.fn();
const refetchMock = jest.fn();

jest.mock('@/lib/store/admin-api', () => ({
  ...jest.requireActual('@/lib/store/admin-api'),
  useGetTeacherPositionsQuery: (...args) => useGetTeacherPositionsQueryMock(...args),
  useGetTeachersQuery: (...args) => useGetTeachersQueryMock(...args),
}));

jest.mock('@/lib/store/positions-api', () => ({
  ...jest.requireActual('@/lib/store/positions-api'),
  useReassignPositionMutation: () => [reassignPositionMock, { isLoading: false }],
}));

const positions = [
  {
    id: 'pos-1',
    type: 'HOMEROOM',
    subject: undefined,
    class: { id: 'class-1', code: '10A1-ABCDE', name: '10A1' },
  },
  {
    id: 'pos-2',
    type: 'SUBJECT',
    subject: 'Toán',
    class: { id: 'class-2', code: '11B2-XYZ12', name: '11B2' },
  },
];

// teacher-1 là chính giáo viên đang xem trang (viewedTeacherId trong test) — phải bị loại khỏi danh sách chọn.
const teachers = [
  { id: 'teacher-1', username: 'gv1', fullName: 'Nguyễn Văn A', isActive: true },
  { id: 'teacher-2', username: 'gv2', fullName: 'Trần Thị B', isActive: true },
  { id: 'teacher-3', username: 'gv3', fullName: 'Lê Văn C', isActive: true },
];

beforeEach(() => {
  useGetTeacherPositionsQueryMock.mockReset();
  useGetTeachersQueryMock.mockReset();
  reassignPositionMock.mockReset();
  refetchMock.mockReset();

  useGetTeacherPositionsQueryMock.mockReturnValue({
    data: positions,
    isLoading: false,
    error: undefined,
    refetch: refetchMock,
  });
  useGetTeachersQueryMock.mockReturnValue({ data: teachers, isLoading: false, error: undefined });
});

function renderPage() {
  return render(<TeacherPositionsPage params={{ teacherId: 'teacher-1' }} />);
}

async function openFirstReassignDialog() {
  await userEvent.click(screen.getAllByRole('button', { name: 'Gán lại cho giáo viên khác' })[0]);
  return screen.findByLabelText('Giáo viên mới');
}

test('hiện danh sách vị trí: tên lớp + loại vị trí/môn', () => {
  renderPage();

  expect(screen.getByText('10A1')).toBeInTheDocument();
  expect(screen.getByText('Chủ nhiệm')).toBeInTheDocument();
  expect(screen.getByText('11B2')).toBeInTheDocument();
  expect(screen.getByText('Toán')).toBeInTheDocument();
});

test('mỗi thẻ vị trí có link "Xem lớp" trỏ đúng /lop-hoc/{class.id} của chính lớp đó', () => {
  renderPage();

  // Gắn theo từng thẻ (không theo thứ tự) để bắt lỗi dùng nhầm id của thẻ khác.
  const homeroomCard = screen.getByText('10A1').closest('li');
  const subjectCard = screen.getByText('11B2').closest('li');
  expect(within(homeroomCard).getByRole('link', { name: 'Xem lớp' })).toHaveAttribute('href', '/lop-hoc/class-1');
  expect(within(subjectCard).getByRole('link', { name: 'Xem lớp' })).toHaveAttribute('href', '/lop-hoc/class-2');
});

test('dialog gán lại KHÔNG hiện chính giáo viên đang xem trang trong danh sách chọn', async () => {
  renderPage();

  const select = await openFirstReassignDialog();
  const optionTexts = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);

  expect(optionTexts).not.toContain('Nguyễn Văn A');
  expect(optionTexts).toContain('Trần Thị B');
  expect(optionTexts).toContain('Lê Văn C');
});

test('xác nhận gán lại gọi đúng {positionId, teacherId, classId, oldTeacherId}', async () => {
  reassignPositionMock.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  renderPage();

  const select = await openFirstReassignDialog();
  await userEvent.selectOptions(select, 'teacher-2');
  await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

  await waitFor(() => expect(reassignPositionMock).toHaveBeenCalledTimes(1));
  expect(reassignPositionMock).toHaveBeenCalledWith({
    positionId: 'pos-1',
    teacherId: 'teacher-2',
    classId: 'class-1',
    oldTeacherId: 'teacher-1',
  });
});

test('gán lại thành công thì tự refetch lại CHÍNH danh sách vị trí hiện tại (không gộp tag phức tạp)', async () => {
  reassignPositionMock.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  renderPage();

  const select = await openFirstReassignDialog();
  await userEvent.selectOptions(select, 'teacher-2');
  await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

  await waitFor(() => expect(refetchMock).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('gán lại thất bại hiện đúng error.data.message, không đóng dialog, không refetch', async () => {
  reassignPositionMock.mockReturnValue({
    unwrap: () => Promise.reject({ data: { message: 'Vị trí đã bị gán cho người khác' } }),
  });
  renderPage();

  const select = await openFirstReassignDialog();
  await userEvent.selectOptions(select, 'teacher-2');
  await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

  expect(await screen.findByText('Vị trí đã bị gán cho người khác')).toBeInTheDocument();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(refetchMock).not.toHaveBeenCalled();
});
