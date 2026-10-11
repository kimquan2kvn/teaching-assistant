import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { PPCT_IMPORT_HEADERS } from '@so-chu-nhiem/shared';
import authReducer from '@/lib/store/auth-slice';
import { apiSlice } from '@/lib/store/api-slice';
import { CLASS_DETAIL } from '@/lib/test-fixtures/phase3';
import NhapExcelPpctPage from './page';

const getClassDetailMock = jest.fn();
jest.mock('@/lib/store/classes-api', () => ({
  ...jest.requireActual('@/lib/store/classes-api'),
  useGetClassDetailQuery: (classId, options) => getClassDetailMock(classId, options),
}));

// isLoading của 2 mutation đổi được theo từng test: hook mock đọc `loading` mỗi lần render.
const loading = { preview: false, commit: false };
const importPreviewMock = jest.fn();
const importCommitMock = jest.fn();
jest.mock('@/lib/store/ppct-api', () => ({
  ...jest.requireActual('@/lib/store/ppct-api'),
  useImportPpctPreviewMutation: () => [importPreviewMock, { isLoading: loading.preview }],
  useImportPpctCommitMutation: () => [importCommitMock, { isLoading: loading.commit }],
}));

const GVBM_TOAN = { id: 'u-toan', role: 'TEACHER' };
const GVBM_VAN = { id: 'u-van', role: 'TEACHER' };
const GVCN = { id: 'u-gvcn', role: 'TEACHER' };
const ADMIN = { id: 'u-admin', role: 'ADMIN' };
const STUDENT = { id: 'u-hs', role: 'STUDENT' };

const WEEK_ERROR = 'Tuần phải là số nguyên từ 1 đến 60';
const TITLE_ERROR = 'Bài học không được để trống';
const PERIOD_COUNT_ERROR = 'Số tiết phải là số nguyên từ 1 đến 10';
const PERIOD_LABEL_ERROR = 'Tiết thứ không được để trống';

beforeEach(() => {
  getClassDetailMock.mockReset();
  importPreviewMock.mockReset();
  importCommitMock.mockReset();
  loading.preview = false;
  loading.commit = false;
  getClassDetailMock.mockReturnValue({ data: CLASS_DETAIL, isLoading: false });
});

// Mẫu thật của 1 dòng preview (ppct-import.ts ở backend): week/periodCount là null khi ô sai, note luôn là chuỗi.
function makePreviewRow(overrides = {}) {
  return {
    rowNumber: 2,
    week: 1,
    title: 'Bài 1',
    periodCount: 1,
    periodLabel: '1',
    requirement: '',
    note: '',
    errors: [],
    ...overrides,
  };
}

function makeInvalidRow(overrides = {}) {
  return makePreviewRow({
    rowNumber: 2,
    week: null,
    title: '',
    periodCount: 0,
    periodLabel: '',
    errors: [WEEK_ERROR, TITLE_ERROR, PERIOD_COUNT_ERROR, PERIOD_LABEL_ERROR],
    ...overrides,
  });
}

function makeValidRow(overrides = {}) {
  return makePreviewRow({ rowNumber: 3, requirement: 'Nắm được', ...overrides });
}

function renderPage({ user = GVBM_TOAN, searchParams = { positionId: 'p-toan' }, classId = 'class-1' } = {}) {
  const store = configureStore({
    reducer: { auth: authReducer, [apiSlice.reducerPath]: apiSlice.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(apiSlice.middleware),
    preloadedState: { auth: { user, accessToken: user ? 'token' : null } },
  });
  const pageFor = (nextSearchParams) => (
    <Provider store={store}>
      <NhapExcelPpctPage params={{ classId }} searchParams={nextSearchParams} />
    </Provider>
  );
  const utils = render(pageFor(searchParams));
  // Giả lập đổi query trên URL khi trang vẫn đang mở (cùng store, cùng cây React).
  return { ...utils, changeSearchParams: (nextSearchParams) => utils.rerender(pageFor(nextSearchParams)) };
}

function makeFile(name = 'ppct-toan.xlsx') {
  return new File(['dummy'], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function mockPreviewResolves(rows) {
  importPreviewMock.mockReturnValue({ unwrap: () => Promise.resolve({ rows }) });
}

function mockPreviewRejects(error) {
  importPreviewMock.mockReturnValue({ unwrap: () => Promise.reject(error) });
}

function mockCommitResolves(items) {
  importCommitMock.mockReturnValue({ unwrap: () => Promise.resolve(items) });
}

function mockCommitRejects(error) {
  importCommitMock.mockReturnValue({ unwrap: () => Promise.reject(error) });
}

async function chooseFileAndPreview(file = makeFile()) {
  await userEvent.upload(screen.getByLabelText('Chọn file Excel'), file);
  await userEvent.click(screen.getByRole('button', { name: 'Xem trước' }));
}

// Mở trang (GVBM Toán), chọn file, bấm "Xem trước" với backend trả `rows`, chờ bảng xem trước hiện ra.
async function openPreview(rows, options) {
  mockPreviewResolves(rows);
  renderPage(options);
  await chooseFileAndPreview();
  return screen.findByRole('table');
}

async function setCell(label, value) {
  const input = screen.getByLabelText(label);
  await userEvent.clear(input);
  if (value !== '') await userEvent.type(input, value);
}

function rowOf(label) {
  return screen.getByLabelText(label).closest('tr');
}

function confirmButton() {
  return screen.getByRole('button', { name: 'Xác nhận nhập' });
}

describe('vào trang: chọn môn, quyền, tải lớp', () => {
  test('thiếu positionId → "Chưa chọn môn để nhập PPCT" + link về trang PPCT, không có ô chọn file, không tải lớp', () => {
    renderPage({ searchParams: {} });

    expect(screen.getByText('Chưa chọn môn để nhập PPCT')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về trang PPCT' })).toHaveAttribute('href', '/lop-hoc/class-1/ppct');
    expect(screen.queryByLabelText('Chọn file Excel')).toBeNull();
    // Không có môn thì không có gì để hỏi backend: query lớp phải bị bỏ qua.
    expect(getClassDetailMock).toHaveBeenCalledWith('class-1', { skip: true });
  });

  test('GVCN gõ URL của môn Toán (chỉ được xem) → "Bạn không có quyền nhập PPCT cho môn này", KHÔNG có ô chọn file', () => {
    renderPage({ user: GVCN });

    expect(screen.getByText('Bạn không có quyền nhập PPCT cho môn này')).toBeInTheDocument();
    expect(screen.queryByLabelText('Chọn file Excel')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xem trước' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Về trang PPCT' })).toHaveAttribute(
      'href',
      '/lop-hoc/class-1/ppct?positionId=p-toan',
    );
  });

  test('GVBM môn khác (Ngữ văn) gõ URL của môn Toán → bị từ chối', () => {
    renderPage({ user: GVBM_VAN });

    expect(screen.getByText('Bạn không có quyền nhập PPCT cho môn này')).toBeInTheDocument();
    expect(screen.queryByLabelText('Chọn file Excel')).toBeNull();
  });

  test('positionId không thuộc lớp này → bị từ chối, không lộ gì thêm', () => {
    renderPage({ searchParams: { positionId: 'p-cua-lop-khac' } });

    expect(screen.getByText('Bạn không có quyền nhập PPCT cho môn này')).toBeInTheDocument();
    expect(screen.queryByLabelText('Chọn file Excel')).toBeNull();
  });

  test('positionId lặp trên URL (mảng) → coi như chưa chọn môn, không lỗi', () => {
    renderPage({ searchParams: { positionId: ['p-toan', 'p-van'] } });

    expect(screen.getByText('Chưa chọn môn để nhập PPCT')).toBeInTheDocument();
  });

  test('vị trí HOMEROOM không có PPCT → bị từ chối kể cả với ADMIN', () => {
    renderPage({ user: ADMIN, searchParams: { positionId: 'p-hr' } });

    expect(screen.getByText('Bạn không có quyền nhập PPCT cho môn này')).toBeInTheDocument();
    expect(screen.queryByLabelText('Chọn file Excel')).toBeNull();
  });

  test('ADMIN nhập được cho vị trí SUBJECT bất kỳ, kể cả vị trí đang trống người giữ', () => {
    renderPage({ user: ADMIN, searchParams: { positionId: 'p-ly' } });

    expect(screen.getByLabelText('Chọn file Excel')).toBeInTheDocument();
    expect(screen.getByText('Môn Vật lý · Lớp 11A4')).toBeInTheDocument();
  });

  test('chưa khôi phục được người dùng (null) → "Đang tải...", chưa tải lớp và KHÔNG báo "không có quyền"', () => {
    renderPage({ user: null });

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải...');
    expect(screen.queryByText('Bạn không có quyền nhập PPCT cho môn này')).toBeNull();
    expect(getClassDetailMock).not.toHaveBeenCalled();
  });

  test('STUDENT vào thẳng URL → bị RoleGate chặn, không tải lớp, không có ô chọn file', () => {
    renderPage({ user: STUDENT });

    expect(screen.getByText('Bạn không có quyền xem trang này')).toBeInTheDocument();
    expect(screen.queryByLabelText('Chọn file Excel')).toBeNull();
    expect(getClassDetailMock).not.toHaveBeenCalled();
  });

  test('lớp đang tải → "Đang tải...", chưa có ô chọn file', () => {
    getClassDetailMock.mockReturnValue({ isLoading: true });
    renderPage();

    expect(screen.getByText('Đang tải...')).toBeInTheDocument();
    expect(screen.queryByLabelText('Chọn file Excel')).toBeNull();
  });

  test.each([
    [403, 'Bạn không có quyền xem lớp này'],
    [404, 'Không tìm thấy lớp'],
  ])('tải lớp lỗi %i → "%s", KHÔNG có ô chọn file', (status, message) => {
    getClassDetailMock.mockReturnValue({ isLoading: false, isError: true, error: { status } });
    renderPage();

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByLabelText('Chọn file Excel')).toBeNull();
  });

  test('refetch lớp lỗi khi đã có dữ liệu cũ (RTK Query vẫn giữ data) → vẫn hiện trang nhập, không đá người dùng khỏi bảng đang sửa', () => {
    getClassDetailMock.mockReturnValue({
      data: CLASS_DETAIL,
      isLoading: false,
      isError: true,
      error: { status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' },
    });
    renderPage();

    expect(screen.getByLabelText('Chọn file Excel')).toBeInTheDocument();
    expect(screen.queryByText('Không tải được thông tin lớp, vui lòng thử lại')).toBeNull();
  });

  test('tải lớp lỗi khác (500 / mất mạng) → hiện đúng message của backend hoặc câu dự phòng, không nói "không tìm thấy lớp"', () => {
    getClassDetailMock.mockReturnValue({
      isLoading: false,
      isError: true,
      error: { status: 500, data: { message: 'Đã có lỗi xảy ra, vui lòng thử lại sau' } },
    });
    const { unmount } = renderPage();
    expect(screen.getByText('Đã có lỗi xảy ra, vui lòng thử lại sau')).toBeInTheDocument();
    unmount();

    getClassDetailMock.mockReturnValue({
      isLoading: false,
      isError: true,
      error: { status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' },
    });
    renderPage();
    expect(screen.getByText('Không tải được thông tin lớp, vui lòng thử lại')).toBeInTheDocument();
    expect(screen.queryByText('Không tìm thấy lớp')).toBeNull();
  });
});

describe('bước 1: chọn file và xem trước', () => {
  test('GVBM Toán thấy tên môn/lớp, gợi ý đủ 6 tên cột dựng từ PPCT_IMPORT_HEADERS, ô chọn file .xlsx và lưu ý "thêm vào cuối"', () => {
    renderPage();

    expect(screen.getByText('Môn Toán · Lớp 11A4')).toBeInTheDocument();
    expect(PPCT_IMPORT_HEADERS).toHaveLength(6);
    expect(
      screen.getByText(`Dòng 1 là tiêu đề. Các cột: ${PPCT_IMPORT_HEADERS.join(', ')}`),
    ).toBeInTheDocument();
    expect(screen.getByText('Các dòng nhập sẽ được thêm vào cuối PPCT hiện có.')).toBeInTheDocument();
    expect(screen.getByLabelText('Chọn file Excel')).toHaveAttribute('accept', '.xlsx');
    // Chưa có file thì chưa xem trước được.
    expect(screen.getByRole('button', { name: 'Xem trước' })).toBeDisabled();
  });

  test('chọn file + "Xem trước" gọi đúng importPpctPreview({ positionId, file })', async () => {
    mockPreviewResolves([]);
    renderPage();
    const file = makeFile();

    await chooseFileAndPreview(file);

    expect(importPreviewMock).toHaveBeenCalledTimes(1);
    expect(importPreviewMock).toHaveBeenCalledWith({ positionId: 'p-toan', file });
  });

  test('đang xem trước (isLoading) → nút "Xem trước" bị tắt dù đã chọn file', async () => {
    loading.preview = true;
    renderPage();

    await userEvent.upload(screen.getByLabelText('Chọn file Excel'), makeFile());

    expect(screen.getByRole('button', { name: 'Xem trước' })).toBeDisabled();
  });

  test.each([
    [{ status: 400, data: { message: 'File không đúng định dạng Excel (.xlsx)' } }, 'File không đúng định dạng Excel (.xlsx)'],
    [{ status: 400, data: { message: 'File có quá nhiều dòng (tối đa 500)' } }, 'File có quá nhiều dòng (tối đa 500)'],
    [{ status: 400, data: { message: 'Chưa chọn file để import' } }, 'Chưa chọn file để import'],
    [{ status: 413, data: { message: 'File too large' } }, 'File quá lớn (tối đa 5MB)'],
    [{ status: 400, data: { message: 'Multipart: Boundary not found' } }, 'Không đọc được file tải lên, vui lòng chọn lại file'],
    [{ status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' }, 'Đọc file thất bại, vui lòng thử lại'],
  ])('xem trước thất bại %j → hiện "%s", không có bảng', async (error, message) => {
    mockPreviewRejects(error);
    renderPage();

    await chooseFileAndPreview();

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xác nhận nhập' })).toBeNull();
  });

  test('xem trước lỗi sau một lần xem trước thành công → bảng cũ biến mất (không để dữ liệu của file cũ)', async () => {
    mockPreviewResolves([makePreviewRow()]);
    renderPage();
    await chooseFileAndPreview();
    await screen.findByRole('table');

    mockPreviewRejects({ status: 400, data: { message: 'File không đúng định dạng Excel (.xlsx)' } });
    await userEvent.upload(screen.getByLabelText('Chọn file Excel'), makeFile('hong.xlsx'));
    await userEvent.click(screen.getByRole('button', { name: 'Xem trước' }));

    expect(await screen.findByText('File không đúng định dạng Excel (.xlsx)')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('bước 2: bảng xem trước sửa được', () => {
  test('dòng lỗi: 4 message backend hiện nguyên văn, ô số trống (không chữ "null"), nền lỗi, nút xác nhận tắt', async () => {
    await openPreview([makeInvalidRow(), makeValidRow()]);

    for (const message of [WEEK_ERROR, TITLE_ERROR, PERIOD_COUNT_ERROR, PERIOD_LABEL_ERROR]) {
      expect(screen.getByText(message)).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Tuần (dòng 2)')).toHaveValue('');
    expect(screen.queryByDisplayValue('null')).toBeNull();
    expect(screen.getByLabelText('Bài học (dòng 3)')).toHaveValue('Bài 1');
    expect(screen.getByLabelText('Yêu cầu cần đạt (dòng 3)')).toHaveValue('Nắm được');
    expect(rowOf('Tuần (dòng 2)')).toHaveClass('bg-danger-soft');
    expect(rowOf('Tuần (dòng 3)')).not.toHaveClass('bg-danger-soft');
    // Lỗi gắn vào các ô của dòng đó để trình đọc màn hình đọc được khi focus vào ô.
    expect(screen.getByLabelText('Tiết thứ (dòng 2)')).toHaveAccessibleDescription(expect.stringContaining(TITLE_ERROR));
    expect(screen.getByLabelText('Tiết thứ (dòng 3)')).not.toHaveAccessibleDescription();
    expect(confirmButton()).toBeDisabled();
    expect(screen.getByText('Còn 1 dòng lỗi, hãy sửa hoặc xóa trước khi nhập')).toBeInTheDocument();
  });

  test('mỗi dòng có đủ 6 ô sửa được, aria-label dạng "<Tên cột> (dòng N)" theo đúng tên cột của file mẫu', async () => {
    await openPreview([makeValidRow({ rowNumber: 5 })]);

    for (const header of PPCT_IMPORT_HEADERS) {
      expect(screen.getByLabelText(`${header} (dòng 5)`)).toBeInTheDocument();
    }
    expect(within(rowOf('Tuần (dòng 5)')).getByRole('button', { name: 'Xóa dòng' })).toBeInTheDocument();
  });

  test('sửa dòng lỗi thành hợp lệ → hết message của dòng đó, nút xác nhận bật; xác nhận gửi đúng payload (giữ thứ tự, bỏ rowNumber/errors/note)', async () => {
    await openPreview([makeInvalidRow(), makeValidRow()]);
    mockCommitResolves([{ _id: 'a' }, { _id: 'b' }]);

    await setCell('Tuần (dòng 2)', '2');
    await setCell('Bài học (dòng 2)', 'Bài 2');
    await setCell('Số tiết (dòng 2)', '1');
    await setCell('Tiết thứ (dòng 2)', '2');

    for (const message of [WEEK_ERROR, TITLE_ERROR, PERIOD_COUNT_ERROR, PERIOD_LABEL_ERROR]) {
      expect(screen.queryByText(message)).toBeNull();
    }
    expect(rowOf('Tuần (dòng 2)')).not.toHaveClass('bg-danger-soft');
    expect(screen.queryByText(/dòng lỗi, hãy sửa hoặc xóa/)).toBeNull();
    expect(confirmButton()).toBeEnabled();

    await userEvent.click(confirmButton());

    expect(importCommitMock).toHaveBeenCalledTimes(1);
    expect(importCommitMock).toHaveBeenCalledWith({
      positionId: 'p-toan',
      rows: [
        { week: 2, periodLabel: '2', title: 'Bài 2', periodCount: 1, requirement: '' },
        { week: 1, periodLabel: '1', title: 'Bài 1', periodCount: 1, requirement: 'Nắm được' },
      ],
    });
    const payloadRows = importCommitMock.mock.calls[0][0].rows;
    for (const row of payloadRows) {
      expect(Object.keys(row).sort()).toEqual(['periodCount', 'periodLabel', 'requirement', 'title', 'week']);
    }
    expect(await screen.findByText('Đã nhập 2 mục PPCT')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về trang PPCT' })).toHaveAttribute(
      'href',
      '/lop-hoc/class-1/ppct?positionId=p-toan',
    );
  });

  test('ghi chú có nội dung được gửi kèm khóa note (đã cắt khoảng trắng); ghi chú trống thì bỏ khóa', async () => {
    await openPreview([makeValidRow({ rowNumber: 2, note: 'Học bù' }), makeValidRow({ rowNumber: 3 })]);
    mockCommitResolves([{ _id: 'a' }, { _id: 'b' }]);

    await setCell('Ghi chú (dòng 2)', '  Học bù tuần sau  ');
    await userEvent.click(confirmButton());

    const [first, second] = importCommitMock.mock.calls[0][0].rows;
    expect(first.note).toBe('Học bù tuần sau');
    expect(second).not.toHaveProperty('note');
  });

  test('sửa dòng hợp lệ thành sai (Số tiết 0) → lỗi tiền kiểm ở client hiện ra và nút tắt; "Xóa dòng" → nút bật lại; xóa hết → tắt', async () => {
    await openPreview([makeValidRow({ rowNumber: 2 }), makeValidRow({ rowNumber: 3 })]);
    expect(confirmButton()).toBeEnabled();

    await setCell('Số tiết (dòng 3)', '0');

    expect(screen.getByText(PERIOD_COUNT_ERROR)).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();

    await userEvent.click(within(rowOf('Số tiết (dòng 3)')).getByRole('button', { name: 'Xóa dòng' }));

    expect(screen.queryByLabelText('Số tiết (dòng 3)')).toBeNull();
    expect(screen.queryByText(PERIOD_COUNT_ERROR)).toBeNull();
    expect(confirmButton()).toBeEnabled();

    await userEvent.click(within(rowOf('Số tiết (dòng 2)')).getByRole('button', { name: 'Xóa dòng' }));

    expect(screen.getByText('Không có dòng nào để nhập')).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  test('tiền kiểm ở client báo cả ô số không phải số nguyên ("1.5", "1e1") và độ dài quá giới hạn', async () => {
    await openPreview([makeValidRow({ rowNumber: 2 })]);

    await setCell('Tuần (dòng 2)', '1.5');
    expect(screen.getByText(WEEK_ERROR)).toBeInTheDocument();
    await setCell('Tuần (dòng 2)', '1');
    expect(screen.queryByText(WEEK_ERROR)).toBeNull();

    await setCell('Số tiết (dòng 2)', '1e1');
    expect(screen.getByText(PERIOD_COUNT_ERROR)).toBeInTheDocument();
    await setCell('Số tiết (dòng 2)', '1');

    await setCell('Tiết thứ (dòng 2)', 'x'.repeat(21));
    expect(screen.getByText('Tiết thứ quá dài (tối đa 20 ký tự)')).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  test('dòng CHƯA sửa luôn hiện lỗi của backend nguyên văn (kể cả lỗi client không biết); sửa một ô thì chuyển sang tiền kiểm client', async () => {
    await openPreview([makeValidRow({ rowNumber: 2, errors: ['Lỗi riêng do backend báo'] })]);

    expect(screen.getByText('Lỗi riêng do backend báo')).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();

    await setCell('Ghi chú (dòng 2)', 'Đã xem');

    expect(screen.queryByText('Lỗi riêng do backend báo')).toBeNull();
    expect(confirmButton()).toBeEnabled();
  });

  test('xóa dòng không làm lệch dòng còn lại: giá trị và trạng thái "đã sửa" bám theo số dòng của file', async () => {
    await openPreview([
      makeValidRow({ rowNumber: 2, title: 'Bài A' }),
      makeValidRow({ rowNumber: 3, title: 'Bài B', errors: ['Lỗi riêng do backend báo'] }),
    ]);
    await setCell('Bài học (dòng 3)', 'Bài B sửa');

    await userEvent.click(within(rowOf('Bài học (dòng 2)')).getByRole('button', { name: 'Xóa dòng' }));

    expect(screen.queryByLabelText('Bài học (dòng 2)')).toBeNull();
    expect(screen.getByLabelText('Bài học (dòng 3)')).toHaveValue('Bài B sửa');
    expect(screen.queryByText('Lỗi riêng do backend báo')).toBeNull();
    expect(confirmButton()).toBeEnabled();
  });

  test('file có dòng trống ở giữa nên số dòng không liền nhau (2, 5, 9): xóa đúng dòng được chọn, dòng khác giữ nguyên', async () => {
    await openPreview([
      makeValidRow({ rowNumber: 2, title: 'Bài A' }),
      makeValidRow({ rowNumber: 5, title: 'Bài B' }),
      makeValidRow({ rowNumber: 9, title: 'Bài C' }),
    ]);

    await userEvent.click(within(rowOf('Bài học (dòng 5)')).getByRole('button', { name: 'Xóa dòng' }));

    expect(screen.queryByLabelText('Bài học (dòng 5)')).toBeNull();
    expect(screen.getByLabelText('Bài học (dòng 2)')).toHaveValue('Bài A');
    expect(screen.getByLabelText('Bài học (dòng 9)')).toHaveValue('Bài C');
  });

  test('positionId trên URL đổi sang môn khác khi trang đang mở → bỏ bảng xem trước của môn cũ (không thể commit nhầm sang môn mới)', async () => {
    mockPreviewResolves([makeValidRow({ rowNumber: 2, title: 'Bài của môn Toán' })]);
    const { changeSearchParams } = renderPage({ user: ADMIN });
    await chooseFileAndPreview();
    await screen.findByDisplayValue('Bài của môn Toán');

    changeSearchParams({ positionId: 'p-van' });

    expect(screen.getByText('Môn Ngữ văn · Lớp 11A4')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByDisplayValue('Bài của môn Toán')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xác nhận nhập' })).toBeNull();
  });

  test('xem trước file khác thay hẳn bảng và xóa trạng thái "đã sửa" của lần trước', async () => {
    mockPreviewResolves([makeValidRow({ rowNumber: 2 })]);
    renderPage();
    await chooseFileAndPreview();
    await screen.findByRole('table');
    await setCell('Bài học (dòng 2)', 'Đã sửa tay');

    mockPreviewResolves([makeValidRow({ rowNumber: 2, title: 'Bài của file mới', errors: ['Lỗi riêng do backend báo'] })]);
    await userEvent.upload(screen.getByLabelText('Chọn file Excel'), makeFile('file-moi.xlsx'));
    await userEvent.click(screen.getByRole('button', { name: 'Xem trước' }));

    expect(await screen.findByDisplayValue('Bài của file mới')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Đã sửa tay')).toBeNull();
    expect(screen.getByText('Lỗi riêng do backend báo')).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  test('file không có dòng dữ liệu nào → "Không có dòng nào để nhập", nút xác nhận tắt', async () => {
    mockPreviewResolves([]);
    renderPage();
    await chooseFileAndPreview();

    expect(await screen.findByText('Không có dòng nào để nhập')).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  test('bảng xem trước cuộn ngang được trên màn hình hẹp (mobile), không làm tràn cả trang', async () => {
    const table = await openPreview([makeValidRow()]);

    expect(table.closest('[class*="overflow-x-auto"]')).not.toBeNull();
  });
});

describe('xác nhận nhập', () => {
  test('commit thất bại (400) → hiện nguyên văn message, giữ bảng và mọi giá trị đã sửa; bấm lại được và thành công thì vào màn kết quả', async () => {
    await openPreview([makeInvalidRow(), makeValidRow()]);
    await setCell('Tuần (dòng 2)', '2');
    await setCell('Bài học (dòng 2)', 'Bài 2');
    await setCell('Số tiết (dòng 2)', '1');
    await setCell('Tiết thứ (dòng 2)', '2');
    mockCommitRejects({
      status: 400,
      data: { message: 'Dữ liệu gửi lên không hợp lệ: rows.0.title: không hợp lệ' },
    });

    await userEvent.click(confirmButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Dữ liệu gửi lên không hợp lệ: rows.0.title: không hợp lệ',
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByLabelText('Bài học (dòng 2)')).toHaveValue('Bài 2');
    expect(screen.getByLabelText('Bài học (dòng 3)')).toHaveValue('Bài 1');
    expect(confirmButton()).toBeEnabled();
    expect(screen.queryByText(/Đã nhập/)).toBeNull();

    mockCommitResolves([{ _id: 'a' }, { _id: 'b' }]);
    await userEvent.click(confirmButton());

    expect(await screen.findByText('Đã nhập 2 mục PPCT')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(importCommitMock).toHaveBeenCalledTimes(2);
  });

  test('commit lỗi 500 (vd body quá lớn) → hiện nguyên văn message backend, KHÔNG tự chia lô, giữ nguyên dữ liệu để thử lại', async () => {
    await openPreview([makeValidRow()]);
    mockCommitRejects({ status: 500, data: { message: 'Đã có lỗi xảy ra, vui lòng thử lại sau' } });

    await userEvent.click(confirmButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Đã có lỗi xảy ra, vui lòng thử lại sau');
    expect(importCommitMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Bài học (dòng 3)')).toHaveValue('Bài 1');
  });

  test('commit 409 (E11000 lọt ra) → hiện nguyên văn "Dữ liệu đã tồn tại, không thể ghi trùng"', async () => {
    await openPreview([makeValidRow()]);
    mockCommitRejects({ status: 409, data: { message: 'Dữ liệu đã tồn tại, không thể ghi trùng' } });

    await userEvent.click(confirmButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Dữ liệu đã tồn tại, không thể ghi trùng');
  });

  test('commit mất mạng → câu dự phòng tiếng Việt, bảng vẫn còn', async () => {
    await openPreview([makeValidRow()]);
    mockCommitRejects({ status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' });

    await userEvent.click(confirmButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Xác nhận nhập thất bại, vui lòng thử lại');
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  test('đang gửi (isLoading) → nút "Xác nhận nhập" bị tắt dù mọi dòng đều hợp lệ', async () => {
    loading.commit = true;

    await openPreview([makeValidRow()]);

    expect(screen.queryByText(/dòng lỗi, hãy sửa hoặc xóa/)).toBeNull();
    expect(confirmButton()).toBeDisabled();
  });

  test('bấm đúp lúc backend còn đang xử lý chỉ gửi 1 lần (gửi 2 lần sẽ nhân đôi toàn bộ PPCT)', async () => {
    await openPreview([makeValidRow()]);
    importCommitMock.mockReturnValue({ unwrap: () => new Promise(() => {}) });

    await userEvent.dblClick(confirmButton());

    expect(importCommitMock).toHaveBeenCalledTimes(1);
  });
});
