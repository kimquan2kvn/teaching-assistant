import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { makeStore } from '@/lib/store/store';
import NhapExcelPage from './page';

const importPreviewMock = jest.fn();
const importConfirmMock = jest.fn();
jest.mock('@/lib/store/students-api', () => ({
  ...jest.requireActual('@/lib/store/students-api'),
  useImportPreviewMutation: () => [importPreviewMock, { isLoading: false }],
  useImportConfirmMutation: () => [importConfirmMock, { isLoading: false }],
}));

beforeEach(() => {
  importPreviewMock.mockClear();
  importConfirmMock.mockClear();
});

function renderPage(classId = 'class-1') {
  return render(
    <Provider store={makeStore()}>
      <NhapExcelPage params={{ classId }} />
    </Provider>,
  );
}

function makeFile(name = 'hoc-sinh.xlsx') {
  return new File(['dummy'], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

test('chọn file và bấm "Xem trước" gọi đúng importPreview({classId, file})', async () => {
  importPreviewMock.mockReturnValue({ unwrap: () => Promise.resolve({ rows: [] }) });
  renderPage();

  const file = makeFile();
  await userEvent.upload(screen.getByLabelText('Chọn file Excel'), file);
  await userEvent.click(screen.getByRole('button', { name: 'Xem trước' }));

  expect(importPreviewMock).toHaveBeenCalledWith({ classId: 'class-1', file });
});

test('preview trả 1 dòng lỗi → nút "Xác nhận nhập" bị disable, hiện ĐÚNG message lỗi backend (nguyên văn)', async () => {
  importPreviewMock.mockReturnValue({
    unwrap: () =>
      Promise.resolve({
        rows: [
          { rowNumber: 2, fullName: '', dob: undefined, errors: ['Họ và tên không được để trống'] },
          {
            rowNumber: 3,
            fullName: 'Nguyễn Văn A',
            dob: '2015-05-20T00:00:00.000Z',
            errors: [],
          },
        ],
      }),
  });
  renderPage();

  await userEvent.upload(screen.getByLabelText('Chọn file Excel'), makeFile());
  await userEvent.click(screen.getByRole('button', { name: 'Xem trước' }));

  expect(await screen.findByText('Họ và tên không được để trống')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Xác nhận nhập' })).toBeDisabled();
});

test('preview trả 1 dòng lỗi ngày sinh → hiện đúng message "Ngày sinh không hợp lệ (định dạng dd/mm/yyyy)"', async () => {
  importPreviewMock.mockReturnValue({
    unwrap: () =>
      Promise.resolve({
        rows: [
          {
            rowNumber: 2,
            fullName: 'Nguyễn Văn A',
            dob: undefined,
            errors: ['Ngày sinh không hợp lệ (định dạng dd/mm/yyyy)'],
          },
        ],
      }),
  });
  renderPage();

  await userEvent.upload(screen.getByLabelText('Chọn file Excel'), makeFile());
  await userEvent.click(screen.getByRole('button', { name: 'Xem trước' }));

  expect(await screen.findByText('Ngày sinh không hợp lệ (định dạng dd/mm/yyyy)')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Xác nhận nhập' })).toBeDisabled();
});

test('preview toàn bộ hợp lệ → nút "Xác nhận nhập" bật, bấm gọi đúng payload đã lược rowNumber/errors', async () => {
  importPreviewMock.mockReturnValue({
    unwrap: () =>
      Promise.resolve({
        rows: [
          { rowNumber: 2, fullName: 'Nguyễn Văn A', dob: '2015-05-20T00:00:00.000Z', errors: [] },
          { rowNumber: 3, fullName: 'Trần Thị B', dob: undefined, errors: [] },
        ],
      }),
  });
  importConfirmMock.mockReturnValue({ unwrap: () => Promise.resolve([{ _id: '1' }, { _id: '2' }]) });
  renderPage();

  await userEvent.upload(screen.getByLabelText('Chọn file Excel'), makeFile());
  await userEvent.click(screen.getByRole('button', { name: 'Xem trước' }));

  const confirmButton = await screen.findByRole('button', { name: 'Xác nhận nhập' });
  expect(confirmButton).toBeEnabled();
  await userEvent.click(confirmButton);

  expect(importConfirmMock).toHaveBeenCalledWith({
    classId: 'class-1',
    rows: [
      { fullName: 'Nguyễn Văn A', dob: '2015-05-20T00:00:00.000Z' },
      { fullName: 'Trần Thị B', dob: undefined },
    ],
  });
  expect(await screen.findByText('Đã nhập 2 học sinh')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Xem danh sách học sinh' })).toHaveAttribute(
    'href',
    '/lop-hoc/class-1/hoc-sinh',
  );
});

test('bảng xem trước cuộn ngang được trên màn hình hẹp (mobile), không làm tràn cả trang', async () => {
  importPreviewMock.mockReturnValue({
    unwrap: () =>
      Promise.resolve({
        rows: [{ rowNumber: 2, fullName: 'Nguyễn Văn A', dob: '2015-05-20T00:00:00.000Z', errors: [] }],
      }),
  });
  renderPage();

  await userEvent.upload(screen.getByLabelText('Chọn file Excel'), makeFile());
  await userEvent.click(screen.getByRole('button', { name: 'Xem trước' }));

  const table = await screen.findByRole('table');
  expect(table.closest('[class*="overflow-x-auto"]')).not.toBeNull();
});

test('confirm thất bại (400) giữ nguyên bảng preview trên màn hình, hiện ĐÚNG message lỗi backend', async () => {
  importPreviewMock.mockReturnValue({
    unwrap: () =>
      Promise.resolve({
        rows: [{ rowNumber: 2, fullName: 'Nguyễn Văn A', dob: '2015-05-20T00:00:00.000Z', errors: [] }],
      }),
  });
  importConfirmMock.mockReturnValue({
    unwrap: () => Promise.reject({ data: { message: 'Dòng thứ 1 thiếu họ và tên, không lưu được' } }),
  });
  renderPage();

  await userEvent.upload(screen.getByLabelText('Chọn file Excel'), makeFile());
  await userEvent.click(screen.getByRole('button', { name: 'Xem trước' }));

  const confirmButton = await screen.findByRole('button', { name: 'Xác nhận nhập' });
  await userEvent.click(confirmButton);

  expect(await screen.findByText('Dòng thứ 1 thiếu họ và tên, không lưu được')).toBeInTheDocument();
  // Bảng preview không bị xoá: vẫn thấy đúng dữ liệu dòng đã preview và nút xác nhận vẫn còn để bấm lại.
  expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Xác nhận nhập' })).toBeInTheDocument();
});

test('preview lỗi 413 "File too large" (tiếng Anh của multer) → hiện câu tiếng Việt, không lộ tiếng Anh', async () => {
  importPreviewMock.mockReturnValue({
    unwrap: () => Promise.reject({ status: 413, data: { message: 'File too large' } }),
  });
  renderPage();

  await userEvent.upload(screen.getByLabelText('Chọn file Excel'), makeFile());
  await userEvent.click(screen.getByRole('button', { name: 'Xem trước' }));

  expect(await screen.findByText('Dữ liệu hoặc file gửi lên quá lớn')).toBeInTheDocument();
  expect(screen.queryByText('File too large')).not.toBeInTheDocument();
});

test('preview lỗi 400 tiếng Việt của backend → vẫn hiện nguyên văn', async () => {
  importPreviewMock.mockReturnValue({
    unwrap: () => Promise.reject({ status: 400, data: { message: 'File Excel không có dữ liệu' } }),
  });
  renderPage();

  await userEvent.upload(screen.getByLabelText('Chọn file Excel'), makeFile());
  await userEvent.click(screen.getByRole('button', { name: 'Xem trước' }));

  expect(await screen.findByText('File Excel không có dữ liệu')).toBeInTheDocument();
});

test('preview lỗi mạng (không có data) → hiện câu dự phòng "Đọc file thất bại, vui lòng thử lại"', async () => {
  importPreviewMock.mockReturnValue({ unwrap: () => Promise.reject({ status: 'FETCH_ERROR' }) });
  renderPage();

  await userEvent.upload(screen.getByLabelText('Chọn file Excel'), makeFile());
  await userEvent.click(screen.getByRole('button', { name: 'Xem trước' }));

  expect(await screen.findByText('Đọc file thất bại, vui lòng thử lại')).toBeInTheDocument();
});

test('confirm lỗi 413 "File too large" → hiện câu tiếng Việt và giữ bảng preview', async () => {
  importPreviewMock.mockReturnValue({
    unwrap: () =>
      Promise.resolve({
        rows: [{ rowNumber: 2, fullName: 'Nguyễn Văn A', dob: '2015-05-20T00:00:00.000Z', errors: [] }],
      }),
  });
  importConfirmMock.mockReturnValue({
    unwrap: () => Promise.reject({ status: 413, data: { message: 'File too large' } }),
  });
  renderPage();

  await userEvent.upload(screen.getByLabelText('Chọn file Excel'), makeFile());
  await userEvent.click(screen.getByRole('button', { name: 'Xem trước' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận nhập' }));

  expect(await screen.findByText('Dữ liệu hoặc file gửi lên quá lớn')).toBeInTheDocument();
  expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
});

test('confirm lỗi mạng (không có data) → hiện câu dự phòng "Xác nhận nhập thất bại, vui lòng thử lại"', async () => {
  importPreviewMock.mockReturnValue({
    unwrap: () =>
      Promise.resolve({
        rows: [{ rowNumber: 2, fullName: 'Nguyễn Văn A', dob: '2015-05-20T00:00:00.000Z', errors: [] }],
      }),
  });
  importConfirmMock.mockReturnValue({ unwrap: () => Promise.reject({ status: 'FETCH_ERROR' }) });
  renderPage();

  await userEvent.upload(screen.getByLabelText('Chọn file Excel'), makeFile());
  await userEvent.click(screen.getByRole('button', { name: 'Xem trước' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận nhập' }));

  expect(await screen.findByText('Xác nhận nhập thất bại, vui lòng thử lại')).toBeInTheDocument();
});
