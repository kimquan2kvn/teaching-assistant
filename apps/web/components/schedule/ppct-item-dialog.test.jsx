import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makePpctItem } from '@/lib/test-fixtures/phase3';
import { PpctItemDialog } from './ppct-item-dialog';

const createPpctItemMock = jest.fn();
const updatePpctItemMock = jest.fn();
jest.mock('@/lib/store/ppct-api', () => ({
  ...jest.requireActual('@/lib/store/ppct-api'),
  useCreatePpctItemMutation: () => [createPpctItemMock, { isLoading: false }],
  useUpdatePpctItemMutation: () => [updatePpctItemMock, { isLoading: false }],
}));

const resolved = () => ({ unwrap: () => Promise.resolve({}) });
const rejected = (error) => ({ unwrap: () => Promise.reject(error) });

beforeEach(() => {
  createPpctItemMock.mockReset().mockReturnValue(resolved());
  updatePpctItemMock.mockReset().mockReturnValue(resolved());
});

function renderDialog(props) {
  const onOpenChange = jest.fn();
  const utils = render(<PpctItemDialog open onOpenChange={onOpenChange} positionId="p-toan" {...props} />);
  return { ...utils, onOpenChange };
}

// Chỉ gõ vào ô có giá trị; bỏ trống tham số = để ô nguyên (Số tiết giữ mặc định 1).
async function fillCreateForm({ week = '1', periodLabel = '1', title = 'Bài 1', requirement = '' } = {}) {
  if (week) await userEvent.type(screen.getByLabelText('Tuần'), week);
  if (periodLabel) await userEvent.type(screen.getByLabelText('Tiết thứ'), periodLabel);
  if (title) await userEvent.type(screen.getByLabelText('Bài học'), title);
  if (requirement) await userEvent.type(screen.getByLabelText('Yêu cầu cần đạt'), requirement);
}

async function replaceValue(label, text) {
  const field = screen.getByLabelText(label);
  await userEvent.clear(field);
  if (text) await userEvent.type(field, text);
}

describe('thêm mới', () => {
  test('có đủ 6 ô, Số tiết mặc định 1, Tiết thứ có gợi ý cách đánh số CK/TC/CĐ', () => {
    renderDialog();

    expect(screen.getByLabelText('Tuần')).toHaveDisplayValue('');
    expect(screen.getByLabelText('Tiết thứ')).toHaveDisplayValue('');
    expect(screen.getByLabelText('Tiết thứ')).toHaveAttribute('placeholder', '1, TC1, CĐ1');
    expect(screen.getByLabelText('Bài học')).toHaveDisplayValue('');
    expect(screen.getByLabelText('Số tiết')).toHaveDisplayValue('1');
    expect(screen.getByLabelText('Yêu cầu cần đạt')).toHaveDisplayValue('');
    expect(screen.getByLabelText('Ghi chú')).toHaveDisplayValue('');
  });

  test('(i) gửi đúng payload createPpctItem, KHÔNG có khóa note khi để trống Ghi chú, rồi đóng hộp thoại', async () => {
    const { onOpenChange } = renderDialog();

    await fillCreateForm({ requirement: 'Nắm được khái niệm' });
    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    expect(createPpctItemMock).toHaveBeenCalledTimes(1);
    expect(createPpctItemMock).toHaveBeenCalledWith({
      positionId: 'p-toan',
      week: 1,
      periodLabel: '1',
      title: 'Bài 1',
      periodCount: 1,
      requirement: 'Nắm được khái niệm',
    });
    expect(createPpctItemMock.mock.calls[0][0]).not.toHaveProperty('note');
    expect(updatePpctItemMock).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  test('Ghi chú có nội dung thì gửi note đã cắt khoảng trắng; nhãn TC/CĐ và số tiết do người dùng nhập được giữ nguyên', async () => {
    renderDialog({ positionId: 'p-van' });

    await fillCreateForm({ week: '12', periodLabel: 'CĐ1', title: 'Chuyên đề 1' });
    await replaceValue('Số tiết', '3');
    await userEvent.type(screen.getByLabelText('Ghi chú'), '  Dạy bù  ');
    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    expect(createPpctItemMock).toHaveBeenCalledWith({
      positionId: 'p-van',
      week: 12,
      periodLabel: 'CĐ1',
      title: 'Chuyên đề 1',
      periodCount: 3,
      requirement: '',
      note: 'Dạy bù',
    });
  });
});

describe('tiền kiểm trước khi gọi API', () => {
  test.each([
    ['Tuần = 0', { week: '0' }, 'Tuần phải là số nguyên từ 1 đến 60'],
    ['Tuần = 61', { week: '61' }, 'Tuần phải là số nguyên từ 1 đến 60'],
    ['Tuần để trống', { week: '' }, 'Tuần phải là số nguyên từ 1 đến 60'],
    ['Bài học để trống', { title: '' }, 'Bài học không được để trống'],
    ['Tiết thứ để trống', { periodLabel: '' }, 'Tiết thứ không được để trống'],
  ])('%s → hiện đúng thông báo và KHÔNG gọi API', async (_label, fields, message) => {
    renderDialog();

    await fillCreateForm(fields);
    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(createPpctItemMock).not.toHaveBeenCalled();
  });

  test.each([
    ['Số tiết = 11', '11'],
    ['Số tiết = 0', '0'],
    ['Số tiết bỏ trống', ''],
  ])('%s → hiện "Số tiết phải là số nguyên từ 1 đến 10" và KHÔNG gọi API', async (_label, periodCount) => {
    renderDialog();

    await fillCreateForm();
    await replaceValue('Số tiết', periodCount);
    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    expect(await screen.findByText('Số tiết phải là số nguyên từ 1 đến 10')).toBeInTheDocument();
    expect(createPpctItemMock).not.toHaveBeenCalled();
  });

  test('form trống bấm Thêm → liệt kê MỌI ô sai cùng lúc để người dùng sửa một lượt', async () => {
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    expect(await screen.findByText('Tuần phải là số nguyên từ 1 đến 60')).toBeInTheDocument();
    expect(screen.getByText('Tiết thứ không được để trống')).toBeInTheDocument();
    expect(screen.getByText('Bài học không được để trống')).toBeInTheDocument();
    expect(screen.queryByText(/Số tiết phải là/)).toBeNull();
    expect(createPpctItemMock).not.toHaveBeenCalled();
  });

  test('sửa đúng rồi gửi lại: thông báo cũ biến mất và API được gọi với giá trị mới', async () => {
    renderDialog();
    await fillCreateForm({ week: '0' });
    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(await screen.findByText('Tuần phải là số nguyên từ 1 đến 60')).toBeInTheDocument();

    await replaceValue('Tuần', '5');
    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    await waitFor(() => expect(createPpctItemMock).toHaveBeenCalledTimes(1));
    expect(createPpctItemMock.mock.calls[0][0].week).toBe(5);
    expect(screen.queryByText('Tuần phải là số nguyên từ 1 đến 60')).toBeNull();
  });

  test.each([
    ['Tiết thứ', 20],
    ['Bài học', 300],
    ['Yêu cầu cần đạt', 1000],
    ['Ghi chú', 500],
  ])('ô %s không cho nhập quá %i ký tự (giới hạn của backend)', async (label, limit) => {
    renderDialog();
    const field = screen.getByLabelText(label);

    await userEvent.click(field);
    await userEvent.paste('a'.repeat(limit + 10));

    expect(field.value).toHaveLength(limit);
  });
});

describe('sửa', () => {
  const ITEM = makePpctItem({
    _id: 'i2',
    order: 2,
    week: 3,
    periodLabel: 'TC1',
    title: 'Tự chọn 1',
    periodCount: 2,
    requirement: 'Vận dụng được',
    note: 'Ôn tập',
    createdAt: '2026-01-05T03:00:00.000Z',
    updatedAt: '2026-01-06T03:00:00.000Z',
    __v: 0,
  });

  test('điền sẵn đủ 6 ô từ mục đang sửa', () => {
    renderDialog({ item: ITEM });

    expect(screen.getByLabelText('Tuần')).toHaveDisplayValue('3');
    expect(screen.getByLabelText('Tiết thứ')).toHaveDisplayValue('TC1');
    expect(screen.getByLabelText('Bài học')).toHaveDisplayValue('Tự chọn 1');
    expect(screen.getByLabelText('Số tiết')).toHaveDisplayValue('2');
    expect(screen.getByLabelText('Yêu cầu cần đạt')).toHaveDisplayValue('Vận dụng được');
    expect(screen.getByLabelText('Ghi chú')).toHaveDisplayValue('Ôn tập');
  });

  test('(k) xóa trắng Ghi chú → updatePpctItem nhận note là chuỗi rỗng (backend mới xóa ghi chú đã lưu), kèm positionId và itemId', async () => {
    const { onOpenChange } = renderDialog({ item: ITEM });

    await userEvent.clear(screen.getByLabelText('Ghi chú'));
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(updatePpctItemMock).toHaveBeenCalledTimes(1);
    expect(updatePpctItemMock).toHaveBeenCalledWith({
      positionId: 'p-toan',
      itemId: 'i2',
      week: 3,
      periodLabel: 'TC1',
      title: 'Tự chọn 1',
      periodCount: 2,
      requirement: 'Vận dụng được',
      note: '',
    });
    expect(createPpctItemMock).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  test('không đụng vào Ghi chú → vẫn gửi lại đúng ghi chú cũ, không làm mất; chỉ ô đã sửa thay đổi', async () => {
    renderDialog({ item: ITEM });

    await replaceValue('Bài học', '  Tự chọn 1 (sửa)  ');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(updatePpctItemMock).toHaveBeenCalledWith({
      positionId: 'p-toan',
      itemId: 'i2',
      week: 3,
      periodLabel: 'TC1',
      title: 'Tự chọn 1 (sửa)',
      periodCount: 2,
      requirement: 'Vận dụng được',
      note: 'Ôn tập',
    });
  });

  test('mục chưa từng có ghi chú (không có khóa note) mở ra ô Ghi chú rỗng và lưu với note rỗng', async () => {
    const itemWithoutNote = makePpctItem({ _id: 'i3', title: 'Bài không ghi chú' });
    expect(itemWithoutNote).not.toHaveProperty('note');
    renderDialog({ item: itemWithoutNote });

    expect(screen.getByLabelText('Ghi chú')).toHaveDisplayValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(updatePpctItemMock.mock.calls[0][0].note).toBe('');
  });

  test('tiền kiểm cũng áp dụng khi sửa: Số tiết 11 → không gọi API', async () => {
    renderDialog({ item: ITEM });

    await replaceValue('Số tiết', '11');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(await screen.findByText('Số tiết phải là số nguyên từ 1 đến 10')).toBeInTheDocument();
    expect(updatePpctItemMock).not.toHaveBeenCalled();
  });

  // Lỗi dễ gặp với hộp thoại dùng chung thêm/sửa: mở cho mục A, đóng, mở cho mục B mà state cũ còn sót → gửi nhầm itemId của A.
  test('mở lần lượt cho 2 mục khác nhau: điền đúng dữ liệu và gửi đúng itemId của mục đang mở', async () => {
    const itemA = makePpctItem({ _id: 'item-a', title: 'Mục A', week: 1 });
    const itemB = makePpctItem({ _id: 'item-b', title: 'Mục B', week: 2 });
    const onOpenChange = jest.fn();
    const { rerender } = render(
      <PpctItemDialog open onOpenChange={onOpenChange} positionId="p-toan" item={itemA} />,
    );
    expect(screen.getByLabelText('Bài học')).toHaveDisplayValue('Mục A');
    await userEvent.type(screen.getByLabelText('Ghi chú'), 'nháp của A chưa lưu');

    rerender(<PpctItemDialog open={false} onOpenChange={onOpenChange} positionId="p-toan" item={itemA} />);
    rerender(<PpctItemDialog open onOpenChange={onOpenChange} positionId="p-toan" item={itemB} />);

    expect(screen.getByLabelText('Bài học')).toHaveDisplayValue('Mục B');
    expect(screen.getByLabelText('Ghi chú')).toHaveDisplayValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(updatePpctItemMock).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'item-b', week: 2, title: 'Mục B' }));
  });
});

describe('lỗi và trạng thái đang lưu', () => {
  test('(l) 409 trùng dữ liệu → hiện NGUYÊN VĂN, hộp thoại KHÔNG đóng, giữ nguyên dữ liệu đã nhập và cho thử lại', async () => {
    createPpctItemMock.mockReturnValue(
      rejected({ status: 409, data: { message: 'Dữ liệu đã tồn tại, không thể ghi trùng' } }),
    );
    const { onOpenChange } = renderDialog();

    await fillCreateForm();
    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    expect(await screen.findByText('Dữ liệu đã tồn tại, không thể ghi trùng')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Bài học')).toHaveDisplayValue('Bài 1');
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeEnabled();
  });

  test('lỗi khi sửa cũng hiện nguyên văn message của backend và không đóng', async () => {
    updatePpctItemMock.mockReturnValue(
      rejected({ status: 404, data: { message: 'Không tìm thấy mục PPCT' } }),
    );
    const { onOpenChange } = renderDialog({ item: makePpctItem() });

    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(await screen.findByText('Không tìm thấy mục PPCT')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  test('403 do guard trả tiếng Anh (Forbidden resource) → hiện câu tiếng Việt cố định', async () => {
    createPpctItemMock.mockReturnValue(rejected({ status: 403, data: { message: 'Forbidden resource' } }));
    renderDialog();

    await fillCreateForm();
    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    expect(await screen.findByText('Bạn không có quyền thực hiện thao tác này')).toBeInTheDocument();
    expect(screen.queryByText('Forbidden resource')).toBeNull();
  });

  test('lỗi mạng không có message → hiện câu dự phòng, không vỡ giao diện', async () => {
    createPpctItemMock.mockReturnValue(rejected({ status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' }));
    renderDialog();

    await fillCreateForm();
    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    expect(await screen.findByText('Lưu mục PPCT thất bại, vui lòng thử lại')).toBeInTheDocument();
  });

  test('(l) đang lưu: nút bị khóa nên bấm lần hai không gửi thêm yêu cầu (backend tính lại sổ báo giảng có thể mất vài giây)', async () => {
    let finishSaving;
    createPpctItemMock.mockReturnValue({
      unwrap: () =>
        new Promise((resolve) => {
          finishSaving = resolve;
        }),
    });
    const { onOpenChange } = renderDialog();
    await fillCreateForm();
    const submit = screen.getByRole('button', { name: 'Thêm' });

    await userEvent.click(submit);
    expect(submit).toBeDisabled();
    await userEvent.click(submit);
    expect(createPpctItemMock).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();

    await act(async () => {
      finishSaving({});
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  test('lưu thất bại xong thì nút được mở lại để thử lần nữa', async () => {
    createPpctItemMock
      .mockReturnValueOnce(rejected({ status: 500, data: { message: 'Đã có lỗi xảy ra, vui lòng thử lại sau' } }))
      .mockReturnValueOnce(resolved());
    const { onOpenChange } = renderDialog();
    await fillCreateForm();

    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(await screen.findByText('Đã có lỗi xảy ra, vui lòng thử lại sau')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(createPpctItemMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Đã có lỗi xảy ra, vui lòng thử lại sau')).toBeNull();
  });
});

// Backend nối mục mới vào cuối PPCT và không chống trùng: đóng hộp thoại giữa chừng làm mất lỗi trả về, người dùng
// mở lại gửi lần hai sẽ tạo mục trùng. Giống HolidayFormDialog: đang lưu thì không cho đóng.
describe('đang lưu: không cho đóng hộp thoại', () => {
  function pendingSave(mock) {
    const control = {};
    mock.mockReturnValue({
      unwrap: () =>
        new Promise((resolve, reject) => {
          control.resolve = resolve;
          control.reject = reject;
        }),
    });
    return control;
  }

  test('(M1) Esc lúc đang lưu không đóng; lưu xong mới đóng, đúng 1 lần và chỉ gửi 1 yêu cầu', async () => {
    const save = pendingSave(createPpctItemMock);
    const { onOpenChange } = renderDialog();
    await fillCreateForm();
    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    await userEvent.keyboard('{Escape}');

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => {
      save.resolve({});
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(createPpctItemMock).toHaveBeenCalledTimes(1);
  });

  test('(M1) nút Huỷ bị khóa lúc đang lưu và bấm vào không đóng hộp thoại', async () => {
    pendingSave(updatePpctItemMock);
    const { onOpenChange } = renderDialog({ item: makePpctItem() });
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    const cancel = screen.getByRole('button', { name: 'Huỷ' });
    expect(cancel).toBeDisabled();
    await userEvent.click(cancel);

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('(M1) bấm ra ngoài hộp thoại lúc đang lưu không đóng', async () => {
    pendingSave(createPpctItemMock);
    const { onOpenChange } = renderDialog();
    await fillCreateForm();
    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    // Radix chỉ nghe pointerdown ngoài hộp thoại sau một tick.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.pointerDown(document.body);

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('(M1) lưu lỗi sau khi người dùng đã bấm Esc: lỗi vẫn hiện trong hộp thoại, rồi Esc và Huỷ lại đóng được', async () => {
    const save = pendingSave(createPpctItemMock);
    const { onOpenChange } = renderDialog();
    await fillCreateForm();
    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    await userEvent.keyboard('{Escape}');

    await act(async () => {
      save.reject({ status: 409, data: { message: 'Dữ liệu đã tồn tại, không thể ghi trùng' } });
    });

    expect(await screen.findByText('Dữ liệu đã tồn tại, không thể ghi trùng')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeEnabled();
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test('đang rảnh: Esc và Huỷ đóng được hộp thoại (đối chứng của các ca đang lưu)', async () => {
    const { onOpenChange } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    onOpenChange.mockClear();
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

test('hộp thoại có lề ngang trên điện thoại (không sát mép màn hình)', () => {
  renderDialog();

  expect(screen.getByRole('dialog')).toHaveClass('w-[calc(100%-2rem)]');
});
