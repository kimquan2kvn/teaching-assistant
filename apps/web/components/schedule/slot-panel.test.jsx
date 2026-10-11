import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { makeStore } from '@/lib/store/store';
import { makeSlot } from '@/lib/test-fixtures/phase3';
import { SlotPanel } from './slot-panel';

const actualTimetableApi = jest.requireActual('@/lib/store/timetable-api');
const getSlotsMock = jest.fn();
const createSlotMock = jest.fn();
const updateSlotMock = jest.fn();
const deleteSlotMock = jest.fn();
// Mặc định mutation xóa bị mock; riêng test "bấm đúp" đổi sang hook THẬT trên store thật để kiểm cả khóa nút lẫn request.
let useDeleteImpl;
jest.mock('@/lib/store/timetable-api', () => ({
  ...jest.requireActual('@/lib/store/timetable-api'),
  useGetPositionTimetableSlotsQuery: (...args) => getSlotsMock(...args),
  useCreateTimetableSlotMutation: () => [createSlotMock, { isLoading: false }],
  useUpdateTimetableSlotMutation: () => [updateSlotMock, { isLoading: false }],
  useDeleteTimetableSlotMutation: () => useDeleteImpl(),
}));

const KEEP_LOGS_SENTENCE = 'Các buổi đã tích "Đã thực hiện" hoặc đã chỉnh tay được giữ nguyên.';

// Thứ tự đầu vào cố ý lộn xộn; mảng đóng băng như dữ liệu RTK Query thật (immer auto-freeze) để bắt lỗi sort tại chỗ.
const JUMBLED_SLOTS = Object.freeze([
  makeSlot({ _id: 's3', dayOfWeek: 5, period: 3 }),
  makeSlot({ _id: 's2', dayOfWeek: 2, period: 3 }),
  makeSlot({ _id: 's1', dayOfWeek: 2, period: 1 }),
]);

function mockSlots(data) {
  getSlotsMock.mockReturnValue({ data, isLoading: false, isError: false });
}

function renderPanel(props) {
  return render(<SlotPanel positionId="p-toan" canEdit={false} {...props} />);
}

function bodyRowCells() {
  const [, ...bodyRows] = screen.getAllByRole('row');
  return bodyRows.map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent));
}

beforeEach(() => {
  getSlotsMock.mockReset();
  createSlotMock.mockReset();
  updateSlotMock.mockReset();
  deleteSlotMock.mockReset();
  createSlotMock.mockReturnValue({ unwrap: () => Promise.resolve(makeSlot()) });
  updateSlotMock.mockReturnValue({ unwrap: () => Promise.resolve(makeSlot()) });
  deleteSlotMock.mockReturnValue({ unwrap: () => Promise.resolve({ deleted: true }) });
  useDeleteImpl = () => [deleteSlotMock, { isLoading: false }];
  global.fetch = jest.fn();
});

describe('bảng tiết', () => {
  test('sắp theo Thứ, rồi Tiết, rồi ngày hiệu lực; effectiveTo null hiện "Chưa kết thúc"; ngày dạng dd/mm/yyyy', () => {
    mockSlots(JUMBLED_SLOTS);
    renderPanel();

    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Thứ',
      'Tiết',
      'Hiệu lực từ',
      'Đến',
    ]);
    expect(bodyRowCells()).toEqual([
      ['Thứ 2', 'Tiết 1', '05/01/2026', 'Chưa kết thúc'],
      ['Thứ 2', 'Tiết 3', '05/01/2026', 'Chưa kết thúc'],
      ['Thứ 5', 'Tiết 3', '05/01/2026', 'Chưa kết thúc'],
    ]);
  });

  test('cùng Thứ và Tiết nhưng khác khoảng hiệu lực: khoảng bắt đầu sớm hơn đứng trước', () => {
    mockSlots([
      makeSlot({ _id: 'late', effectiveFrom: '2026-03-02T00:00:00.000Z', effectiveTo: null }),
      makeSlot({ _id: 'early', effectiveFrom: '2026-01-05T00:00:00.000Z', effectiveTo: '2026-03-01T00:00:00.000Z' }),
    ]);
    renderPanel();

    expect(bodyRowCells()).toEqual([
      ['Thứ 2', 'Tiết 1', '05/01/2026', '01/03/2026'],
      ['Thứ 2', 'Tiết 1', '02/03/2026', 'Chưa kết thúc'],
    ]);
  });

  test('ngày ISO cuối ngày UTC (23:30Z) vẫn hiện đúng ngày UTC, không nhảy sang ngày sau theo giờ VN', () => {
    mockSlots([
      makeSlot({ effectiveFrom: '2026-01-05T23:30:00.000Z', effectiveTo: '2026-01-18T23:30:00.000Z' }),
    ]);
    renderPanel();

    expect(bodyRowCells()).toEqual([['Thứ 2', 'Tiết 1', '05/01/2026', '18/01/2026']]);
  });

  test('canEdit=false: không có Thêm tiết, Sửa, Xóa và không có cột thao tác', () => {
    mockSlots(JUMBLED_SLOTS);
    renderPanel({ canEdit: false });

    expect(screen.queryByRole('button', { name: 'Thêm tiết' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xóa' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(4);
  });

  test('canEdit=true: có Thêm tiết và mỗi hàng có Sửa, Xóa', () => {
    mockSlots(JUMBLED_SLOTS);
    renderPanel({ canEdit: true });

    expect(screen.getByRole('button', { name: 'Thêm tiết' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Sửa' })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: 'Xóa' })).toHaveLength(3);
  });

  test('không có tiết nào: hiện câu giải thích thay vì bảng rỗng; người sửa được vẫn có Thêm tiết', () => {
    mockSlots([]);
    renderPanel({ canEdit: true });

    expect(screen.getByText('Môn này chưa khai báo tiết nào')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm tiết' })).toBeInTheDocument();
  });

  test('người chỉ xem + chưa có tiết: chỉ có câu giải thích, không có nút nào', () => {
    mockSlots([]);
    renderPanel({ canEdit: false });

    expect(screen.getByText('Môn này chưa khai báo tiết nào')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('tải dữ liệu', () => {
  test('gọi query theo positionId được truyền vào; không có positionId thì skip', () => {
    mockSlots([]);
    const { rerender } = renderPanel({ positionId: 'p-van' });
    expect(getSlotsMock).toHaveBeenLastCalledWith('p-van', { skip: false });

    rerender(<SlotPanel positionId="" canEdit={false} />);
    expect(getSlotsMock).toHaveBeenLastCalledWith('', { skip: true });
  });

  test('đang tải: chỉ hiện "Đang tải...", không nháy câu "chưa khai báo tiết nào" và không có bảng', () => {
    getSlotsMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderPanel({ canEdit: true });

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải...');
    expect(screen.queryByText('Môn này chưa khai báo tiết nào')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('lỗi 403 của guard (tiếng Anh) hiện câu tiếng Việt cố định; lỗi khác hiện nguyên văn message của backend', () => {
    getSlotsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 403, data: { message: 'Forbidden resource' } },
    });
    const { unmount } = renderPanel();
    expect(screen.getByRole('alert')).toHaveTextContent('Bạn không có quyền thực hiện thao tác này');
    expect(screen.queryByText('Môn này chưa khai báo tiết nào')).not.toBeInTheDocument();
    unmount();

    getSlotsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 500, data: { message: 'Đã có lỗi xảy ra, vui lòng thử lại sau' } },
    });
    renderPanel();
    expect(screen.getByRole('alert')).toHaveTextContent('Đã có lỗi xảy ra, vui lòng thử lại sau');
  });

  test('lỗi mạng không kèm message: hiện câu dự phòng', () => {
    getSlotsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' },
    });
    renderPanel();

    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được danh sách tiết, vui lòng thử lại');
  });
});

describe('xóa tiết', () => {
  test('hộp xác nhận nêu buổi đã chốt được giữ nguyên; xác nhận gọi deleteTimetableSlot đúng tiết của HÀNG được bấm', async () => {
    mockSlots(JUMBLED_SLOTS);
    renderPanel({ canEdit: true });

    // Hàng thứ 2 theo thứ tự hiển thị là s2 (Thứ 2 Tiết 3), không phải phần tử thứ 2 của mảng đầu vào.
    await userEvent.click(screen.getAllByRole('button', { name: 'Xóa' })[1]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(KEEP_LOGS_SENTENCE)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));

    expect(deleteSlotMock).toHaveBeenCalledTimes(1);
    expect(deleteSlotMock).toHaveBeenCalledWith({ positionId: 'p-toan', slotId: 's2' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('Huỷ không gọi API và đóng hộp thoại', async () => {
    mockSlots(JUMBLED_SLOTS);
    renderPanel({ canEdit: true });

    await userEvent.click(screen.getAllByRole('button', { name: 'Xóa' })[0]);
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Huỷ' }));

    expect(deleteSlotMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('backend từ chối: hiện nguyên văn message, hộp thoại KHÔNG đóng và nút xác nhận bấm lại được', async () => {
    mockSlots(JUMBLED_SLOTS);
    deleteSlotMock.mockReturnValue({
      unwrap: () => Promise.reject({ status: 404, data: { message: 'Không tìm thấy tiết trong thời khóa biểu' } }),
    });
    renderPanel({ canEdit: true });

    await userEvent.click(screen.getAllByRole('button', { name: 'Xóa' })[0]);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));

    expect(await within(dialog).findByText('Không tìm thấy tiết trong thời khóa biểu')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Xác nhận' })).toBeEnabled();
  });

  test('mở lại hộp thoại cho tiết khác sau một lần lỗi: không còn dòng lỗi cũ', async () => {
    mockSlots(JUMBLED_SLOTS);
    deleteSlotMock.mockReturnValueOnce({
      unwrap: () => Promise.reject({ status: 404, data: { message: 'Không tìm thấy tiết trong thời khóa biểu' } }),
    });
    renderPanel({ canEdit: true });

    await userEvent.click(screen.getAllByRole('button', { name: 'Xóa' })[0]);
    let dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));
    await within(dialog).findByText('Không tìm thấy tiết trong thời khóa biểu');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Huỷ' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await userEvent.click(screen.getAllByRole('button', { name: 'Xóa' })[1]);
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('Không tìm thấy tiết trong thời khóa biểu')).not.toBeInTheDocument();
  });
});

describe('chặn gửi hai lần khi backend đang tính lại sổ báo giảng', () => {
  test('isLoading: nút xác nhận thành "Đang xóa..." và bị khóa', async () => {
    useDeleteImpl = () => [deleteSlotMock, { isLoading: true }];
    mockSlots(JUMBLED_SLOTS);
    renderPanel({ canEdit: true });

    await userEvent.click(screen.getAllByRole('button', { name: 'Xóa' })[0]);
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).queryByRole('button', { name: 'Xác nhận' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Đang xóa...' })).toBeDisabled();
  });

  test('hook và store thật: bấm đúp "Xác nhận" lúc request còn treo chỉ gửi ĐÚNG 1 request DELETE', async () => {
    useDeleteImpl = actualTimetableApi.useDeleteTimetableSlotMutation;
    global.fetch = jest.fn(() => new Promise(() => {}));
    mockSlots(JUMBLED_SLOTS);
    render(
      <Provider store={makeStore()}>
        <SlotPanel positionId="p-toan" canEdit />
      </Provider>,
    );

    await userEvent.click(screen.getAllByRole('button', { name: 'Xóa' })[0]);
    const dialog = await screen.findByRole('dialog');
    await userEvent.dblClick(within(dialog).getByRole('button', { name: 'Xác nhận' }));

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const request = global.fetch.mock.calls[0][0];
    expect(request.method).toBe('DELETE');
    expect(new URL(request.url).pathname).toBe('/positions/p-toan/timetable-slots/s1');
    expect(within(dialog).getByRole('button', { name: 'Đang xóa...' })).toBeDisabled();
  });
});

describe('thêm và sửa tiết (hộp thoại nhúng trong panel)', () => {
  test('Thêm tiết mở hộp thoại tạo mới; lưu gọi createTimetableSlot cho đúng vị trí', async () => {
    mockSlots([]);
    renderPanel({ canEdit: true });

    await userEvent.click(screen.getByRole('button', { name: 'Thêm tiết' }));
    const dialog = await screen.findByRole('dialog', { name: 'Thêm tiết' });
    expect(within(dialog).getByLabelText('Hiệu lực từ').value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));

    expect(createSlotMock).toHaveBeenCalledTimes(1);
    expect(createSlotMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({ positionId: 'p-toan', dayOfWeek: 2, period: 1, effectiveTo: null }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('Sửa mở hộp thoại điền sẵn đúng tiết của HÀNG được bấm và lưu gọi updateTimetableSlot với slotId của hàng đó', async () => {
    mockSlots([
      makeSlot({ _id: 's-thu2', dayOfWeek: 2, period: 1, effectiveFrom: '2026-01-05T00:00:00.000Z' }),
      makeSlot({
        _id: 's-thu5',
        dayOfWeek: 5,
        period: 3,
        effectiveFrom: '2026-02-02T00:00:00.000Z',
        effectiveTo: '2026-03-01T00:00:00.000Z',
      }),
    ]);
    renderPanel({ canEdit: true });

    await userEvent.click(screen.getAllByRole('button', { name: 'Sửa' })[1]);
    const dialog = await screen.findByRole('dialog', { name: 'Sửa tiết' });
    expect(within(dialog).getByLabelText('Thứ')).toHaveDisplayValue('Thứ 5');
    expect(within(dialog).getByLabelText('Tiết')).toHaveDisplayValue('Tiết 3');
    expect(within(dialog).getByLabelText('Hiệu lực từ')).toHaveValue('2026-02-02');
    expect(within(dialog).getByLabelText('Đến ngày')).toHaveValue('2026-03-01');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));

    expect(updateSlotMock).toHaveBeenCalledWith({
      positionId: 'p-toan',
      slotId: 's-thu5',
      dayOfWeek: 5,
      period: 3,
      effectiveFrom: '2026-02-02',
      effectiveTo: '2026-03-01',
    });
    expect(createSlotMock).not.toHaveBeenCalled();
  });
});
