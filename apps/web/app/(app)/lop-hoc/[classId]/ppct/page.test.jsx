import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/lib/store/auth-slice';
import { CLASS_DETAIL, makePpctItem } from '@/lib/test-fixtures/phase3';
import PpctPage from './page';

const getClassDetailMock = jest.fn();
jest.mock('@/lib/store/classes-api', () => ({
  ...jest.requireActual('@/lib/store/classes-api'),
  useGetClassDetailQuery: (classId) => getClassDetailMock(classId),
}));

const getPositionPpctMock = jest.fn();
const createPpctItemMock = jest.fn();
const updatePpctItemMock = jest.fn();
const deletePpctItemMock = jest.fn();
jest.mock('@/lib/store/ppct-api', () => ({
  ...jest.requireActual('@/lib/store/ppct-api'),
  useGetPositionPpctQuery: (...args) => getPositionPpctMock(...args),
  useCreatePpctItemMutation: () => [createPpctItemMock, { isLoading: false }],
  useUpdatePpctItemMutation: () => [updatePpctItemMock, { isLoading: false }],
  useDeletePpctItemMutation: () => [deletePpctItemMock, { isLoading: false }],
}));

const GVBM_TOAN = { id: 'u-toan', role: 'TEACHER' };
const GVBM_VAN = { id: 'u-van', role: 'TEACHER' };
const GVCN = { id: 'u-gvcn', role: 'TEACHER' };
const ADMIN = { id: 'u-admin', role: 'ADMIN' };

const DELETE_WARNING = 'Xóa mục PPCT sẽ xóa luôn buổi báo giảng tương ứng (kể cả buổi đã tích "Đã thực hiện").';

const ITEMS = [
  makePpctItem({
    _id: 'i1',
    order: 1,
    week: 1,
    periodLabel: '1',
    title: 'Bài 1',
    periodCount: 1,
    requirement: 'Nắm được khái niệm',
  }),
  makePpctItem({
    _id: 'i2',
    order: 2,
    week: 1,
    periodLabel: 'TC1',
    title: 'Bài tự chọn 1',
    periodCount: 2,
    requirement: '',
    note: 'Dạy bù tuần sau',
  }),
  makePpctItem({
    _id: 'i3',
    order: 3,
    week: 2,
    periodLabel: 'CĐ1',
    title: 'Chuyên đề 1',
    periodCount: 3,
    requirement: 'Vận dụng',
  }),
];

function renderPage({ user, classId = 'class-1', searchParams } = {}) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { user, accessToken: user ? 'token' : null } },
  });
  return render(
    <Provider store={store}>
      <PpctPage params={{ classId }} searchParams={searchParams} />
    </Provider>,
  );
}

function findRow(text) {
  const row = screen.getAllByRole('row').find((candidate) => within(candidate).queryByText(text));
  if (!row) throw new Error(`Không tìm thấy dòng chứa "${text}"`);
  return row;
}

// Khối Yêu cầu cần đạt/Ghi chú dành cho điện thoại: phần tử mang class md:hidden trong ô "Bài học" (cột thứ hai) của
// dòng. jsdom không nạp CSS nên "chỉ hiện dưới md" được kiểm bằng class, như các ca (e) bên dưới.
function queryMobileDetails(rowText) {
  const titleCell = within(findRow(rowText)).getAllByRole('cell')[1];
  return titleCell.querySelector('.md\\:hidden');
}

function getMobileDetails(rowText) {
  const block = queryMobileDetails(rowText);
  if (!block) throw new Error(`Ô "Bài học" của dòng "${rowText}" không có khối md:hidden`);
  return block;
}

function lastRequestedPositionId() {
  return getPositionPpctMock.mock.calls.at(-1)[0];
}

function optionTexts(select) {
  return within(select)
    .getAllByRole('option')
    .map((option) => option.textContent);
}

const resolved = () => ({ unwrap: () => Promise.resolve({}) });
const rejected = (error) => ({ unwrap: () => Promise.reject(error) });

beforeEach(() => {
  getClassDetailMock.mockReset();
  getPositionPpctMock.mockReset();
  createPpctItemMock.mockReset().mockReturnValue(resolved());
  updatePpctItemMock.mockReset().mockReturnValue(resolved());
  deletePpctItemMock.mockReset().mockReturnValue(resolved());

  getClassDetailMock.mockReturnValue({ data: CLASS_DETAIL, isLoading: false, isError: false });
  getPositionPpctMock.mockImplementation((positionId) => ({
    currentData: positionId ? ITEMS : undefined,
    isError: false,
  }));
});

describe('quyền sửa theo vị trí đang xem', () => {
  test('(a) GVBM Toán thấy Thêm mục PPCT, link Nhập từ Excel đúng địa chỉ, mỗi dòng có Sửa/Xóa và dòng nhắc "thêm vào cuối"', () => {
    renderPage({ user: GVBM_TOAN });

    expect(screen.getByRole('button', { name: 'Thêm mục PPCT' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nhập từ Excel' })).toHaveAttribute(
      'href',
      '/lop-hoc/class-1/ppct/nhap-excel?positionId=p-toan',
    );
    expect(screen.getAllByRole('button', { name: 'Sửa' })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: 'Xóa' })).toHaveLength(3);
    expect(screen.getByText('Mục mới luôn được thêm vào cuối PPCT.')).toBeInTheDocument();
    expect(lastRequestedPositionId()).toBe('p-toan');
  });

  test('(b) GVCN mở môn Toán của người khác: thấy đủ dữ liệu nhưng KHÔNG có nút thêm/sửa/xóa/Excel; bộ chọn có 3 môn', () => {
    renderPage({ user: GVCN });

    expect(screen.getByText('Bài 1')).toBeInTheDocument();
    expect(screen.getByText('Bài tự chọn 1')).toBeInTheDocument();
    expect(screen.getByText('Chuyên đề 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm mục PPCT' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sửa' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xóa' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Nhập từ Excel' })).toBeNull();
    expect(screen.queryByText('Mục mới luôn được thêm vào cuối PPCT.')).toBeNull();
    expect(optionTexts(screen.getByLabelText('Môn'))).toEqual(['Toán', 'Ngữ văn', 'Vật lý']);
    expect(lastRequestedPositionId()).toBe('p-toan');
  });

  test('(c) GVBM Văn chỉ thấy môn Ngữ văn (không có Toán, Vật lý, không có bộ chọn) và chỉ truy vấn PPCT của p-van', () => {
    renderPage({ user: GVBM_VAN });

    expect(screen.getByText('Ngữ văn')).toBeInTheDocument();
    expect(screen.queryByText('Toán')).toBeNull();
    expect(screen.queryByText('Vật lý')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();

    const requestedIds = getPositionPpctMock.mock.calls.map(([positionId]) => positionId);
    expect(requestedIds).toContain('p-van');
    expect(requestedIds).not.toContain('p-toan');
    expect(requestedIds).not.toContain('p-ly');
    expect(screen.getByRole('button', { name: 'Thêm mục PPCT' })).toBeInTheDocument();
  });

  test('(d) ADMIN có đủ nút ở mọi môn kể cả môn đang trống người giữ (p-ly); Chủ nhiệm không bao giờ có trong bộ chọn', async () => {
    renderPage({ user: ADMIN });

    const select = screen.getByLabelText('Môn');
    expect(optionTexts(select)).toEqual(['Toán', 'Ngữ văn', 'Vật lý']);
    expect(screen.getByRole('button', { name: 'Thêm mục PPCT' })).toBeInTheDocument();

    await userEvent.selectOptions(select, 'p-ly');

    expect(lastRequestedPositionId()).toBe('p-ly');
    expect(screen.getByRole('button', { name: 'Thêm mục PPCT' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Sửa' })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: 'Xóa' })).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Nhập từ Excel' })).toHaveAttribute(
      'href',
      '/lop-hoc/class-1/ppct/nhap-excel?positionId=p-ly',
    );
  });

  test('GVCN kiêm GVBM Toán: nút sửa chỉ có ở môn mình giữ, đổi sang môn khác thì biến mất', async () => {
    getClassDetailMock.mockReturnValue({
      data: {
        ...CLASS_DETAIL,
        positions: CLASS_DETAIL.positions.map((position) =>
          position.id === 'p-toan' ? { ...position, holder: { id: 'u-gvcn', fullName: 'Nguyễn Thị Lan' } } : position,
        ),
      },
      isLoading: false,
      isError: false,
    });
    renderPage({ user: GVCN });

    expect(screen.getByLabelText('Môn')).toHaveValue('p-toan');
    expect(screen.getByRole('button', { name: 'Thêm mục PPCT' })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Môn'), 'p-van');

    expect(screen.queryByRole('button', { name: 'Thêm mục PPCT' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sửa' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Nhập từ Excel' })).toBeNull();
  });
});

describe('bảng PPCT', () => {
  test('(e) tiêu đề cột đúng thứ tự; người chỉ xem không có cột thao tác', () => {
    renderPage({ user: GVCN });

    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Tuần',
      'Bài học',
      'Số tiết',
      'Tiết thứ',
      'Yêu cầu cần đạt',
      'Ghi chú',
    ]);
  });

  test('(e) người sửa được có thêm cột Hành động ở cuối, luôn hiện cả trên điện thoại', () => {
    renderPage({ user: GVBM_TOAN });

    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      'Tuần',
      'Bài học',
      'Số tiết',
      'Tiết thứ',
      'Yêu cầu cần đạt',
      'Ghi chú',
      'Hành động',
    ]);
    expect(headers[6]).not.toHaveClass('hidden');
    const actionCell = within(findRow('Bài 1')).getAllByRole('cell')[6];
    expect(actionCell).not.toHaveClass('hidden');
  });

  test('(e) nhãn tiết 1 / TC1 / CĐ1 hiện Badge CK / TC / CĐ kèm nhãn gốc; mỗi dòng đủ số liệu', () => {
    renderPage({ user: GVCN });

    const kindCell = (rowText) => within(findRow(rowText)).getAllByRole('cell')[3];
    expect(within(kindCell('Bài 1')).getByText('CK')).toBeInTheDocument();
    expect(within(kindCell('Bài 1')).getByText('1')).toBeInTheDocument();
    expect(within(kindCell('Bài tự chọn 1')).getByText('TC')).toBeInTheDocument();
    expect(within(kindCell('Bài tự chọn 1')).getByText('TC1')).toBeInTheDocument();
    expect(within(kindCell('Chuyên đề 1')).getByText('CĐ')).toBeInTheDocument();
    expect(within(kindCell('Chuyên đề 1')).getByText('CĐ1')).toBeInTheDocument();

    const cellTexts = within(findRow('Bài tự chọn 1'))
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cellTexts[0]).toBe('1');
    // Ô "Bài học" còn chứa khối Yêu cầu/Ghi chú dành cho điện thoại ngay sau tên bài.
    expect(cellTexts[1]).toMatch(/^Bài tự chọn 1/);
    expect(cellTexts[2]).toBe('2');
    expect(cellTexts[5]).toBe('Dạy bù tuần sau');
  });

  test('(e) 2 cột Yêu cầu cần đạt và Ghi chú (th lẫn td) chỉ hiện từ md trở lên; 4 cột đầu luôn hiện', () => {
    renderPage({ user: GVCN });

    const longHeaders = screen
      .getAllByRole('columnheader')
      .filter((header) => ['Yêu cầu cần đạt', 'Ghi chú'].includes(header.textContent));
    expect(longHeaders).toHaveLength(2);
    longHeaders.forEach((header) => expect(header).toHaveClass('hidden', 'md:table-cell'));

    const cells = within(findRow('Bài 1')).getAllByRole('cell');
    expect(cells[4]).toHaveClass('hidden', 'md:table-cell');
    expect(cells[5]).toHaveClass('hidden', 'md:table-cell');
    [0, 1, 2, 3].forEach((index) => expect(cells[index]).not.toHaveClass('hidden'));
    screen
      .getAllByRole('columnheader')
      .slice(0, 4)
      .forEach((header) => expect(header).not.toHaveClass('hidden'));
  });

  test('(g) PPCT rỗng → "Chưa có mục PPCT nào"; người sửa được vẫn thấy nút thêm để nhập mục đầu tiên', () => {
    getPositionPpctMock.mockReturnValue({ currentData: [], isError: false });
    renderPage({ user: GVBM_TOAN });

    expect(screen.getByText('Chưa có mục PPCT nào')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: 'Thêm mục PPCT' })).toBeInTheDocument();
  });

  test('(g) PPCT rỗng với người chỉ xem: có thông báo, không có nút thêm', () => {
    getPositionPpctMock.mockReturnValue({ currentData: [], isError: false });
    renderPage({ user: GVCN });

    expect(screen.getByText('Chưa có mục PPCT nào')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm mục PPCT' })).toBeNull();
  });

  test('đang tải PPCT → "Đang tải...", không nhầm với PPCT rỗng', () => {
    getPositionPpctMock.mockReturnValue({ currentData: undefined, isError: false });
    renderPage({ user: GVBM_TOAN });

    expect(screen.getByText('Đang tải...')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có mục PPCT nào')).toBeNull();
  });

  test('tải PPCT lỗi → hiện message của backend, KHÔNG hiện "Chưa có mục PPCT nào" (bảng rỗng dễ bị hiểu là chưa có dữ liệu)', () => {
    getPositionPpctMock.mockReturnValue({
      currentData: undefined,
      isError: true,
      error: { status: 500, data: { message: 'Đã có lỗi xảy ra, vui lòng thử lại sau' } },
    });
    renderPage({ user: GVBM_TOAN });

    expect(screen.getByText('Đã có lỗi xảy ra, vui lòng thử lại sau')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có mục PPCT nào')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  test('tải PPCT bị 403 tiếng Anh của guard → hiện câu tiếng Việt cố định', () => {
    getPositionPpctMock.mockReturnValue({
      currentData: undefined,
      isError: true,
      error: { status: 403, data: { message: 'Forbidden resource' } },
    });
    renderPage({ user: GVCN });

    expect(screen.getByText('Bạn không có quyền thực hiện thao tác này')).toBeInTheDocument();
    expect(screen.queryByText('Forbidden resource')).toBeNull();
  });
});

// Dưới md hai cột dài bị ẩn bằng display:none (cuộn ngang cũng không thấy). GVCN chỉ xem, không có nút Sửa nên hộp
// thoại cũng không mở được: nếu nội dung không có chỗ nào khác để đọc thì mất 2 trong 6 cột bắt buộc của PPCT.
describe('Yêu cầu cần đạt và Ghi chú trên điện thoại (dưới md)', () => {
  test('(I3) GVCN chỉ xem: Yêu cầu cần đạt hiện ngay trong ô "Bài học", trong khối md:hidden, có nhãn rõ ràng', () => {
    renderPage({ user: GVCN });

    const block = getMobileDetails('Bài 1');

    expect(within(block).getByText('Yêu cầu cần đạt:')).toBeInTheDocument();
    expect(block).toHaveTextContent('Nắm được khái niệm');
    // Xuống dòng trong nội dung được giữ như ở 2 cột riêng từ md.
    expect(block).toHaveClass('whitespace-pre-line');
  });

  test('(I3) GVCN chỉ xem: Ghi chú hiện ngay trong ô "Bài học" kèm nhãn "Ghi chú:"', () => {
    renderPage({ user: GVCN });

    const block = getMobileDetails('Bài tự chọn 1');

    expect(within(block).getByText('Ghi chú:')).toBeInTheDocument();
    expect(block).toHaveTextContent('Dạy bù tuần sau');
  });

  test('(I3) dòng chỉ có một trong hai trường thì không hiện nhãn rỗng của trường còn lại', () => {
    renderPage({ user: GVCN });

    // Bài 1 có yêu cầu, không có ghi chú; Bài tự chọn 1 có ghi chú, yêu cầu để trống.
    expect(within(getMobileDetails('Bài 1')).queryByText('Ghi chú:')).toBeNull();
    expect(within(getMobileDetails('Bài tự chọn 1')).queryByText('Yêu cầu cần đạt:')).toBeNull();
  });

  test('(I3) dòng không có cả hai thì ô "Bài học" chỉ có tên bài, không có khối hay nhãn nào', () => {
    getPositionPpctMock.mockReturnValue({
      currentData: [makePpctItem({ _id: 'i9', title: 'Bài trống' })],
      isError: false,
    });
    renderPage({ user: GVCN });

    expect(queryMobileDetails('Bài trống')).toBeNull();
    expect(screen.queryByText('Yêu cầu cần đạt:')).toBeNull();
    expect(screen.queryByText('Ghi chú:')).toBeNull();
  });

  test('(I3) không phụ thuộc quyền: người sửa được (GVBM) cũng đọc được ngay trong bảng, không cần mở hộp thoại Sửa', () => {
    renderPage({ user: GVBM_TOAN });

    expect(within(getMobileDetails('Bài 1')).getByText('Yêu cầu cần đạt:')).toBeInTheDocument();
    expect(within(getMobileDetails('Bài tự chọn 1')).getByText('Ghi chú:')).toBeInTheDocument();
  });

  test('(I3) từ md trở lên vẫn dùng 2 cột riêng (hidden md:table-cell) với đầy đủ nội dung; khối trong ô "Bài học" chỉ là bản cho điện thoại', () => {
    renderPage({ user: GVCN });

    const cells = within(findRow('Bài 1')).getAllByRole('cell');
    expect(cells[4]).toHaveTextContent('Nắm được khái niệm');
    expect(cells[4]).toHaveClass('hidden', 'md:table-cell');
    expect(cells[5]).toHaveClass('hidden', 'md:table-cell');
  });
});

describe('chọn môn', () => {
  test('(f) searchParams.positionId được chọn sẵn', () => {
    renderPage({ user: GVCN, searchParams: { positionId: 'p-van' } });

    expect(screen.getByLabelText('Môn')).toHaveValue('p-van');
    expect(lastRequestedPositionId()).toBe('p-van');
  });

  test('(f) positionId không hợp lệ (hoặc là HOMEROOM) → rơi về môn mặc định', () => {
    renderPage({ user: GVCN, searchParams: { positionId: 'p-hr' } });

    expect(screen.getByLabelText('Môn')).toHaveValue('p-toan');
    expect(lastRequestedPositionId()).toBe('p-toan');
  });

  test('đổi môn trong bộ chọn → truy vấn PPCT của môn mới và bảng hiện đúng dữ liệu môn đó', async () => {
    getPositionPpctMock.mockImplementation((positionId) => ({
      currentData:
        positionId === 'p-van'
          ? [makePpctItem({ _id: 'v1', positionId: 'p-van', title: 'Đọc hiểu văn bản' })]
          : ITEMS,
      isError: false,
    }));
    renderPage({ user: GVCN });
    expect(screen.getByText('Bài 1')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Môn'), 'p-van');

    expect(lastRequestedPositionId()).toBe('p-van');
    expect(screen.getByText('Đọc hiểu văn bản')).toBeInTheDocument();
    expect(screen.queryByText('Bài 1')).toBeNull();
  });

  // RTK Query giữ `data` của môn cũ trong lúc tải môn mới (chỉ `currentData` là của đúng môn đang chọn): hiện nó sẽ
  // bày PPCT môn Toán dưới tên môn Văn, kèm nút Sửa/Xóa gửi nhầm positionId.
  test('đang tải PPCT của môn mới thì KHÔNG hiện lại các dòng của môn cũ', async () => {
    getPositionPpctMock.mockImplementation((positionId) =>
      positionId === 'p-van'
        ? { data: ITEMS, currentData: undefined, isFetching: true, isError: false }
        : { data: ITEMS, currentData: ITEMS, isFetching: false, isError: false },
    );
    renderPage({ user: ADMIN });
    expect(screen.getByText('Bài 1')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Môn'), 'p-van');

    expect(screen.getByText('Đang tải...')).toBeInTheDocument();
    expect(screen.queryByText('Bài 1')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sửa' })).toBeNull();
  });

  test('giáo viên không giữ môn nào trong lớp → thông báo, không có bảng, không gửi truy vấn PPCT nào', () => {
    renderPage({ user: { id: 'u-khac', role: 'TEACHER' } });

    expect(screen.getByText('Bạn chưa giữ môn nào trong lớp này')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thêm mục PPCT' })).toBeNull();
    expect(getPositionPpctMock).toHaveBeenLastCalledWith('', { skip: true });
  });

  test('chưa biết người dùng (đang khôi phục phiên) → "Đang tải...", không hiện nhầm "chưa giữ môn nào"', () => {
    renderPage({ user: null });

    expect(screen.getByText('Đang tải...')).toBeInTheDocument();
    expect(screen.queryByText('Bạn chưa giữ môn nào trong lớp này')).toBeNull();
  });
});

describe('trạng thái của lớp', () => {
  test.each([
    [403, 'Forbidden resource', 'Bạn không có quyền xem lớp này'],
    [404, 'Không tìm thấy lớp', 'Không tìm thấy lớp'],
  ])('(g) chi tiết lớp lỗi %i → "%s" thay vì bảng', (status, message, expected) => {
    getClassDetailMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status, data: { message } },
    });
    renderPage({ user: GVBM_TOAN });

    expect(screen.getByRole('heading', { name: expected })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thêm mục PPCT' })).toBeNull();
    expect(screen.queryByText('Chưa có mục PPCT nào')).toBeNull();
  });

  test('chi tiết lớp lỗi khác (500) → hiện message của backend, không nói nhầm là "Không tìm thấy lớp"', () => {
    getClassDetailMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 500, data: { message: 'Đã có lỗi xảy ra, vui lòng thử lại sau' } },
    });
    renderPage({ user: GVBM_TOAN });

    expect(screen.getByText('Đã có lỗi xảy ra, vui lòng thử lại sau')).toBeInTheDocument();
    expect(screen.queryByText('Không tìm thấy lớp')).toBeNull();
  });

  test('đang tải chi tiết lớp → "Đang tải...", chưa hiện bảng hay thông báo "chưa giữ môn nào"', () => {
    getClassDetailMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderPage({ user: GVBM_TOAN });

    expect(screen.getByText('Đang tải...')).toBeInTheDocument();
    expect(screen.queryByText('Bạn chưa giữ môn nào trong lớp này')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  test('truy vấn chi tiết lớp theo classId trên URL', () => {
    renderPage({ user: GVBM_TOAN, classId: 'class-9' });

    expect(getClassDetailMock).toHaveBeenCalledWith('class-9');
  });
});

describe('thêm / sửa qua hộp thoại', () => {
  test('Thêm mục PPCT mở hộp thoại; lưu gửi đúng positionId của môn đang chọn rồi đóng', async () => {
    renderPage({ user: GVBM_TOAN });

    await userEvent.click(screen.getByRole('button', { name: 'Thêm mục PPCT' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Tuần'), '4');
    await userEvent.type(within(dialog).getByLabelText('Tiết thứ'), '7');
    await userEvent.type(within(dialog).getByLabelText('Bài học'), 'Bài 7');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm' }));

    expect(createPpctItemMock).toHaveBeenCalledWith({
      positionId: 'p-toan',
      week: 4,
      periodLabel: '7',
      title: 'Bài 7',
      periodCount: 1,
      requirement: '',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  test('ADMIN đổi sang Vật lý rồi thêm → gửi positionId p-ly, không phải môn mặc định', async () => {
    renderPage({ user: ADMIN });
    await userEvent.selectOptions(screen.getByLabelText('Môn'), 'p-ly');

    await userEvent.click(screen.getByRole('button', { name: 'Thêm mục PPCT' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Tuần'), '1');
    await userEvent.type(within(dialog).getByLabelText('Tiết thứ'), '1');
    await userEvent.type(within(dialog).getByLabelText('Bài học'), 'Chuyển động cơ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm' }));

    expect(createPpctItemMock).toHaveBeenCalledWith(expect.objectContaining({ positionId: 'p-ly' }));
  });

  test('Sửa ở dòng thứ hai điền sẵn đúng dữ liệu dòng đó và lưu bằng itemId của dòng đó', async () => {
    renderPage({ user: GVBM_TOAN });

    await userEvent.click(within(findRow('Bài tự chọn 1')).getByRole('button', { name: 'Sửa' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Bài học')).toHaveDisplayValue('Bài tự chọn 1');
    expect(within(dialog).getByLabelText('Ghi chú')).toHaveDisplayValue('Dạy bù tuần sau');

    await userEvent.clear(within(dialog).getByLabelText('Ghi chú'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));

    expect(updatePpctItemMock).toHaveBeenCalledWith({
      positionId: 'p-toan',
      itemId: 'i2',
      week: 1,
      periodLabel: 'TC1',
      title: 'Bài tự chọn 1',
      periodCount: 2,
      requirement: '',
      note: '',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  test('mở Thêm sau khi vừa Sửa một dòng: hộp thoại trống, không dính dữ liệu dòng vừa sửa', async () => {
    renderPage({ user: GVBM_TOAN });
    await userEvent.click(within(findRow('Bài 1')).getByRole('button', { name: 'Sửa' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Huỷ' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await userEvent.click(screen.getByRole('button', { name: 'Thêm mục PPCT' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Bài học')).toHaveDisplayValue('');
    expect(within(dialog).getByRole('button', { name: 'Thêm' })).toBeInTheDocument();
  });

  // Ở mức trang onOpenChange đóng thật: Esc giữa chừng làm hộp thoại biến mất, lỗi trả về bị mất và người dùng mở lại
  // gửi lần hai (backend nối vào cuối, không chống trùng) sẽ tạo mục PPCT trùng.
  test('(M1) đang lưu mục mới: Esc và Huỷ không đóng hộp thoại; lưu xong mới đóng, chỉ gửi đúng 1 yêu cầu', async () => {
    let finishSaving;
    createPpctItemMock.mockReturnValue({
      unwrap: () =>
        new Promise((resolve) => {
          finishSaving = resolve;
        }),
    });
    renderPage({ user: GVBM_TOAN });
    await userEvent.click(screen.getByRole('button', { name: 'Thêm mục PPCT' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Tuần'), '4');
    await userEvent.type(within(dialog).getByLabelText('Tiết thứ'), '7');
    await userEvent.type(within(dialog).getByLabelText('Bài học'), 'Bài 7');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm' }));

    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Huỷ' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(createPpctItemMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishSaving({});
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(createPpctItemMock).toHaveBeenCalledTimes(1);
  });

  test('(M1) lưu lỗi sau khi bấm Esc: lỗi vẫn hiện trong hộp thoại còn mở và gửi lại được', async () => {
    let failSaving;
    createPpctItemMock
      .mockReturnValueOnce({
        unwrap: () =>
          new Promise((_, reject) => {
            failSaving = reject;
          }),
      })
      .mockReturnValueOnce(resolved());
    renderPage({ user: GVBM_TOAN });
    await userEvent.click(screen.getByRole('button', { name: 'Thêm mục PPCT' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Tuần'), '1');
    await userEvent.type(within(dialog).getByLabelText('Tiết thứ'), '2');
    await userEvent.type(within(dialog).getByLabelText('Bài học'), 'Bài 2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm' }));
    await userEvent.keyboard('{Escape}');

    await act(async () => {
      failSaving({ status: 500, data: { message: 'Đã có lỗi xảy ra, vui lòng thử lại sau' } });
    });

    expect(await within(dialog).findByText('Đã có lỗi xảy ra, vui lòng thử lại sau')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(createPpctItemMock).toHaveBeenCalledTimes(2);
  });
});

describe('xóa', () => {
  async function openDeleteDialogFor(rowText) {
    await userEvent.click(within(findRow(rowText)).getByRole('button', { name: 'Xóa' }));
    return screen.findByRole('dialog');
  }

  test('(h) hộp thoại cảnh báo xóa luôn buổi báo giảng; chưa xác nhận thì chưa gọi API', async () => {
    renderPage({ user: GVBM_TOAN });

    const dialog = await openDeleteDialogFor('Bài tự chọn 1');

    expect(within(dialog).getByText(DELETE_WARNING)).toBeInTheDocument();
    expect(deletePpctItemMock).not.toHaveBeenCalled();
  });

  test('(h) xác nhận gọi deletePpctItem với positionId và itemId của ĐÚNG dòng đã bấm (dòng thứ hai) rồi đóng hộp thoại', async () => {
    renderPage({ user: GVBM_TOAN });
    const dialog = await openDeleteDialogFor('Bài tự chọn 1');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận xóa' }));

    expect(deletePpctItemMock).toHaveBeenCalledTimes(1);
    expect(deletePpctItemMock).toHaveBeenCalledWith({ positionId: 'p-toan', itemId: 'i2' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  test('Huỷ đóng hộp thoại và không xóa gì', async () => {
    renderPage({ user: GVBM_TOAN });
    const dialog = await openDeleteDialogFor('Bài 1');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Huỷ' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(deletePpctItemMock).not.toHaveBeenCalled();
  });

  test('(h) xóa thất bại → hiện message của backend, hộp thoại GIỮ NGUYÊN và nút xác nhận dùng lại được', async () => {
    deletePpctItemMock.mockReturnValue(rejected({ status: 404, data: { message: 'Không tìm thấy mục PPCT' } }));
    renderPage({ user: GVBM_TOAN });
    const dialog = await openDeleteDialogFor('Bài 1');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận xóa' }));

    expect(await within(dialog).findByText('Không tìm thấy mục PPCT')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Xác nhận xóa' })).toBeEnabled();
  });

  test('xóa bị 403 tiếng Anh của guard → hiện câu tiếng Việt cố định', async () => {
    deletePpctItemMock.mockReturnValue(rejected({ status: 403, data: { message: 'Forbidden resource' } }));
    renderPage({ user: GVBM_TOAN });
    const dialog = await openDeleteDialogFor('Bài 1');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận xóa' }));

    expect(await within(dialog).findByText('Bạn không có quyền thực hiện thao tác này')).toBeInTheDocument();
  });

  test('đang xóa: nút xác nhận bị khóa nên bấm lần hai không gửi thêm yêu cầu', async () => {
    let finishDeleting;
    deletePpctItemMock.mockReturnValue({
      unwrap: () =>
        new Promise((resolve) => {
          finishDeleting = resolve;
        }),
    });
    renderPage({ user: GVBM_TOAN });
    const dialog = await openDeleteDialogFor('Bài 1');
    const confirm = within(dialog).getByRole('button', { name: 'Xác nhận xóa' });

    await userEvent.click(confirm);
    expect(confirm).toBeDisabled();
    await userEvent.click(confirm);
    expect(deletePpctItemMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishDeleting({ deleted: true });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  function pendingDelete() {
    const control = {};
    deletePpctItemMock.mockReturnValue({
      unwrap: () =>
        new Promise((resolve, reject) => {
          control.resolve = resolve;
          control.reject = reject;
        }),
    });
    return control;
  }

  test('(M1) đang xóa: Esc và Huỷ không đóng hộp thoại (Huỷ bị khóa); xóa xong mới đóng', async () => {
    const deletion = pendingDelete();
    renderPage({ user: GVBM_TOAN });
    const dialog = await openDeleteDialogFor('Bài 1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận xóa' }));

    await userEvent.keyboard('{Escape}');
    const cancel = within(dialog).getByRole('button', { name: 'Huỷ' });
    expect(cancel).toBeDisabled();
    await userEvent.click(cancel);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => {
      deletion.resolve({ deleted: true });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(deletePpctItemMock).toHaveBeenCalledTimes(1);
  });

  test('(M1) xóa lỗi sau khi bấm Esc: lỗi vẫn hiện trong hộp thoại còn mở, rồi Huỷ đóng được', async () => {
    const deletion = pendingDelete();
    renderPage({ user: GVBM_TOAN });
    const dialog = await openDeleteDialogFor('Bài 1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận xóa' }));
    await userEvent.keyboard('{Escape}');

    await act(async () => {
      deletion.reject({ status: 404, data: { message: 'Không tìm thấy mục PPCT' } });
    });

    expect(await within(dialog).findByText('Không tìm thấy mục PPCT')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Huỷ' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  test('hộp thoại xóa có lề ngang trên điện thoại (không sát mép màn hình)', async () => {
    renderPage({ user: GVBM_TOAN });

    expect(await openDeleteDialogFor('Bài 1')).toHaveClass('w-[calc(100%-2rem)]');
  });
});
