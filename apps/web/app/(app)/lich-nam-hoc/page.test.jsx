import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/lib/store/auth-slice';
import { makeHoliday, makeSchoolYear } from '@/lib/test-fixtures/phase3';
import LichNamHocPage from './page';

const getSchoolYearsMock = jest.fn();
const getHolidaysMock = jest.fn();
const getCalendarStatsMock = jest.fn();
const createHolidayMock = jest.fn();
const updateHolidayMock = jest.fn();
const deleteHolidayMock = jest.fn();

jest.mock('@/lib/store/school-calendar-api', () => ({
  ...jest.requireActual('@/lib/store/school-calendar-api'),
  useGetSchoolYearsQuery: (...args) => getSchoolYearsMock(...args),
  useGetHolidaysQuery: (...args) => getHolidaysMock(...args),
  useGetCalendarStatsQuery: (...args) => getCalendarStatsMock(...args),
  useCreateHolidayMutation: () => [createHolidayMock, { isLoading: false }],
  useUpdateHolidayMutation: () => [updateHolidayMock, { isLoading: false }],
  useDeleteHolidayMutation: () => [deleteHolidayMock, { isLoading: false }],
}));

const YEAR_2025 = makeSchoolYear({
  _id: 'y1',
  name: '2025-2026',
  isCurrent: true,
  startDate: '2025-09-05T00:00:00.000Z',
  endDate: '2026-05-31T00:00:00.000Z',
});
const YEAR_2024 = makeSchoolYear({
  _id: 'y0',
  name: '2024-2025',
  isCurrent: false,
  startDate: '2024-09-05T00:00:00.000Z',
  endDate: '2025-05-31T00:00:00.000Z',
});

// Bản ghi thô của backend (Mongoose) còn có createdAt/updatedAt/__v: trang phải bỏ qua, không gửi lại khi sửa.
function rawHoliday(overrides) {
  return makeHoliday({
    createdAt: '2026-01-02T03:04:05.000Z',
    updatedAt: '2026-01-02T03:04:05.000Z',
    __v: 0,
    ...overrides,
  });
}

// Thứ tự cố ý KHÔNG theo ngày (Tết 02, bão 01, Giỗ Tổ 04): trang phải giữ đúng thứ tự backend trả về.
// "Nghỉ do bão" bắt đầu ở mốc cuối ngày UTC (23:30Z = 06:30 ngày sau giờ VN) để bắt lỗi dùng getter giờ địa phương.
const HOLIDAYS_Y1 = [
  rawHoliday({
    _id: 'h-tet',
    name: 'Nghỉ Tết Nguyên đán',
    type: 'KHAC',
    startDate: '2026-02-14T00:00:00.000Z',
    endDate: '2026-02-22T00:00:00.000Z',
  }),
  rawHoliday({
    _id: 'h-bao',
    name: 'Nghỉ do bão',
    type: 'DOT_XUAT',
    startDate: '2026-01-08T23:30:00.000Z',
    endDate: '2026-01-09T00:00:00.000Z',
  }),
  rawHoliday({
    _id: 'h-gio-to',
    name: 'Giỗ Tổ Hùng Vương',
    type: 'LE',
    startDate: '2026-04-26T00:00:00.000Z',
    endDate: '2026-04-26T00:00:00.000Z',
  }),
];
const HOLIDAYS_Y0 = [
  rawHoliday({
    _id: 'h-he',
    schoolYearId: 'y0',
    name: 'Nghỉ hè 2025',
    type: 'LE',
    startDate: '2025-05-26T00:00:00.000Z',
    endDate: '2025-05-26T00:00:00.000Z',
  }),
];

const STATS_Y1 = { totalHolidayDays: 4, leHolidayDays: 2, dotXuatHolidayDays: 2, remainingTeachingDays: 6 };
const STATS_Y0 = { totalHolidayDays: 11, leHolidayDays: 7, dotXuatHolidayDays: 1, remainingTeachingDays: 0 };
const STATS_EMPTY = { totalHolidayDays: 0, leHolidayDays: 0, dotXuatHolidayDays: 0, remainingTeachingDays: 0 };

function stubQueries({
  years = [YEAR_2025, YEAR_2024],
  holidaysByYear = { y1: HOLIDAYS_Y1, y0: HOLIDAYS_Y0 },
  statsByYear = { y1: STATS_Y1, y0: STATS_Y0 },
} = {}) {
  getSchoolYearsMock.mockReturnValue({ data: years, isLoading: false, isError: false });
  // currentData (không phải data): data của RTK Query giữ kết quả của năm trước trong lúc năm mới còn đang tải.
  getHolidaysMock.mockImplementation((schoolYearId, options) => ({
    currentData: options?.skip ? undefined : holidaysByYear[schoolYearId],
    isError: false,
  }));
  getCalendarStatsMock.mockImplementation((schoolYearId, options) => ({
    currentData: options?.skip ? undefined : statsByYear[schoolYearId],
    isError: false,
  }));
}

beforeEach(() => {
  for (const mock of [
    getSchoolYearsMock,
    getHolidaysMock,
    getCalendarStatsMock,
    createHolidayMock,
    updateHolidayMock,
    deleteHolidayMock,
  ]) {
    mock.mockReset();
  }
  stubQueries();
  createHolidayMock.mockReturnValue({ unwrap: () => Promise.resolve(makeHoliday()) });
  updateHolidayMock.mockReturnValue({ unwrap: () => Promise.resolve(makeHoliday()) });
  deleteHolidayMock.mockReturnValue({ unwrap: () => Promise.resolve({ deleted: true }) });
});

function renderPage({ role = 'TEACHER' } = {}) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: { user: role ? { id: 'u1', role } : null, accessToken: role ? 'token' : null },
    },
  });
  return render(
    <Provider store={store}>
      <LichNamHocPage />
    </Provider>,
  );
}

function statCard(name) {
  return screen.getByRole('group', { name });
}

function holidayRows() {
  return screen.getAllByRole('row').slice(1);
}

function rowOf(holidayName) {
  return screen.getByText(holidayName).closest('tr');
}

describe('thẻ thống kê', () => {
  test('4 thẻ đúng nhãn và đúng số của năm đang chọn, số dùng font-mono', () => {
    renderPage();

    const expected = {
      'Tổng ngày nghỉ': '4',
      'Nghỉ lễ': '2',
      'Nghỉ đột xuất': '2',
      'Số ngày dạy còn lại': '6',
    };
    for (const [label, value] of Object.entries(expected)) {
      const number = within(statCard(label)).getByText(value);
      expect(number).toHaveClass('font-mono');
    }
    expect(screen.getAllByRole('group')).toHaveLength(4);
  });

  test('thẻ "Số ngày dạy còn lại" có chú thích tính từ hôm nay, không tính Chủ nhật và ngày nghỉ', () => {
    renderPage();

    expect(
      within(statCard('Số ngày dạy còn lại')).getByText(
        'Tính từ hôm nay đến hết năm học, không tính Chủ nhật và ngày nghỉ',
      ),
    ).toBeInTheDocument();
  });

  test('năm học chưa có ngày nghỉ (thống kê toàn 0, danh sách rỗng): vẫn hiện đủ 4 thẻ số 0 và câu giải thích', () => {
    stubQueries({ holidaysByYear: { y1: [] }, statsByYear: { y1: STATS_EMPTY } });
    renderPage();

    for (const label of ['Tổng ngày nghỉ', 'Nghỉ lễ', 'Nghỉ đột xuất', 'Số ngày dạy còn lại']) {
      expect(within(statCard(label)).getByText('0')).toBeInTheDocument();
    }
    expect(screen.getByText('Năm học này chưa có ngày nghỉ nào')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('đang tải thống kê: hiện "Đang tải..." thay vì 4 thẻ', () => {
    getCalendarStatsMock.mockReturnValue({ currentData: undefined, isError: false });
    renderPage();

    expect(screen.queryAllByRole('group')).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải...');
  });

  test('lỗi 403 của guard (Forbidden resource, tiếng Anh) hiện câu tiếng Việt cố định, không hiện thẻ nào; danh sách ngày nghỉ vẫn hiện', () => {
    getCalendarStatsMock.mockReturnValue({
      currentData: undefined,
      isError: true,
      error: { status: 403, data: { message: 'Forbidden resource' } },
    });
    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('Bạn không có quyền thực hiện thao tác này');
    expect(screen.queryAllByRole('group')).toHaveLength(0);
    expect(screen.getByText('Nghỉ do bão')).toBeInTheDocument();
  });

  test('lỗi mạng không có message: hiện câu mặc định thay vì để trống', () => {
    getCalendarStatsMock.mockReturnValue({
      currentData: undefined,
      isError: true,
      error: { status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' },
    });
    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được thống kê ngày nghỉ');
  });
});

describe('danh sách ngày nghỉ', () => {
  test('cột đúng thứ tự Tên | Loại | Từ ngày | Đến ngày (không có cột thao tác với giáo viên)', () => {
    renderPage();

    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Tên',
      'Loại',
      'Từ ngày',
      'Đến ngày',
    ]);
  });

  test('hàng giữ đúng thứ tự backend trả về (không sắp lại); ngày dd/mm/yyyy từ ISO, mốc 23:30Z không lùi/nhảy ngày', () => {
    renderPage();

    const rows = holidayRows().map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent));
    expect(rows).toEqual([
      ['Nghỉ Tết Nguyên đán', 'Khác', '14/02/2026', '22/02/2026'],
      ['Nghỉ do bão', 'Nghỉ đột xuất', '08/01/2026', '09/01/2026'],
      ['Giỗ Tổ Hùng Vương', 'Nghỉ lễ', '26/04/2026', '26/04/2026'],
    ]);
  });

  test('Badge loại: Nghỉ đột xuất màu danger, Nghỉ lễ và Khác trung tính', () => {
    renderPage();

    expect(within(rowOf('Nghỉ do bão')).getByText('Nghỉ đột xuất')).toHaveClass('text-danger');
    expect(within(rowOf('Giỗ Tổ Hùng Vương')).getByText('Nghỉ lễ')).toHaveClass('text-fg-muted');
    expect(within(rowOf('Nghỉ Tết Nguyên đán')).getByText('Khác')).toHaveClass('text-fg-muted');
  });

  test('đang tải danh sách: hiện "Đang tải..." thay vì bảng hay câu "chưa có ngày nghỉ"', () => {
    getHolidaysMock.mockReturnValue({ currentData: undefined, isError: false });
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải...');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Năm học này chưa có ngày nghỉ nào')).not.toBeInTheDocument();
  });

  test('lỗi tải danh sách: hiện nguyên văn message, KHÔNG hiện bảng rỗng; thẻ thống kê vẫn hiện', () => {
    getHolidaysMock.mockReturnValue({
      currentData: undefined,
      isError: true,
      error: { status: 404, data: { message: 'Không tìm thấy năm học' } },
    });
    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('Không tìm thấy năm học');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Năm học này chưa có ngày nghỉ nào')).not.toBeInTheDocument();
    expect(screen.getAllByRole('group')).toHaveLength(4);
  });
});

describe('phân quyền hiển thị', () => {
  test('TEACHER chỉ xem: không có nút Thêm ngày nghỉ / Sửa / Xóa và không có cột Hành động', () => {
    renderPage({ role: 'TEACHER' });

    expect(screen.getByText('Nghỉ do bão')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm ngày nghỉ' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sửa' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xóa' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Hành động' })).toBeNull();
  });

  test('ADMIN có Thêm ngày nghỉ và Sửa + Xóa trên MỖI hàng, cột cuối là Hành động', () => {
    renderPage({ role: 'ADMIN' });

    expect(screen.getByRole('button', { name: 'Thêm ngày nghỉ' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Sửa' })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: 'Xóa' })).toHaveLength(3);
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Tên',
      'Loại',
      'Từ ngày',
      'Đến ngày',
      'Hành động',
    ]);
  });

  test('STUDENT vào thẳng URL: chỉ thấy câu từ chối và KHÔNG có hook query nào được gọi', () => {
    renderPage({ role: 'STUDENT' });

    expect(screen.getByText('Bạn không có quyền xem trang này')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Lịch năm học' })).not.toBeInTheDocument();
    expect(getSchoolYearsMock).not.toHaveBeenCalled();
    expect(getHolidaysMock).not.toHaveBeenCalled();
    expect(getCalendarStatsMock).not.toHaveBeenCalled();
  });

  test('phiên chưa khôi phục xong (user null): "Đang tải..." chứ chưa kết luận bị từ chối, chưa gọi hook query', () => {
    renderPage({ role: null });

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải...');
    expect(screen.queryByText('Bạn không có quyền xem trang này')).not.toBeInTheDocument();
    expect(getSchoolYearsMock).not.toHaveBeenCalled();
  });
});

describe('chọn năm học', () => {
  test('ưu tiên năm isCurrent dù không đứng đầu danh sách', () => {
    stubQueries({ years: [YEAR_2024, YEAR_2025] });
    renderPage();

    expect(screen.getByLabelText('Năm học')).toHaveValue('y1');
    expect(getHolidaysMock).toHaveBeenLastCalledWith('y1', { skip: false });
    expect(getCalendarStatsMock).toHaveBeenLastCalledWith('y1', { skip: false });
  });

  test.each([
    ['năm mới đứng sau', [YEAR_2024, { ...YEAR_2025, isCurrent: false }]],
    ['năm mới đứng trước', [{ ...YEAR_2025, isCurrent: false }, YEAR_2024]],
  ])(
    'không có năm isCurrent (%s): chọn năm có startDate mới nhất, không phụ thuộc thứ tự mảng của backend',
    (_title, years) => {
      stubQueries({ years });
      renderPage();

      expect(screen.getByLabelText('Năm học')).toHaveValue('y1');
      expect(getHolidaysMock).toHaveBeenLastCalledWith('y1', { skip: false });
    },
  );

  test('các lựa chọn giữ nguyên thứ tự backend trả về và hiện tên năm học', () => {
    stubQueries({ years: [YEAR_2024, YEAR_2025] });
    renderPage();

    const options = within(screen.getByLabelText('Năm học')).getAllByRole('option');
    expect(options.map((option) => [option.value, option.textContent])).toEqual([
      ['y0', '2024-2025'],
      ['y1', '2025-2026'],
    ]);
  });

  test('đổi năm học: hook ngày nghỉ và thống kê được gọi với id năm kia; bảng và thẻ hiện dữ liệu năm đó', async () => {
    renderPage();
    expect(screen.getByText('Nghỉ do bão')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Năm học'), 'y0');

    expect(getHolidaysMock).toHaveBeenLastCalledWith('y0', { skip: false });
    expect(getCalendarStatsMock).toHaveBeenLastCalledWith('y0', { skip: false });
    expect(screen.getByLabelText('Năm học')).toHaveValue('y0');
    expect(screen.getByText('Nghỉ hè 2025')).toBeInTheDocument();
    expect(screen.queryByText('Nghỉ do bão')).not.toBeInTheDocument();
    expect(within(statCard('Tổng ngày nghỉ')).getByText('11')).toBeInTheDocument();
  });

  test('chưa có năm học nào: hiện "Chưa có năm học nào", không có thẻ/bảng/nút thêm; 2 query được gọi với skip: true', () => {
    stubQueries({ years: [] });
    renderPage({ role: 'ADMIN' });

    expect(screen.getByText('Chưa có năm học nào')).toBeInTheDocument();
    expect(screen.queryAllByRole('group')).toHaveLength(0);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm ngày nghỉ' })).not.toBeInTheDocument();
    expect(getHolidaysMock.mock.calls.at(-1)[1]).toEqual({ skip: true });
    expect(getCalendarStatsMock.mock.calls.at(-1)[1]).toEqual({ skip: true });
  });

  test('đang tải danh sách năm học: "Đang tải...", 2 query ngày nghỉ/thống kê chưa chạy (skip: true)', () => {
    getSchoolYearsMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải...');
    expect(screen.queryByText('Chưa có năm học nào')).not.toBeInTheDocument();
    expect(getHolidaysMock.mock.calls.at(-1)[1]).toEqual({ skip: true });
    expect(getCalendarStatsMock.mock.calls.at(-1)[1]).toEqual({ skip: true });
  });

  test('lỗi tải danh sách năm học: hiện nguyên văn message, không rơi vào "Chưa có năm học nào"', () => {
    getSchoolYearsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 500, data: { message: 'Đã có lỗi xảy ra, vui lòng thử lại sau' } },
    });
    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('Đã có lỗi xảy ra, vui lòng thử lại sau');
    expect(screen.queryByText('Chưa có năm học nào')).not.toBeInTheDocument();
  });
});

describe('ADMIN thêm ngày nghỉ', () => {
  test('mở dialog, nhập đủ rồi Lưu: createHoliday với đủ 5 trường của năm đang chọn, dialog đóng khi thành công', async () => {
    renderPage({ role: 'ADMIN' });

    await userEvent.click(screen.getByRole('button', { name: 'Thêm ngày nghỉ' }));
    const dialog = await screen.findByRole('dialog', { name: 'Thêm ngày nghỉ' });
    await userEvent.type(within(dialog).getByLabelText('Tên'), 'Nghỉ lễ Quốc khánh');
    await userEvent.selectOptions(within(dialog).getByLabelText('Loại'), 'Nghỉ lễ');
    await userEvent.type(within(dialog).getByLabelText('Từ ngày'), '2026-09-02');
    await userEvent.type(within(dialog).getByLabelText('Đến ngày'), '2026-09-02');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createHolidayMock).toHaveBeenCalledTimes(1);
    expect(createHolidayMock).toHaveBeenCalledWith({
      schoolYearId: 'y1',
      name: 'Nghỉ lễ Quốc khánh',
      type: 'LE',
      startDate: '2026-09-02',
      endDate: '2026-09-02',
    });
  });

  test('sau khi đổi sang năm học khác, ngày nghỉ mới thuộc năm học đang chọn (không phải năm mặc định)', async () => {
    renderPage({ role: 'ADMIN' });
    await userEvent.selectOptions(screen.getByLabelText('Năm học'), 'y0');

    await userEvent.click(screen.getByRole('button', { name: 'Thêm ngày nghỉ' }));
    const dialog = await screen.findByRole('dialog', { name: 'Thêm ngày nghỉ' });
    await userEvent.type(within(dialog).getByLabelText('Tên'), 'Nghỉ hè');
    await userEvent.type(within(dialog).getByLabelText('Từ ngày'), '2025-06-01');
    await userEvent.type(within(dialog).getByLabelText('Đến ngày'), '2025-08-31');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(createHolidayMock).toHaveBeenCalledTimes(1));
    expect(createHolidayMock).toHaveBeenCalledWith(expect.objectContaining({ schoolYearId: 'y0' }));
  });

  test('backend từ chối (400): hiện nguyên văn trong dialog, dialog không đóng', async () => {
    createHolidayMock.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          status: 400,
          data: { message: 'Dữ liệu gửi lên không hợp lệ: Ngày kết thúc không được trước ngày bắt đầu' },
        }),
    });
    renderPage({ role: 'ADMIN' });

    await userEvent.click(screen.getByRole('button', { name: 'Thêm ngày nghỉ' }));
    const dialog = await screen.findByRole('dialog', { name: 'Thêm ngày nghỉ' });
    await userEvent.type(within(dialog).getByLabelText('Tên'), 'Nghỉ bão');
    await userEvent.type(within(dialog).getByLabelText('Từ ngày'), '2026-09-10');
    await userEvent.type(within(dialog).getByLabelText('Đến ngày'), '2026-09-02');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));

    expect((await within(dialog).findByRole('alert')).textContent).toContain(
      'Ngày kết thúc không được trước ngày bắt đầu',
    );
    expect(screen.getByRole('dialog', { name: 'Thêm ngày nghỉ' })).toBeInTheDocument();
  });
});

describe('ADMIN sửa ngày nghỉ', () => {
  test('bấm Sửa ở hàng thứ 2: dialog điền sẵn đúng hàng đó (ngày từ ISO), Lưu gọi updateHoliday với id hàng đó', async () => {
    renderPage({ role: 'ADMIN' });

    await userEvent.click(within(rowOf('Nghỉ do bão')).getByRole('button', { name: 'Sửa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sửa ngày nghỉ' });
    expect(within(dialog).getByLabelText('Tên')).toHaveValue('Nghỉ do bão');
    expect(within(dialog).getByLabelText('Loại')).toHaveValue('DOT_XUAT');
    expect(within(dialog).getByLabelText('Từ ngày')).toHaveValue('2026-01-08');
    expect(within(dialog).getByLabelText('Đến ngày')).toHaveValue('2026-01-09');

    await userEvent.clear(within(dialog).getByLabelText('Tên'));
    await userEvent.type(within(dialog).getByLabelText('Tên'), 'Nghỉ do bão lụt');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(updateHolidayMock).toHaveBeenCalledTimes(1);
    expect(updateHolidayMock).toHaveBeenCalledWith({
      id: 'h-bao',
      schoolYearId: 'y1',
      name: 'Nghỉ do bão lụt',
      type: 'DOT_XUAT',
      startDate: '2026-01-08',
      endDate: '2026-01-09',
    });
    expect(createHolidayMock).not.toHaveBeenCalled();
  });

  test('sửa hàng A, đóng, rồi sửa hàng B: dialog của B không mang dữ liệu của A', async () => {
    renderPage({ role: 'ADMIN' });

    await userEvent.click(within(rowOf('Nghỉ Tết Nguyên đán')).getByRole('button', { name: 'Sửa' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Huỷ' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await userEvent.click(within(rowOf('Giỗ Tổ Hùng Vương')).getByRole('button', { name: 'Sửa' }));

    const dialog = await screen.findByRole('dialog', { name: 'Sửa ngày nghỉ' });
    expect(within(dialog).getByLabelText('Tên')).toHaveValue('Giỗ Tổ Hùng Vương');
    expect(within(dialog).getByLabelText('Loại')).toHaveValue('LE');
    expect(within(dialog).getByLabelText('Từ ngày')).toHaveValue('2026-04-26');
  });
});

describe('ADMIN xóa ngày nghỉ', () => {
  test('bấm Xóa: dialog xác nhận nêu rõ ngày nghỉ và việc tính lại sổ báo giảng; chưa gọi API cho tới khi xác nhận', async () => {
    renderPage({ role: 'ADMIN' });

    await userEvent.click(within(rowOf('Giỗ Tổ Hùng Vương')).getByRole('button', { name: 'Xóa' }));

    const dialog = await screen.findByRole('dialog', { name: 'Xóa ngày nghỉ?' });
    expect(dialog).toHaveTextContent('Sổ báo giảng của tất cả các môn sẽ được tính lại');
    expect(dialog).toHaveTextContent('Giỗ Tổ Hùng Vương');
    expect(dialog).toHaveTextContent('26/04/2026');
    expect(dialog).toHaveAccessibleDescription(expect.stringContaining('Sổ báo giảng của tất cả các môn sẽ được tính lại'));
    expect(deleteHolidayMock).not.toHaveBeenCalled();
  });

  test('dialog xác nhận hiện khoảng ngày dd/mm/yyyy (mốc 23:30Z không nhảy ngày); ngày nghỉ 1 ngày chỉ hiện 1 ngày', async () => {
    renderPage({ role: 'ADMIN' });

    await userEvent.click(within(rowOf('Nghỉ do bão')).getByRole('button', { name: 'Xóa' }));
    const rangeDialog = await screen.findByRole('dialog', { name: 'Xóa ngày nghỉ?' });
    expect(rangeDialog).toHaveTextContent('"Nghỉ do bão" (08/01/2026 – 09/01/2026)');
    await userEvent.click(within(rangeDialog).getByRole('button', { name: 'Huỷ' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await userEvent.click(within(rowOf('Giỗ Tổ Hùng Vương')).getByRole('button', { name: 'Xóa' }));
    const singleDayDialog = await screen.findByRole('dialog', { name: 'Xóa ngày nghỉ?' });
    expect(singleDayDialog).toHaveTextContent('"Giỗ Tổ Hùng Vương" (26/04/2026)');
  });

  test('xác nhận: deleteHoliday({ id, schoolYearId }) đúng hàng, dialog đóng khi thành công', async () => {
    renderPage({ role: 'ADMIN' });

    await userEvent.click(within(rowOf('Giỗ Tổ Hùng Vương')).getByRole('button', { name: 'Xóa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Xóa ngày nghỉ?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xóa ngày nghỉ' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteHolidayMock).toHaveBeenCalledTimes(1);
    expect(deleteHolidayMock).toHaveBeenCalledWith({ id: 'h-gio-to', schoolYearId: 'y1' });
  });

  test('Huỷ không gọi API và đóng dialog', async () => {
    renderPage({ role: 'ADMIN' });

    await userEvent.click(within(rowOf('Nghỉ do bão')).getByRole('button', { name: 'Xóa' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Huỷ' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteHolidayMock).not.toHaveBeenCalled();
  });

  test('Esc đóng dialog khi đang rảnh và không gọi API', async () => {
    renderPage({ role: 'ADMIN' });

    await userEvent.click(within(rowOf('Nghỉ do bão')).getByRole('button', { name: 'Xóa' }));
    expect(await screen.findByRole('dialog', { name: 'Xóa ngày nghỉ?' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteHolidayMock).not.toHaveBeenCalled();
  });

  test('404 (ngày nghỉ đã bị người khác xóa): hiện nguyên văn trong dialog, dialog không đóng', async () => {
    deleteHolidayMock.mockReturnValue({
      unwrap: () => Promise.reject({ status: 404, data: { message: 'Không tìm thấy ngày nghỉ' } }),
    });
    renderPage({ role: 'ADMIN' });

    await userEvent.click(within(rowOf('Nghỉ do bão')).getByRole('button', { name: 'Xóa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Xóa ngày nghỉ?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xóa ngày nghỉ' }));

    expect((await within(dialog).findByRole('alert')).textContent).toBe('Không tìm thấy ngày nghỉ');
    expect(screen.getByRole('dialog', { name: 'Xóa ngày nghỉ?' })).toBeInTheDocument();
  });

  test('lỗi 403 của guard hiện câu tiếng Việt cố định trong dialog', async () => {
    deleteHolidayMock.mockReturnValue({
      unwrap: () => Promise.reject({ status: 403, data: { message: 'Forbidden resource' } }),
    });
    renderPage({ role: 'ADMIN' });

    await userEvent.click(within(rowOf('Nghỉ do bão')).getByRole('button', { name: 'Xóa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Xóa ngày nghỉ?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xóa ngày nghỉ' }));

    expect((await within(dialog).findByRole('alert')).textContent).toBe('Bạn không có quyền thực hiện thao tác này');
  });
});
