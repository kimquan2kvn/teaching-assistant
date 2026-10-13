import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeHoliday } from '@/lib/test-fixtures/phase3';
import { HolidayFormDialog } from './holiday-form-dialog';

const createHolidayMock = jest.fn();
const updateHolidayMock = jest.fn();
let createIsLoading = false;
let updateIsLoading = false;

jest.mock('@/lib/store/school-calendar-api', () => ({
  ...jest.requireActual('@/lib/store/school-calendar-api'),
  useCreateHolidayMutation: () => [createHolidayMock, { isLoading: createIsLoading }],
  useUpdateHolidayMutation: () => [updateHolidayMock, { isLoading: updateIsLoading }],
}));

const NOTE = 'Lưu ngày nghỉ sẽ tự tính lại sổ báo giảng của tất cả các môn (có thể mất vài giây)';
const END_BEFORE_START = 'Ngày kết thúc không được trước ngày bắt đầu';

function resolved(value) {
  return { unwrap: () => Promise.resolve(value) };
}

function rejected(error) {
  return { unwrap: () => Promise.reject(error) };
}

beforeEach(() => {
  createHolidayMock.mockReset();
  updateHolidayMock.mockReset();
  createHolidayMock.mockReturnValue(resolved(makeHoliday()));
  updateHolidayMock.mockReturnValue(resolved(makeHoliday()));
  createIsLoading = false;
  updateIsLoading = false;
});

function renderDialog(props = {}) {
  const onOpenChange = jest.fn();
  const utils = render(<HolidayFormDialog open onOpenChange={onOpenChange} schoolYearId="y1" {...props} />);
  return { onOpenChange, ...utils };
}

async function fillForm({ name, startDate, endDate }) {
  await userEvent.type(screen.getByLabelText('Tên'), name);
  await userEvent.type(screen.getByLabelText('Từ ngày'), startDate);
  await userEvent.type(screen.getByLabelText('Đến ngày'), endDate);
}

describe('chế độ thêm', () => {
  test('hiện tiêu đề "Thêm ngày nghỉ", form trống, loại mặc định "Nghỉ lễ" và dòng ghi chú tự tính lại sổ báo giảng', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Thêm ngày nghỉ' });
    expect(screen.getByLabelText('Tên')).toHaveValue('');
    expect(screen.getByLabelText('Loại')).toHaveValue('LE');
    expect(screen.getByLabelText('Từ ngày')).toHaveValue('');
    expect(screen.getByLabelText('Đến ngày')).toHaveValue('');
    expect(screen.getByText(NOTE)).toBeInTheDocument();
    expect(dialog).toHaveAccessibleDescription(NOTE);
  });

  test('ô Loại có đúng 3 lựa chọn LE / DOT_XUAT / KHAC với nhãn tiếng Việt', () => {
    renderDialog();

    const options = within(screen.getByLabelText('Loại')).getAllByRole('option');
    expect(options.map((option) => [option.value, option.textContent])).toEqual([
      ['LE', 'Nghỉ lễ'],
      ['DOT_XUAT', 'Nghỉ đột xuất'],
      ['KHAC', 'Khác'],
    ]);
  });

  test('ô ngày dùng input date gốc và KHÔNG đặt min/max: quan hệ ngày kết thúc/bắt đầu do backend quyết định', () => {
    renderDialog();

    for (const label of ['Từ ngày', 'Đến ngày']) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute('type', 'date');
      expect(input).not.toHaveAttribute('min');
      expect(input).not.toHaveAttribute('max');
    }
  });

  test('nhập đủ rồi Lưu: createHoliday được gọi đúng 1 lần với đủ 5 trường (kể cả schoolYearId), không đụng updateHoliday, đóng dialog', async () => {
    const { onOpenChange } = renderDialog();

    await fillForm({ name: 'Nghỉ lễ Quốc khánh', startDate: '2026-09-02', endDate: '2026-09-02' });
    await userEvent.selectOptions(screen.getByLabelText('Loại'), 'Nghỉ lễ');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(createHolidayMock).toHaveBeenCalledTimes(1);
    expect(createHolidayMock).toHaveBeenCalledWith({
      schoolYearId: 'y1',
      name: 'Nghỉ lễ Quốc khánh',
      type: 'LE',
      startDate: '2026-09-02',
      endDate: '2026-09-02',
    });
    expect(updateHolidayMock).not.toHaveBeenCalled();
  });

  test('chọn "Nghỉ đột xuất" gửi type DOT_XUAT', async () => {
    renderDialog();

    await fillForm({ name: 'Nghỉ do bão số 3', startDate: '2026-09-07', endDate: '2026-09-09' });
    await userEvent.selectOptions(screen.getByLabelText('Loại'), 'Nghỉ đột xuất');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(createHolidayMock).toHaveBeenCalledTimes(1));
    expect(createHolidayMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DOT_XUAT', startDate: '2026-09-07', endDate: '2026-09-09' }),
    );
  });

  test('thiếu tên hoặc ngày: trình duyệt chặn gửi (required), không gọi API và không đóng dialog', async () => {
    const { onOpenChange } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await userEvent.type(screen.getByLabelText('Tên'), 'Nghỉ lễ');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(createHolidayMock).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  test('tên giới hạn 200 ký tự đúng ràng buộc của backend (tránh câu lỗi zod tiếng Anh)', () => {
    renderDialog();

    expect(screen.getByLabelText('Tên')).toHaveAttribute('maxlength', '200');
  });

  test('Huỷ đóng dialog mà không gọi API', async () => {
    const { onOpenChange } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(createHolidayMock).not.toHaveBeenCalled();
    expect(updateHolidayMock).not.toHaveBeenCalled();
  });
});

describe('chế độ sửa', () => {
  // Bản ghi thô của backend còn có createdAt/updatedAt/__v: không được lọt vào body gửi đi.
  const holiday = makeHoliday({
    _id: 'h7',
    name: 'Nghỉ Tết Nguyên đán',
    type: 'KHAC',
    startDate: '2026-02-14T00:00:00.000Z',
    endDate: '2026-02-22T00:00:00.000Z',
    createdAt: '2026-01-02T03:04:05.000Z',
    updatedAt: '2026-01-02T03:04:05.000Z',
    __v: 0,
  });

  test('điền sẵn từ bản ghi: ngày ISO của backend thành yyyy-mm-dd, tiêu đề "Sửa ngày nghỉ"', () => {
    renderDialog({ holiday });

    expect(screen.getByRole('dialog', { name: 'Sửa ngày nghỉ' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tên')).toHaveValue('Nghỉ Tết Nguyên đán');
    expect(screen.getByLabelText('Loại')).toHaveValue('KHAC');
    expect(screen.getByLabelText('Từ ngày')).toHaveValue('2026-02-14');
    expect(screen.getByLabelText('Đến ngày')).toHaveValue('2026-02-22');
  });

  test('ngày mốc cuối ngày UTC (23:30Z) vẫn điền đúng ngày UTC, không nhảy sang ngày sau theo giờ VN (UTC+7)', () => {
    renderDialog({
      holiday: makeHoliday({ startDate: '2026-01-08T23:30:00.000Z', endDate: '2026-01-09T23:30:00.000Z' }),
    });

    expect(screen.getByLabelText('Từ ngày')).toHaveValue('2026-01-08');
    expect(screen.getByLabelText('Đến ngày')).toHaveValue('2026-01-09');
  });

  test('sửa tên rồi Lưu: updateHoliday({ id, schoolYearId, name, type, startDate, endDate }), không đụng createHoliday, đóng dialog', async () => {
    const { onOpenChange } = renderDialog({ holiday });

    await userEvent.clear(screen.getByLabelText('Tên'));
    await userEvent.type(screen.getByLabelText('Tên'), 'Nghỉ Tết Bính Ngọ');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(updateHolidayMock).toHaveBeenCalledTimes(1);
    expect(updateHolidayMock).toHaveBeenCalledWith({
      id: 'h7',
      schoolYearId: 'y1',
      name: 'Nghỉ Tết Bính Ngọ',
      type: 'KHAC',
      startDate: '2026-02-14',
      endDate: '2026-02-22',
    });
    expect(createHolidayMock).not.toHaveBeenCalled();
  });

  test('mở lần lượt cho 2 ngày nghỉ khác nhau (đóng rồi mở): form đổi theo dòng đang mở và Lưu gửi đúng id của dòng đó', async () => {
    const holidayA = makeHoliday({ _id: 'hA', name: 'Nghỉ A', type: 'LE' });
    const holidayB = makeHoliday({
      _id: 'hB',
      name: 'Nghỉ B',
      type: 'DOT_XUAT',
      startDate: '2026-02-02T00:00:00.000Z',
      endDate: '2026-02-03T00:00:00.000Z',
    });
    const onOpenChange = jest.fn();
    const { rerender } = render(
      <HolidayFormDialog open holiday={holidayA} schoolYearId="y1" onOpenChange={onOpenChange} />,
    );
    expect(screen.getByLabelText('Tên')).toHaveValue('Nghỉ A');

    rerender(<HolidayFormDialog open={false} holiday={holidayA} schoolYearId="y1" onOpenChange={onOpenChange} />);
    rerender(<HolidayFormDialog open holiday={holidayB} schoolYearId="y1" onOpenChange={onOpenChange} />);

    expect(screen.getByLabelText('Tên')).toHaveValue('Nghỉ B');
    expect(screen.getByLabelText('Loại')).toHaveValue('DOT_XUAT');
    expect(screen.getByLabelText('Từ ngày')).toHaveValue('2026-02-02');
    expect(screen.getByLabelText('Đến ngày')).toHaveValue('2026-02-03');

    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(updateHolidayMock).toHaveBeenCalledTimes(1));
    expect(updateHolidayMock).toHaveBeenCalledWith({
      id: 'hB',
      schoolYearId: 'y1',
      name: 'Nghỉ B',
      type: 'DOT_XUAT',
      startDate: '2026-02-02',
      endDate: '2026-02-03',
    });
  });

  test('đổi sang ngày nghỉ khác khi dialog VẪN mở: form đổi theo, không giữ giá trị của dòng trước', async () => {
    const holidayA = makeHoliday({ _id: 'hA', name: 'Nghỉ A' });
    const holidayB = makeHoliday({ _id: 'hB', name: 'Nghỉ B' });
    const { rerender } = render(
      <HolidayFormDialog open holiday={holidayA} schoolYearId="y1" onOpenChange={jest.fn()} />,
    );
    await userEvent.type(screen.getByLabelText('Tên'), ' đã gõ dở');

    rerender(<HolidayFormDialog open holiday={holidayB} schoolYearId="y1" onOpenChange={jest.fn()} />);

    expect(screen.getByLabelText('Tên')).toHaveValue('Nghỉ B');
  });

  test('chuyển từ sửa sang thêm (holiday bỏ đi): form về trống, nút Lưu gọi createHoliday chứ không phải updateHoliday', async () => {
    const { rerender } = render(
      <HolidayFormDialog open holiday={holiday} schoolYearId="y1" onOpenChange={jest.fn()} />,
    );

    rerender(<HolidayFormDialog open schoolYearId="y1" onOpenChange={jest.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Thêm ngày nghỉ' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tên')).toHaveValue('');
    expect(screen.getByLabelText('Từ ngày')).toHaveValue('');
    await fillForm({ name: 'Nghỉ mới', startDate: '2026-05-01', endDate: '2026-05-01' });
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(createHolidayMock).toHaveBeenCalledTimes(1));
    expect(updateHolidayMock).not.toHaveBeenCalled();
  });
});

describe('mở lại dialog', () => {
  test('đóng rồi mở lại ở chế độ thêm: không giữ chữ đã gõ và thông báo lỗi của lần mở trước', async () => {
    createHolidayMock.mockReturnValue(rejected({ status: 400, data: { message: END_BEFORE_START } }));
    const onOpenChange = jest.fn();
    const { rerender } = render(<HolidayFormDialog open schoolYearId="y1" onOpenChange={onOpenChange} />);
    await fillForm({ name: 'Nghỉ dở dang', startDate: '2026-09-10', endDate: '2026-09-02' });
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    rerender(<HolidayFormDialog open={false} schoolYearId="y1" onOpenChange={onOpenChange} />);
    rerender(<HolidayFormDialog open schoolYearId="y1" onOpenChange={onOpenChange} />);

    expect(screen.getByLabelText('Tên')).toHaveValue('');
    expect(screen.getByLabelText('Từ ngày')).toHaveValue('');
    expect(screen.getByLabelText('Đến ngày')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('lỗi từ backend', () => {
  test('400 ngày kết thúc trước ngày bắt đầu của POST (có tiền tố zod): hiện nguyên văn, dialog không đóng, dữ liệu đã nhập còn nguyên', async () => {
    const message = `Dữ liệu gửi lên không hợp lệ: ${END_BEFORE_START}`;
    createHolidayMock.mockReturnValue(rejected({ status: 400, data: { message } }));
    const { onOpenChange } = renderDialog();

    await fillForm({ name: 'Nghỉ do bão', startDate: '2026-09-10', endDate: '2026-09-02' });
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(END_BEFORE_START);
    expect(alert).toHaveTextContent(message);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByLabelText('Tên')).toHaveValue('Nghỉ do bão');
    expect(screen.getByLabelText('Từ ngày')).toHaveValue('2026-09-10');
    expect(screen.getByLabelText('Đến ngày')).toHaveValue('2026-09-02');
  });

  test('400 của PATCH một ngày (câu trần, không tiền tố): cũng hiện nguyên văn', async () => {
    updateHolidayMock.mockReturnValue(rejected({ status: 400, data: { message: END_BEFORE_START } }));
    const { onOpenChange } = renderDialog({ holiday: makeHoliday() });

    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(END_BEFORE_START);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  test('404 khi sửa ngày nghỉ đã bị người khác xóa: hiện nguyên văn "Không tìm thấy ngày nghỉ"', async () => {
    updateHolidayMock.mockReturnValue(rejected({ status: 404, data: { message: 'Không tìm thấy ngày nghỉ' } }));
    renderDialog({ holiday: makeHoliday() });

    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Không tìm thấy ngày nghỉ');
  });

  test('403 của guard (Forbidden resource, tiếng Anh) hiện câu cố định tiếng Việt', async () => {
    createHolidayMock.mockReturnValue(rejected({ status: 403, data: { message: 'Forbidden resource' } }));
    renderDialog();

    await fillForm({ name: 'Nghỉ lễ', startDate: '2026-09-02', endDate: '2026-09-02' });
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Bạn không có quyền thực hiện thao tác này');
  });

  test('lỗi mạng không có message: hiện câu mặc định, không để trống và không hiện "undefined"', async () => {
    createHolidayMock.mockReturnValue(rejected({ status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' }));
    renderDialog();

    await fillForm({ name: 'Nghỉ lễ', startDate: '2026-09-02', endDate: '2026-09-02' });
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Lưu ngày nghỉ thất bại, vui lòng thử lại');
  });

  test('sửa lại rồi Lưu lần nữa: thông báo lỗi cũ biến mất và dialog đóng khi thành công', async () => {
    createHolidayMock
      .mockReturnValueOnce(rejected({ status: 400, data: { message: END_BEFORE_START } }))
      .mockReturnValue(resolved(makeHoliday()));
    const { onOpenChange } = renderDialog();

    await fillForm({ name: 'Nghỉ do bão', startDate: '2026-09-10', endDate: '2026-09-02' });
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Đến ngày'));
    await userEvent.type(screen.getByLabelText('Đến ngày'), '2026-09-12');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(createHolidayMock).toHaveBeenCalledTimes(2);
    expect(createHolidayMock).toHaveBeenLastCalledWith(expect.objectContaining({ endDate: '2026-09-12' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// Ghi ngày nghỉ làm backend tính lại sổ báo giảng cả trường (tới ~5 giây): bấm đúp không được gửi 2 lần và
// dialog không được đóng giữa chừng (lỗi 400/409 trả về sau vài giây còn chỗ để hiện).
describe('đang lưu', () => {
  test('thêm đang chạy: nút Lưu disabled với chữ "Đang lưu...", Huỷ disabled, bấm không gọi thêm mutation', async () => {
    createIsLoading = true;
    renderDialog();
    await fillForm({ name: 'Nghỉ lễ', startDate: '2026-09-02', endDate: '2026-09-02' });

    const savingButton = screen.getByRole('button', { name: 'Đang lưu...' });
    expect(savingButton).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeDisabled();

    await userEvent.click(savingButton);
    expect(createHolidayMock).not.toHaveBeenCalled();
  });

  test('sửa đang chạy: cùng hành vi (nút Lưu disabled, không gọi updateHoliday)', async () => {
    updateIsLoading = true;
    renderDialog({ holiday: makeHoliday() });

    const savingButton = screen.getByRole('button', { name: 'Đang lưu...' });
    expect(savingButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeDisabled();

    await userEvent.click(savingButton);
    expect(updateHolidayMock).not.toHaveBeenCalled();
  });

  test('form bị gửi bằng đường khác (Enter, requestSubmit) lúc đang lưu cũng không gọi mutation lần nữa', () => {
    createIsLoading = true;
    renderDialog();

    // fireEvent.submit bỏ qua cả nút disabled lẫn kiểm tra required của trình duyệt.
    fireEvent.submit(screen.getByRole('dialog').querySelector('form'));

    expect(createHolidayMock).not.toHaveBeenCalled();
  });

  test('đang lưu: Esc không đóng dialog', async () => {
    updateIsLoading = true;
    const { onOpenChange } = renderDialog({ holiday: makeHoliday() });

    await userEvent.keyboard('{Escape}');

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('đang rảnh: Esc đóng được dialog (đối chứng của ca "đang lưu" ở trên)', async () => {
    const { onOpenChange } = renderDialog({ holiday: makeHoliday() });

    await userEvent.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
