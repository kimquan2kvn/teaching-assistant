import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/lib/store/auth-slice';
import { apiSlice } from '@/lib/store/api-slice';
import DanhMucViPhamPage from './page';

const getConductCatalogMock = jest.fn();
const createConductCatalogItemMock = jest.fn();
const updateConductCatalogItemMock = jest.fn();
jest.mock('@/lib/store/conduct-catalog-api', () => ({
  ...jest.requireActual('@/lib/store/conduct-catalog-api'),
  useGetConductCatalogQuery: () => getConductCatalogMock(),
  useCreateConductCatalogItemMutation: () => [createConductCatalogItemMock, { isLoading: false }],
  useUpdateConductCatalogItemMutation: () => [updateConductCatalogItemMock, { isLoading: false }],
}));

const CATALOG = [
  { _id: 'ci1', label: 'Nói chuyện riêng', kind: 'VIOLATION', points: 5, specialRule: null, isActive: true },
  { _id: 'ci2', label: 'Giúp đỡ bạn học', kind: 'MERIT', points: 10, specialRule: null, isActive: true },
];

function renderPage(user = { id: 'admin-1', role: 'ADMIN' }) {
  const store = configureStore({
    reducer: { auth: authReducer, [apiSlice.reducerPath]: apiSlice.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(apiSlice.middleware),
    preloadedState: { auth: { user, accessToken: 'token' } },
  });
  return render(
    <Provider store={store}>
      <DanhMucViPhamPage />
    </Provider>,
  );
}

beforeEach(() => {
  getConductCatalogMock.mockReset();
  createConductCatalogItemMock.mockReset();
  updateConductCatalogItemMock.mockReset();
  getConductCatalogMock.mockReturnValue({ data: CATALOG, isLoading: false });
  createConductCatalogItemMock.mockReturnValue({ unwrap: () => Promise.resolve({ _id: 'ci3' }) });
  updateConductCatalogItemMock.mockReturnValue({ unwrap: () => Promise.resolve({ _id: 'ci1', isActive: false }) });
});

test('ADMIN thấy bảng danh mục + nút "Thêm mới" và nút ẩn/hiện từng dòng', () => {
  renderPage({ id: 'admin-1', role: 'ADMIN' });

  const table = within(screen.getByRole('table'));
  expect(table.getByText('Nói chuyện riêng')).toBeInTheDocument();
  expect(table.getByText('Giúp đỡ bạn học')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Thêm mới' })).toBeInTheDocument();
  expect(table.getAllByRole('button', { name: 'Ẩn' })).toHaveLength(2);
});

test('(e) TEACHER không phải ADMIN KHÔNG thấy nút "Thêm mới"/"Ẩn" (vẫn xem được bảng)', () => {
  renderPage({ id: 'teacher-1', role: 'TEACHER' });

  const table = within(screen.getByRole('table'));
  expect(table.getByText('Nói chuyện riêng')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Thêm mới' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Ẩn' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Hiện' })).not.toBeInTheDocument();
});

test('(f) tạo item với points vượt giới hạn → hiện ĐÚNG message backend đã vá (chứa "tối đa 50"), không phải "points: không hợp lệ"', async () => {
  createConductCatalogItemMock.mockReturnValue({
    unwrap: () =>
      Promise.reject({
        status: 400,
        data: {
          message:
            'Dữ liệu gửi lên không hợp lệ: Điểm vượt quá giới hạn cho phép theo loại (vi phạm tối đa 50, điểm cộng tối đa 30)',
        },
      }),
  });
  renderPage({ id: 'admin-1', role: 'ADMIN' });

  await userEvent.click(screen.getByRole('button', { name: 'Thêm mới' }));
  await userEvent.type(screen.getByLabelText('Nhãn'), 'Nghỉ học không phép');
  await userEvent.type(screen.getByLabelText('Điểm'), '60');
  await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

  expect(
    await screen.findByText(
      'Dữ liệu gửi lên không hợp lệ: Điểm vượt quá giới hạn cho phép theo loại (vi phạm tối đa 50, điểm cộng tối đa 30)',
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText('points: không hợp lệ')).not.toBeInTheDocument();
});

test('bấm "Ẩn" mở dialog xác nhận, xác nhận gọi đúng updateConductCatalogItem({id, isActive:false})', async () => {
  renderPage({ id: 'admin-1', role: 'ADMIN' });

  const table = within(screen.getByRole('table'));
  const row = table.getByText('Nói chuyện riêng').closest('tr');
  await userEvent.click(within(row).getByRole('button', { name: 'Ẩn' }));

  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

  expect(updateConductCatalogItemMock).toHaveBeenCalledWith({ id: 'ci1', isActive: false });
});

test('submit form thêm mới thành công gọi đúng createConductCatalogItem kèm body', async () => {
  renderPage({ id: 'admin-1', role: 'ADMIN' });

  await userEvent.click(screen.getByRole('button', { name: 'Thêm mới' }));
  await userEvent.type(screen.getByLabelText('Nhãn'), 'Nghỉ học không phép');
  await userEvent.selectOptions(screen.getByLabelText('Loại'), 'VIOLATION');
  await userEvent.type(screen.getByLabelText('Điểm'), '10');
  await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

  expect(createConductCatalogItemMock).toHaveBeenCalledWith({
    label: 'Nghỉ học không phép',
    kind: 'VIOLATION',
    points: 10,
  });
});
