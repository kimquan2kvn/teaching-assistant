import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/lib/store/auth-slice';
import { apiSlice } from '@/lib/store/api-slice';
import { ConductLogFormDialog } from './conduct-log-form-dialog';

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

const getConductCatalogMock = jest.fn();
jest.mock('@/lib/store/conduct-catalog-api', () => ({
  ...jest.requireActual('@/lib/store/conduct-catalog-api'),
  useGetConductCatalogQuery: () => getConductCatalogMock(),
}));

const createConductLogMock = jest.fn();
jest.mock('@/lib/store/conduct-log-api', () => ({
  ...jest.requireActual('@/lib/store/conduct-log-api'),
  useCreateConductLogMutation: () => [createConductLogMock, { isLoading: false }],
}));

const STUDENTS = [
  { _id: 's1', fullName: 'Nguyễn Văn A' },
  { _id: 's2', fullName: 'Trần Thị B' },
];

const CATALOG = [
  { _id: 'ci1', label: 'Nói chuyện riêng', kind: 'VIOLATION', points: 5, specialRule: null, isActive: true },
  { _id: 'ci2', label: 'Giúp đỡ bạn học', kind: 'MERIT', points: 10, specialRule: null, isActive: true },
];

const DETAIL_SINGLE_POSITION = {
  class: { id: 'c1', code: 'X', name: '10A1' },
  positions: [
    { id: 'p-home', type: 'HOMEROOM', subject: undefined, holder: { id: 'teacher-1', fullName: 'Cô A' } },
    { id: 'p-subj', type: 'SUBJECT', subject: 'Toán', holder: { id: 'teacher-2', fullName: 'Thầy B' } },
  ],
};

const DETAIL_TWO_POSITIONS = {
  class: { id: 'c1', code: 'X', name: '10A1' },
  positions: [
    { id: 'p-home', type: 'HOMEROOM', subject: undefined, holder: { id: 'teacher-1', fullName: 'Cô A' } },
    { id: 'p-subj', type: 'SUBJECT', subject: 'Toán', holder: { id: 'teacher-1', fullName: 'Cô A' } },
  ],
};

function renderDialog({ user = { id: 'teacher-1', role: 'TEACHER' }, onOpenChange = jest.fn() } = {}) {
  const store = configureStore({
    reducer: { auth: authReducer, [apiSlice.reducerPath]: apiSlice.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(apiSlice.middleware),
    preloadedState: { auth: { user, accessToken: 'token' } },
  });
  return render(
    <Provider store={store}>
      <ConductLogFormDialog open onOpenChange={onOpenChange} classId="c1" />
    </Provider>,
  );
}

beforeEach(() => {
  getClassDetailMock.mockReset();
  getStudentsMock.mockReset();
  getConductCatalogMock.mockReset();
  createConductLogMock.mockReset();
  getClassDetailMock.mockReturnValue({ data: DETAIL_SINGLE_POSITION, isLoading: false });
  getStudentsMock.mockReturnValue({ data: STUDENTS, isLoading: false });
  getConductCatalogMock.mockReturnValue({ data: CATALOG, isLoading: false });
  createConductLogMock.mockReturnValue({
    unwrap: () => Promise.resolve({ conductLog: { _id: 'cl1', points: -5 }, punishments: [] }),
  });
});

test('chỉ giữ 1 vị trí ghi được → KHÔNG hiện bộ chọn vị trí', () => {
  renderDialog();
  expect(screen.queryByLabelText('Vị trí ghi')).not.toBeInTheDocument();
});

test('giữ cả HOMEROOM lẫn SUBJECT của cùng lớp → hiện bộ chọn vị trí, mặc định HOMEROOM', () => {
  getClassDetailMock.mockReturnValue({ data: DETAIL_TWO_POSITIONS, isLoading: false });
  renderDialog();
  const select = screen.getByLabelText('Vị trí ghi');
  expect(select).toBeInTheDocument();
  expect(select.value).toBe('p-home');
});

test('(a) ô tìm nhanh gõ 1 phần label → chỉ còn item khớp hiển thị', async () => {
  renderDialog();
  expect(screen.getByRole('button', { name: /Nói chuyện riêng/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Giúp đỡ bạn học/ })).toBeInTheDocument();

  await userEvent.type(screen.getByPlaceholderText('Tìm trong danh mục...'), 'nói');

  expect(screen.getByRole('button', { name: /Nói chuyện riêng/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Giúp đỡ bạn học/ })).not.toBeInTheDocument();
});

test('(b) tab "Khác" nhập điểm vượt MAX_VIOLATION_POINTS → nút Ghi nhận bị disabled, không gọi API', async () => {
  renderDialog();
  await userEvent.click(screen.getByRole('button', { name: 'Khác' }));
  await userEvent.selectOptions(screen.getByLabelText('Học sinh'), 's1');
  await userEvent.type(screen.getByLabelText('Điểm'), '60');
  await userEvent.type(screen.getByLabelText('Ghi chú'), 'Lý do bất kỳ');

  expect(screen.getByText(/vượt quá giới hạn/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ghi nhận' })).toBeDisabled();

  await userEvent.click(screen.getByRole('button', { name: 'Ghi nhận' }));
  expect(createConductLogMock).not.toHaveBeenCalled();
});

test('(c) submit thành công (từ danh mục) với response.punishments có 1 phần tử → hiện đúng banner số dòng/hạn nộp', async () => {
  createConductLogMock.mockReturnValue({
    unwrap: () =>
      Promise.resolve({
        conductLog: { _id: 'cl1', points: -5 },
        punishments: [{ _id: 'pu1', kind: 'WEEKLY_THRESHOLD', lines: 20, dueDate: '2026-10-20T00:00:00.000Z' }],
      }),
  });
  const onOpenChange = jest.fn();
  renderDialog({ onOpenChange });

  await userEvent.selectOptions(screen.getByLabelText('Học sinh'), 's1');
  await userEvent.click(screen.getByRole('button', { name: /Nói chuyện riêng/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Ghi nhận' }));

  expect(await screen.findByText('Đã tự tạo 1 chép phạt')).toBeInTheDocument();
  expect(screen.getByText(/20 dòng/)).toBeInTheDocument();
  expect(screen.getByText(/20\/10\/2026/)).toBeInTheDocument();
  expect(createConductLogMock).toHaveBeenCalledWith({
    positionId: 'p-home',
    classId: 'c1',
    studentId: 's1',
    catalogItemId: 'ci1',
  });
  // Dialog KHÔNG tự đóng khi có banner — giáo viên phải đọc xong rồi tự bấm Đóng.
  expect(onOpenChange).not.toHaveBeenCalledWith(false);
});

test('submit thành công KHÔNG có punishments → tự đóng dialog, không hiện banner', async () => {
  const onOpenChange = jest.fn();
  renderDialog({ onOpenChange });

  await userEvent.selectOptions(screen.getByLabelText('Học sinh'), 's1');
  await userEvent.click(screen.getByRole('button', { name: /Nói chuyện riêng/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Ghi nhận' }));

  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(screen.queryByText(/Đã tự tạo/)).not.toBeInTheDocument();
});

test('submit thất bại hiện đúng error.data.message, dialog không đóng', async () => {
  createConductLogMock.mockReturnValue({
    unwrap: () =>
      Promise.reject({
        status: 400,
        data: {
          message:
            'Dữ liệu gửi lên không hợp lệ: Điểm vượt quá giới hạn cho phép theo loại (vi phạm tối đa 50, điểm cộng tối đa 30)',
        },
      }),
  });
  const onOpenChange = jest.fn();
  renderDialog({ onOpenChange });

  await userEvent.selectOptions(screen.getByLabelText('Học sinh'), 's1');
  await userEvent.click(screen.getByRole('button', { name: /Nói chuyện riêng/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Ghi nhận' }));

  expect(
    await screen.findByText(
      'Dữ liệu gửi lên không hợp lệ: Điểm vượt quá giới hạn cho phép theo loại (vi phạm tối đa 50, điểm cộng tối đa 30)',
    ),
  ).toBeInTheDocument();
  expect(onOpenChange).not.toHaveBeenCalledWith(false);
});

test('lỗi submit hiện bằng Alert shadcn (role=alert, biến thể destructive)', async () => {
  createConductLogMock.mockReturnValue({
    unwrap: () => Promise.reject({ status: 400, data: { message: 'Ghi nhận bị từ chối' } }),
  });
  renderDialog();

  await userEvent.selectOptions(screen.getByLabelText('Học sinh'), 's1');
  await userEvent.click(screen.getByRole('button', { name: /Nói chuyện riêng/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Ghi nhận' }));

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Ghi nhận bị từ chối');
  expect(alert).toHaveClass('bg-danger-soft');
});

test('banner chép phạt tự tạo là Alert shadcn role=status', async () => {
  createConductLogMock.mockReturnValue({
    unwrap: () =>
      Promise.resolve({
        conductLog: { _id: 'cl1', points: -5 },
        punishments: [{ _id: 'pu1', kind: 'WEEKLY_THRESHOLD', lines: 20, dueDate: '2026-10-20T00:00:00.000Z' }],
      }),
  });
  renderDialog();

  await userEvent.selectOptions(screen.getByLabelText('Học sinh'), 's1');
  await userEvent.click(screen.getByRole('button', { name: /Nói chuyện riêng/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Ghi nhận' }));

  const banner = await screen.findByRole('status');
  expect(banner).toHaveTextContent('Đã tự tạo 1 chép phạt');
  expect(banner).toHaveClass('bg-danger-soft');
});
