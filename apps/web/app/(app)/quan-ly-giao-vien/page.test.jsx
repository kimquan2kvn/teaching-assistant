import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { makeStore } from '@/lib/store/store';
import QuanLyGiaoVienPage from './page';

const setTeacherActiveMock = jest.fn();
let teachersData;

jest.mock('@/lib/store/admin-api', () => ({
  ...jest.requireActual('@/lib/store/admin-api'),
  useGetTeachersQuery: () => ({ data: teachersData, isLoading: false, isError: false }),
  useSetTeacherActiveMutation: () => [setTeacherActiveMock, { isLoading: false }],
}));

beforeEach(() => {
  setTeacherActiveMock.mockClear();
  setTeacherActiveMock.mockReturnValue({ unwrap: () => Promise.resolve({ success: true }) });
});

function renderPage() {
  return render(
    <Provider store={makeStore()}>
      <QuanLyGiaoVienPage />
    </Provider>,
  );
}

test('giáo viên isActive: true hiện nút "Khóa", bấm xác nhận gọi đúng {id, isActive: false}', async () => {
  teachersData = [{ id: 'gv-1', username: 'gv01', fullName: 'Nguyễn Văn A', isActive: true }];
  renderPage();

  expect(screen.getByText('Hoạt động')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Xem vị trí' })).toHaveAttribute(
    'href',
    '/quan-ly-giao-vien/gv-1',
  );

  await userEvent.click(screen.getByRole('button', { name: 'Khóa' }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

  expect(setTeacherActiveMock).toHaveBeenCalledWith({ id: 'gv-1', isActive: false });
});

test('giáo viên isActive: false hiện nút "Mở khóa", bấm xác nhận gọi đúng {id, isActive: true}', async () => {
  teachersData = [{ id: 'gv-2', username: 'gv02', fullName: 'Trần Thị B', isActive: false }];
  renderPage();

  expect(screen.getByText('Đã khóa')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Xem vị trí' })).toHaveAttribute(
    'href',
    '/quan-ly-giao-vien/gv-2',
  );

  await userEvent.click(screen.getByRole('button', { name: 'Mở khóa' }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

  expect(setTeacherActiveMock).toHaveBeenCalledWith({ id: 'gv-2', isActive: true });
});

test('bảng giáo viên cuộn ngang được trên màn hình hẹp (mobile), không làm tràn cả trang', () => {
  teachersData = [{ id: 'gv-1', username: 'gv01', fullName: 'Nguyễn Văn A', isActive: true }];
  renderPage();
  const table = screen.getByRole('table');
  expect(table.closest('[class*="overflow-x-auto"]')).not.toBeNull();
});

test('khóa/mở khóa thất bại hiện đúng error.data.message, KHÔNG đóng dialog', async () => {
  teachersData = [{ id: 'gv-1', username: 'gv01', fullName: 'Nguyễn Văn A', isActive: true }];
  setTeacherActiveMock.mockReturnValue({
    unwrap: () => Promise.reject({ status: 404, data: { message: 'Không tìm thấy giáo viên với mã này' } }),
  });
  renderPage();

  await userEvent.click(screen.getByRole('button', { name: 'Khóa' }));
  await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

  expect(await screen.findByText('Không tìm thấy giáo viên với mã này')).toBeInTheDocument();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
