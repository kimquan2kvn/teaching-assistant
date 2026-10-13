import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { makeStore } from '@/lib/store/store';
import { makeSlot } from '@/lib/test-fixtures/phase3';
import { SlotFormDialog } from './slot-form-dialog';

const actualTimetableApi = jest.requireActual('@/lib/store/timetable-api');
const createSlotMock = jest.fn();
const updateSlotMock = jest.fn();
// Mặc định 2 mutation bị mock; riêng test "bấm đúp" đổi sang hook THẬT trên store thật để kiểm cả khóa nút lẫn request.
let useCreateImpl;
let useUpdateImpl;
jest.mock('@/lib/store/timetable-api', () => ({
  ...jest.requireActual('@/lib/store/timetable-api'),
  useCreateTimetableSlotMutation: () => useCreateImpl(),
  useUpdateTimetableSlotMutation: () => useUpdateImpl(),
}));

const NOTE_SENTENCE = 'Lưu tiết sẽ tự xếp lại các buổi báo giảng chưa chốt của môn';

function renderDialog(props = {}) {
  const onOpenChange = jest.fn();
  const store = makeStore();
  const utils = render(
    <Provider store={store}>
      <SlotFormDialog open onOpenChange={onOpenChange} positionId="p-toan" {...props} />
    </Provider>,
  );
  return { ...utils, onOpenChange, store };
}

// `<input type="date">` nhận/trả chuỗi yyyy-mm-dd; fireEvent.change đặt thẳng giá trị như trình duyệt khi chọn ngày.
function setDate(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function optionTexts(label) {
  return within(screen.getByLabelText(label))
    .getAllByRole('option')
    .map((option) => option.textContent);
}

// Chỉ giả `Date` (không giả setTimeout/promise) để userEvent và RTK Query vẫn chạy bình thường.
function fakeNow(isoInstant) {
  jest.useFakeTimers({
    now: new Date(isoInstant),
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
}

function rejectWith(status, message) {
  return { unwrap: () => Promise.reject({ status, data: { message } }) };
}

beforeEach(() => {
  createSlotMock.mockReset();
  updateSlotMock.mockReset();
  createSlotMock.mockReturnValue({ unwrap: () => Promise.resolve(makeSlot()) });
  updateSlotMock.mockReturnValue({ unwrap: () => Promise.resolve(makeSlot()) });
  useCreateImpl = () => [createSlotMock, { isLoading: false }];
  useUpdateImpl = () => [updateSlotMock, { isLoading: false }];
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('các ô nhập', () => {
  test('Thứ có đúng 6 lựa chọn Thứ 2…Thứ 7 (không có Chủ nhật); Tiết có đúng 10 lựa chọn Tiết 1…Tiết 10', () => {
    renderDialog();

    expect(optionTexts('Thứ')).toEqual(['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']);
    expect(optionTexts('Tiết')).toEqual(Array.from({ length: 10 }, (_, index) => `Tiết ${index + 1}`));
  });

  test('tiêu đề theo chế độ, có ghi chú về việc xếp lại sổ báo giảng, Đến ngày để trống mặc định', () => {
    const { unmount } = renderDialog();
    expect(screen.getByRole('dialog', { name: 'Thêm tiết' })).toBeInTheDocument();
    expect(screen.getByText(NOTE_SENTENCE)).toBeInTheDocument();
    expect(screen.getByLabelText('Đến ngày')).toHaveValue('');
    unmount();

    renderDialog({ slot: makeSlot() });
    expect(screen.getByRole('dialog', { name: 'Sửa tiết' })).toBeInTheDocument();
  });

  test('Hiệu lực từ mặc định là hôm nay theo giờ Việt Nam: 06:30 sáng 09/10 (23:30Z ngày 08/10) vẫn là 2026-10-09', () => {
    fakeNow('2026-10-08T23:30:00.000Z');
    renderDialog();

    expect(screen.getByLabelText('Hiệu lực từ')).toHaveValue('2026-10-09');
  });
});

describe('tạo tiết', () => {
  test('Thứ 2, Tiết 1, từ 2026-01-05, bỏ trống Đến ngày → effectiveTo là null; thành công thì đóng hộp thoại', async () => {
    const { onOpenChange } = renderDialog();

    await userEvent.selectOptions(screen.getByLabelText('Thứ'), 'Thứ 2');
    await userEvent.selectOptions(screen.getByLabelText('Tiết'), 'Tiết 1');
    setDate('Hiệu lực từ', '2026-01-05');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(createSlotMock).toHaveBeenCalledTimes(1);
    expect(createSlotMock).toHaveBeenCalledWith({
      positionId: 'p-toan',
      dayOfWeek: 2,
      period: 1,
      effectiveFrom: '2026-01-05',
      effectiveTo: null,
    });
    expect(updateSlotMock).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  test('có Đến ngày 2026-01-18 → effectiveTo là chuỗi đó; Thứ/Tiết gửi dạng SỐ, không phải chuỗi', async () => {
    renderDialog();

    await userEvent.selectOptions(screen.getByLabelText('Thứ'), 'Thứ 5');
    await userEvent.selectOptions(screen.getByLabelText('Tiết'), 'Tiết 10');
    setDate('Hiệu lực từ', '2026-01-05');
    setDate('Đến ngày', '2026-01-18');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(createSlotMock).toHaveBeenCalledWith({
      positionId: 'p-toan',
      dayOfWeek: 5,
      period: 10,
      effectiveFrom: '2026-01-05',
      effectiveTo: '2026-01-18',
    });
  });

  test('gửi tiết cho đúng positionId của prop', async () => {
    renderDialog({ positionId: 'p-van' });

    setDate('Hiệu lực từ', '2026-01-05');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(createSlotMock).toHaveBeenCalledWith(expect.objectContaining({ positionId: 'p-van' }));
  });

  test('KHÔNG tiền kiểm quan hệ ngày: Đến ngày trước Hiệu lực từ vẫn gửi lên, backend là nơi quyết định', async () => {
    renderDialog();

    setDate('Hiệu lực từ', '2026-02-01');
    setDate('Đến ngày', '2026-01-01');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(createSlotMock).toHaveBeenCalledWith(
      expect.objectContaining({ effectiveFrom: '2026-02-01', effectiveTo: '2026-01-01' }),
    );
  });

  test('Hiệu lực từ là bắt buộc: để trống thì không gọi API', async () => {
    renderDialog();

    setDate('Hiệu lực từ', '');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(createSlotMock).not.toHaveBeenCalled();
  });

  test('Huỷ đóng hộp thoại và không gọi API', async () => {
    const { onOpenChange } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(createSlotMock).not.toHaveBeenCalled();
  });
});

describe('sửa tiết', () => {
  test('điền sẵn từ ISO của backend (cuối ngày UTC không nhảy sang ngày sau); xóa trắng Đến ngày → effectiveTo null', async () => {
    renderDialog({
      slot: makeSlot({
        _id: 's9',
        dayOfWeek: 5,
        period: 3,
        effectiveFrom: '2026-01-05T23:30:00.000Z',
        effectiveTo: '2026-02-01T23:30:00.000Z',
      }),
    });

    expect(screen.getByLabelText('Thứ')).toHaveDisplayValue('Thứ 5');
    expect(screen.getByLabelText('Tiết')).toHaveDisplayValue('Tiết 3');
    expect(screen.getByLabelText('Hiệu lực từ')).toHaveValue('2026-01-05');
    expect(screen.getByLabelText('Đến ngày')).toHaveValue('2026-02-01');

    setDate('Đến ngày', '');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(updateSlotMock).toHaveBeenCalledTimes(1);
    expect(updateSlotMock).toHaveBeenCalledWith({
      positionId: 'p-toan',
      slotId: 's9',
      dayOfWeek: 5,
      period: 3,
      effectiveFrom: '2026-01-05',
      effectiveTo: null,
    });
    expect(createSlotMock).not.toHaveBeenCalled();
  });

  test('slot cũ chưa có effectiveTo (null): ô Đến ngày trống, lưu giữ nguyên null', async () => {
    renderDialog({ slot: makeSlot({ _id: 's1', effectiveTo: null }) });

    expect(screen.getByLabelText('Đến ngày')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(updateSlotMock).toHaveBeenCalledWith(expect.objectContaining({ slotId: 's1', effectiveTo: null }));
  });

  test('đổi sang tiết khác khi hộp thoại đang mở: nạp lại giá trị và gửi slotId mới, không phải slotId cũ', async () => {
    const store = makeStore();
    const onOpenChange = jest.fn();
    const slotA = makeSlot({ _id: 'slot-a', dayOfWeek: 2, period: 1, effectiveFrom: '2026-01-05T00:00:00.000Z' });
    const slotB = makeSlot({ _id: 'slot-b', dayOfWeek: 6, period: 4, effectiveFrom: '2026-03-02T00:00:00.000Z' });

    const { rerender } = render(
      <Provider store={store}>
        <SlotFormDialog open onOpenChange={onOpenChange} positionId="p-toan" slot={slotA} />
      </Provider>,
    );
    expect(screen.getByLabelText('Hiệu lực từ')).toHaveValue('2026-01-05');

    rerender(
      <Provider store={store}>
        <SlotFormDialog open onOpenChange={onOpenChange} positionId="p-toan" slot={slotB} />
      </Provider>,
    );
    expect(screen.getByLabelText('Thứ')).toHaveDisplayValue('Thứ 6');
    expect(screen.getByLabelText('Hiệu lực từ')).toHaveValue('2026-03-02');

    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(updateSlotMock).toHaveBeenCalledWith(
      expect.objectContaining({ slotId: 'slot-b', dayOfWeek: 6, period: 4, effectiveFrom: '2026-03-02' }),
    );
  });

  test('đóng rồi mở lại để THÊM sau khi vừa sửa: form về giá trị mặc định, không giữ dữ liệu lần sửa trước', () => {
    const store = makeStore();
    const onOpenChange = jest.fn();
    const slot = makeSlot({ dayOfWeek: 6, period: 4, effectiveFrom: '2026-03-02T00:00:00.000Z', effectiveTo: '2026-04-05T00:00:00.000Z' });

    const { rerender } = render(
      <Provider store={store}>
        <SlotFormDialog open onOpenChange={onOpenChange} positionId="p-toan" slot={slot} />
      </Provider>,
    );
    rerender(
      <Provider store={store}>
        <SlotFormDialog open={false} onOpenChange={onOpenChange} positionId="p-toan" slot={slot} />
      </Provider>,
    );
    rerender(
      <Provider store={store}>
        <SlotFormDialog open onOpenChange={onOpenChange} positionId="p-toan" />
      </Provider>,
    );

    expect(screen.getByRole('dialog', { name: 'Thêm tiết' })).toBeInTheDocument();
    expect(screen.getByLabelText('Thứ')).toHaveDisplayValue('Thứ 2');
    expect(screen.getByLabelText('Tiết')).toHaveDisplayValue('Tiết 1');
    expect(screen.getByLabelText('Đến ngày')).toHaveValue('');
  });
});

describe('lỗi từ backend', () => {
  test.each([
    [409, 'Tiết này đã có trong thời khóa biểu của môn trong khoảng thời gian trùng'],
    [409, 'Bạn đã có tiết khác vào thời điểm này'],
    [400, 'Ngày kết thúc hiệu lực không được trước ngày bắt đầu hiệu lực'],
    [400, 'Dữ liệu gửi lên không hợp lệ: Ngày kết thúc hiệu lực không được trước ngày bắt đầu hiệu lực'],
    [400, 'Chỉ vị trí giáo viên bộ môn mới có thời khóa biểu và PPCT'],
  ])('%i "%s" hiện nguyên văn, hộp thoại KHÔNG đóng và nút Lưu bấm lại được', async (status, message) => {
    createSlotMock.mockReturnValue(rejectWith(status, message));
    const { onOpenChange } = renderDialog();

    setDate('Hiệu lực từ', '2026-01-05');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeEnabled();
  });

  test('sửa tiết bị từ chối cũng hiện nguyên văn và giữ hộp thoại', async () => {
    updateSlotMock.mockReturnValue(rejectWith(404, 'Không tìm thấy tiết trong thời khóa biểu'));
    const { onOpenChange } = renderDialog({ slot: makeSlot() });

    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Không tìm thấy tiết trong thời khóa biểu');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  test('403 của guard (tiếng Anh) hiện câu tiếng Việt cố định; lỗi mạng hiện câu dự phòng', async () => {
    createSlotMock.mockReturnValueOnce(rejectWith(403, 'Forbidden resource'));
    createSlotMock.mockReturnValueOnce({
      unwrap: () => Promise.reject({ status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' }),
    });
    renderDialog();

    setDate('Hiệu lực từ', '2026-01-05');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn không có quyền thực hiện thao tác này');

    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Lưu tiết thất bại, vui lòng thử lại'),
    );
  });

  test('sau lỗi, sửa lại và lưu thành công thì dòng lỗi biến mất và hộp thoại đóng', async () => {
    createSlotMock.mockReturnValueOnce(rejectWith(409, 'Bạn đã có tiết khác vào thời điểm này'));
    const { onOpenChange } = renderDialog();

    setDate('Hiệu lực từ', '2026-01-05');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await screen.findByRole('alert');

    await userEvent.selectOptions(screen.getByLabelText('Tiết'), 'Tiết 2');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('chặn gửi hai lần khi backend đang tính lại sổ báo giảng', () => {
  test('isLoading: nút Lưu thành "Đang lưu..." và bị khóa', () => {
    useCreateImpl = () => [createSlotMock, { isLoading: true }];
    renderDialog();

    expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đang lưu...' })).toBeDisabled();
  });

  test('chế độ sửa cũng khóa nút khi mutation sửa đang chạy', () => {
    useUpdateImpl = () => [updateSlotMock, { isLoading: true }];
    renderDialog({ slot: makeSlot() });

    expect(screen.getByRole('button', { name: 'Đang lưu...' })).toBeDisabled();
  });

  test('hook và store thật: bấm đúp hoặc Enter lúc request còn treo chỉ gửi ĐÚNG 1 request POST', async () => {
    useCreateImpl = actualTimetableApi.useCreateTimetableSlotMutation;
    global.fetch = jest.fn(() => new Promise(() => {}));
    renderDialog();

    setDate('Hiệu lực từ', '2026-01-05');
    await userEvent.dblClick(screen.getByRole('button', { name: 'Lưu' }));
    await userEvent.type(screen.getByLabelText('Hiệu lực từ'), '{Enter}');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const request = global.fetch.mock.calls[0][0];
    expect(request.method).toBe('POST');
    expect(new URL(request.url).pathname).toBe('/positions/p-toan/timetable-slots');
    expect(screen.getByRole('button', { name: 'Đang lưu...' })).toBeDisabled();
  });
});

// Radix chỉ gắn listener "bấm ra ngoài" sau 1 tick (setTimeout 0), và lớp phủ là phần tử anh em đứng ngay trước nội dung.
async function clickOverlay() {
  await new Promise((resolve) => setTimeout(resolve, 10));
  await userEvent.click(screen.getByRole('dialog').previousElementSibling);
}

// Ghi tiết làm backend tính lại sổ báo giảng (tới vài giây): đóng giữa chừng thì lỗi 409/400 trả về sau đó không còn chỗ hiện.
describe('không đóng được khi đang lưu', () => {
  test('đang lưu: Esc và bấm ra ngoài không đóng, nút Huỷ bị khóa', async () => {
    useCreateImpl = () => [createSlotMock, { isLoading: true }];
    const { onOpenChange } = renderDialog();

    await userEvent.keyboard('{Escape}');
    await clickOverlay();

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeDisabled();
  });

  test('chế độ sửa đang lưu cũng không đóng được bằng Esc', async () => {
    useUpdateImpl = () => [updateSlotMock, { isLoading: true }];
    const { onOpenChange } = renderDialog({ slot: makeSlot() });

    await userEvent.keyboard('{Escape}');

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeDisabled();
  });

  test('đang rảnh: Esc và bấm ra ngoài đóng được (đối chứng)', async () => {
    const { onOpenChange } = renderDialog();

    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);

    onOpenChange.mockClear();
    await clickOverlay();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test('hook và store thật: bấm Esc lúc request còn treo không đóng, lỗi 409 trả về sau đó vẫn hiện trong hộp thoại, rồi mới đóng được', async () => {
    useCreateImpl = actualTimetableApi.useCreateTimetableSlotMutation;
    let respondLater;
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          respondLater = () => {
            const text = JSON.stringify({ statusCode: 409, message: 'Bạn đã có tiết khác vào thời điểm này' });
            resolve({ status: 409, text: () => Promise.resolve(text), clone: () => ({ text: () => Promise.resolve(text) }) });
          };
        }),
    );
    const { onOpenChange } = renderDialog();

    setDate('Hiệu lực từ', '2026-01-05');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByRole('button', { name: 'Đang lưu...' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();

    await act(async () => {
      respondLater();
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn đã có tiết khác vào thời điểm này');
    expect(await screen.findByRole('button', { name: 'Lưu' })).toBeEnabled();

    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
