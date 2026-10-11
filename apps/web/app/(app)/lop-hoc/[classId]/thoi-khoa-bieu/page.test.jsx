import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/lib/store/auth-slice';
import { CLASS_DETAIL, makeSlot } from '@/lib/test-fixtures/phase3';
import ClassTimetablePage from './page';

const getClassDetailMock = jest.fn();
jest.mock('@/lib/store/classes-api', () => ({
  ...jest.requireActual('@/lib/store/classes-api'),
  useGetClassDetailQuery: (...args) => getClassDetailMock(...args),
}));

const getSlotsMock = jest.fn();
jest.mock('@/lib/store/timetable-api', () => ({
  ...jest.requireActual('@/lib/store/timetable-api'),
  useGetPositionTimetableSlotsQuery: (...args) => getSlotsMock(...args),
  useCreateTimetableSlotMutation: () => [jest.fn(), { isLoading: false }],
  useUpdateTimetableSlotMutation: () => [jest.fn(), { isLoading: false }],
  useDeleteTimetableSlotMutation: () => [jest.fn(), { isLoading: false }],
}));

const GVCN = { id: 'u-gvcn', role: 'TEACHER' };
const GVBM_TOAN = { id: 'u-toan', role: 'TEACHER' };
const GVBM_VAN = { id: 'u-van', role: 'TEACHER' };
const OUTSIDER = { id: 'u-khac', role: 'TEACHER' };
const ADMIN = { id: 'u-admin', role: 'ADMIN' };

function renderPage({ user = GVBM_TOAN, classId = 'class-1', searchParams = {} } = {}) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { user, accessToken: user ? 'token' : null } },
  });
  return render(
    <Provider store={store}>
      <ClassTimetablePage params={{ classId }} searchParams={searchParams} />
    </Provider>,
  );
}

const queriedPositionIds = () => getSlotsMock.mock.calls.map(([positionId]) => positionId);

function optionTexts(select) {
  return within(select)
    .getAllByRole('option')
    .map((option) => option.textContent);
}

beforeEach(() => {
  getClassDetailMock.mockReset();
  getSlotsMock.mockReset();
  getClassDetailMock.mockReturnValue({ data: CLASS_DETAIL, isLoading: false, isError: false });
  getSlotsMock.mockImplementation(() => ({
    data: [makeSlot({ _id: 's1', dayOfWeek: 2, period: 1 })],
    isLoading: false,
    isError: false,
  }));
});

describe('GVBM giữ môn', () => {
  test('GVBM Toán: có Thêm tiết/Sửa/Xóa; chỉ 1 môn nên là chữ tĩnh (không có bộ chọn) và chỉ tải tiết của p-toan', () => {
    renderPage({ user: GVBM_TOAN });

    expect(getClassDetailMock).toHaveBeenCalledWith('class-1');
    expect(screen.getByRole('heading', { level: 1, name: 'Thời khóa biểu môn' })).toBeInTheDocument();
    expect(screen.getByText('11A4')).toBeInTheDocument();
    expect(screen.getByText('Toán')).toBeInTheDocument();
    expect(screen.queryByLabelText('Môn')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm tiết' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xóa' })).toBeInTheDocument();
    expect(new Set(queriedPositionIds())).toEqual(new Set(['p-toan']));
  });

  test('GVBM Văn: không có Toán và không có Vật lý ở đâu cả; chỉ tải tiết của p-van', () => {
    renderPage({ user: GVBM_VAN });

    expect(screen.getByText('Ngữ văn')).toBeInTheDocument();
    expect(screen.queryByText('Toán')).not.toBeInTheDocument();
    expect(screen.queryByText('Vật lý')).not.toBeInTheDocument();
    expect(new Set(queriedPositionIds())).toEqual(new Set(['p-van']));
    expect(screen.getByRole('button', { name: 'Thêm tiết' })).toBeInTheDocument();
  });

  test('GVBM Văn gõ URL kèm positionId của môn Toán: bị bỏ qua, vẫn là môn Văn và KHÔNG gọi API của môn Toán', () => {
    renderPage({ user: GVBM_VAN, searchParams: { positionId: 'p-toan' } });

    expect(screen.getByText('Ngữ văn')).toBeInTheDocument();
    expect(queriedPositionIds()).not.toContain('p-toan');
  });
});

describe('GVCN chỉ xem', () => {
  test('thấy bảng tiết của môn Toán (người khác giữ) nhưng không có Thêm tiết, Sửa, Xóa; bộ chọn có 3 môn SUBJECT', () => {
    renderPage({ user: GVCN });

    expect(optionTexts(screen.getByLabelText('Môn'))).toEqual(['Toán', 'Ngữ văn', 'Vật lý']);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Thứ 2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm tiết' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xóa' })).not.toBeInTheDocument();
  });

  test('đổi môn trong bộ chọn → tải tiết của môn vừa chọn, vẫn không có control sửa', async () => {
    renderPage({ user: GVCN });

    await userEvent.selectOptions(screen.getByLabelText('Môn'), 'Ngữ văn');

    expect(queriedPositionIds().at(-1)).toBe('p-van');
    expect(screen.queryByRole('button', { name: 'Thêm tiết' })).not.toBeInTheDocument();
  });

  test('bộ chọn không bao giờ có vị trí chủ nhiệm', () => {
    renderPage({ user: GVCN });

    expect(optionTexts(screen.getByLabelText('Môn'))).not.toContain('Chủ nhiệm');
    expect(queriedPositionIds()).not.toContain('p-hr');
  });
});

describe('ADMIN', () => {
  test('có control sửa cho bất kỳ môn nào, kể cả môn đang trống người giữ', async () => {
    renderPage({ user: ADMIN });

    expect(optionTexts(screen.getByLabelText('Môn'))).toEqual(['Toán', 'Ngữ văn', 'Vật lý']);
    expect(screen.getByRole('button', { name: 'Thêm tiết' })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Môn'), 'Vật lý');

    expect(queriedPositionIds().at(-1)).toBe('p-ly');
    expect(screen.getByRole('button', { name: 'Thêm tiết' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeInTheDocument();
  });
});

describe('môn chọn sẵn từ URL', () => {
  test('searchParams.positionId hợp lệ → môn đó được chọn sẵn và là môn được tải', () => {
    renderPage({ user: GVCN, searchParams: { positionId: 'p-van' } });

    expect(screen.getByLabelText('Môn')).toHaveDisplayValue('Ngữ văn');
    expect(new Set(queriedPositionIds())).toEqual(new Set(['p-van']));
  });

  test('positionId không có trong danh sách → rơi về môn mặc định (đầu danh sách với GVCN)', () => {
    renderPage({ user: GVCN, searchParams: { positionId: 'p-khong-ton-tai' } });

    expect(screen.getByLabelText('Môn')).toHaveDisplayValue('Toán');
    expect(new Set(queriedPositionIds())).toEqual(new Set(['p-toan']));
  });

  test('positionId trỏ vào vị trí chủ nhiệm cũng bị bỏ qua', () => {
    renderPage({ user: GVCN, searchParams: { positionId: 'p-hr' } });

    expect(screen.getByLabelText('Môn')).toHaveDisplayValue('Toán');
    expect(queriedPositionIds()).not.toContain('p-hr');
  });

  test('không truyền searchParams vẫn chạy bình thường', () => {
    getClassDetailMock.mockReturnValue({ data: CLASS_DETAIL, isLoading: false, isError: false });
    const store = configureStore({
      reducer: { auth: authReducer },
      preloadedState: { auth: { user: GVBM_TOAN, accessToken: 'token' } },
    });
    render(
      <Provider store={store}>
        <ClassTimetablePage params={{ classId: 'class-1' }} />
      </Provider>,
    );

    expect(screen.getByText('Toán')).toBeInTheDocument();
  });
});

describe('trạng thái tải, lỗi và rỗng', () => {
  test('đang tải thông tin lớp: chỉ "Đang tải...", chưa gọi API tiết', () => {
    getClassDetailMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderPage();

    expect(screen.getByText('Đang tải...')).toBeInTheDocument();
    expect(getSlotsMock).not.toHaveBeenCalled();
  });

  test('người dùng chưa tải xong (Providers khôi phục phiên bất đồng bộ): chờ, không nháy "chưa giữ môn nào"', () => {
    renderPage({ user: null });

    expect(screen.getByText('Đang tải...')).toBeInTheDocument();
    expect(screen.queryByText('Bạn chưa giữ môn nào trong lớp này')).not.toBeInTheDocument();
    expect(getSlotsMock).not.toHaveBeenCalled();
  });

  test('403 → "Bạn không có quyền xem lớp này", không render bảng hay control nào', () => {
    getClassDetailMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 403, data: { message: 'Forbidden resource' } },
    });
    renderPage();

    expect(screen.getByText('Bạn không có quyền xem lớp này')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(getSlotsMock).not.toHaveBeenCalled();
  });

  test('404 → "Không tìm thấy lớp"', () => {
    getClassDetailMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 404, data: { message: 'Không tìm thấy lớp' } },
    });
    renderPage();

    expect(screen.getByText('Không tìm thấy lớp')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('lỗi khác (500) hiện message của backend, không nói nhầm là "không tìm thấy lớp"', () => {
    getClassDetailMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 500, data: { message: 'Đã có lỗi xảy ra, vui lòng thử lại sau' } },
    });
    renderPage();

    expect(screen.getByText('Đã có lỗi xảy ra, vui lòng thử lại sau')).toBeInTheDocument();
    expect(screen.queryByText('Không tìm thấy lớp')).not.toBeInTheDocument();
  });

  test('người dùng không giữ môn nào trong lớp: câu giải thích, không gọi API tiết và không có control sửa', () => {
    renderPage({ user: OUTSIDER });

    expect(screen.getByText('Bạn chưa giữ môn nào trong lớp này')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm tiết' })).not.toBeInTheDocument();
    expect(getSlotsMock).not.toHaveBeenCalled();
  });

  test('môn chưa có tiết nào: hiện câu của bảng tiết kèm Thêm tiết cho người giữ môn', () => {
    getSlotsMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderPage({ user: GVBM_TOAN });

    expect(screen.getByText('Môn này chưa khai báo tiết nào')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm tiết' })).toBeInTheDocument();
  });
});
