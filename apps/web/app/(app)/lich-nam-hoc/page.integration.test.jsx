import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { makeStore } from '@/lib/store/store';
import { setCredentials } from '@/lib/store/auth-slice';
import { makeHoliday, makeSchoolYear } from '@/lib/test-fixtures/phase3';
import LichNamHocPage from './page';

// Test với store thật + fetch giả: kiểm các hành vi mà mock hook không chứng minh được (số liệu năm cũ không
// "rò" sang năm mới, danh sách tự làm mới sau khi ghi, chống gửi đôi lúc backend đang tính lại).

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

function jsonResponse(status, body) {
  const text = JSON.stringify(body);
  return Promise.resolve({
    status,
    text: () => Promise.resolve(text),
    clone() {
      return { text: () => Promise.resolve(text) };
    },
  });
}

// Định tuyến theo "METHOD /đường-dẫn": sau 1 lần ghi nhiều query refetch cùng lúc nên thứ tự gọi fetch không cố định.
function mockFetchRoutes(routes) {
  global.fetch = jest.fn((request) => {
    const { pathname } = new URL(request.url);
    const route = routes[`${request.method} ${pathname}`];
    if (!route) return jsonResponse(404, { message: `Test chưa mock ${request.method} ${pathname}` });
    return route(request);
  });
}

function callsTo(method, pathname) {
  return global.fetch.mock.calls.filter(
    ([request]) => request.method === method && new URL(request.url).pathname === pathname,
  );
}

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

// Bản ghi thô của backend (Mongoose) còn có createdAt/updatedAt/__v.
function rawHoliday(overrides) {
  return makeHoliday({
    createdAt: '2026-01-02T03:04:05.000Z',
    updatedAt: '2026-01-02T03:04:05.000Z',
    __v: 0,
    ...overrides,
  });
}

// "Backend" tối thiểu giữ trạng thái trong bộ nhớ để GET sau khi ghi trả dữ liệu mới.
function makeBackend() {
  const state = {
    holidays: {
      y1: [
        rawHoliday({
          _id: 'h-gio-to',
          name: 'Giỗ Tổ Hùng Vương',
          type: 'LE',
          startDate: '2026-04-26T00:00:00.000Z',
          endDate: '2026-04-26T00:00:00.000Z',
        }),
      ],
      y0: [
        rawHoliday({
          _id: 'h-he',
          schoolYearId: 'y0',
          name: 'Nghỉ hè 2025',
          type: 'LE',
          startDate: '2025-05-26T00:00:00.000Z',
          endDate: '2025-05-26T00:00:00.000Z',
        }),
      ],
    },
    stats: {
      y1: { totalHolidayDays: 1, leHolidayDays: 1, dotXuatHolidayDays: 0, remainingTeachingDays: 120 },
      y0: { totalHolidayDays: 11, leHolidayDays: 7, dotXuatHolidayDays: 1, remainingTeachingDays: 0 },
    },
  };
  const routes = {
    'GET /school-years': () => jsonResponse(200, [YEAR_2025, YEAR_2024]),
    'GET /school-years/y1/holidays': () => jsonResponse(200, state.holidays.y1),
    'GET /school-years/y1/calendar-stats': () => jsonResponse(200, state.stats.y1),
    'GET /school-years/y0/holidays': () => jsonResponse(200, state.holidays.y0),
    'GET /school-years/y0/calendar-stats': () => jsonResponse(200, state.stats.y0),
  };
  return { state, routes };
}

function renderPage({ role = 'TEACHER' } = {}) {
  const store = makeStore();
  store.dispatch(setCredentials({ user: { id: 'u1', role }, accessToken: 'token' }));
  return render(
    <Provider store={store}>
      <LichNamHocPage />
    </Provider>,
  );
}

// Thống kê và danh sách là 2 request độc lập nên số liệu có thể về sau danh sách.
async function expectStat(label, value) {
  await waitFor(() => {
    expect(within(screen.getByRole('group', { name: label })).getByText(value)).toBeInTheDocument();
  });
}

async function openCreateDialog() {
  await userEvent.click(await screen.findByRole('button', { name: 'Thêm ngày nghỉ' }));
  return screen.findByRole('dialog', { name: 'Thêm ngày nghỉ' });
}

async function fillCreateForm(dialog, { name, startDate, endDate }) {
  await userEvent.type(within(dialog).getByLabelText('Tên'), name);
  await userEvent.type(within(dialog).getByLabelText('Từ ngày'), startDate);
  await userEvent.type(within(dialog).getByLabelText('Đến ngày'), endDate);
}

test('mở trang: tải năm học rồi ngày nghỉ + thống kê của ĐÚNG năm hiện hành (không gửi asOf), không tải năm khác', async () => {
  const { routes } = makeBackend();
  mockFetchRoutes(routes);

  renderPage();

  expect(await screen.findByText('Giỗ Tổ Hùng Vương')).toBeInTheDocument();
  await expectStat('Số ngày dạy còn lại', '120');
  expect(screen.getByLabelText('Năm học')).toHaveValue('y1');
  expect(callsTo('GET', '/school-years')).toHaveLength(1);
  expect(callsTo('GET', '/school-years/y1/holidays')).toHaveLength(1);
  const statsCalls = callsTo('GET', '/school-years/y1/calendar-stats');
  expect(statsCalls).toHaveLength(1);
  expect(new URL(statsCalls[0][0].url).search).toBe('');
  expect(callsTo('GET', '/school-years/y0/holidays')).toHaveLength(0);
  expect(callsTo('GET', '/school-years/y0/calendar-stats')).toHaveLength(0);
});

test('đổi năm học: số liệu và danh sách của năm cũ KHÔNG hiện lại trong lúc năm mới đang tải', async () => {
  const { state, routes } = makeBackend();
  const pendingHolidays = deferred();
  const pendingStats = deferred();
  mockFetchRoutes({
    ...routes,
    'GET /school-years/y0/holidays': () => pendingHolidays.promise,
    'GET /school-years/y0/calendar-stats': () => pendingStats.promise,
  });
  renderPage();
  expect(await screen.findByText('Giỗ Tổ Hùng Vương')).toBeInTheDocument();

  await userEvent.selectOptions(screen.getByLabelText('Năm học'), 'y0');

  await waitFor(() => expect(callsTo('GET', '/school-years/y0/holidays')).toHaveLength(1));
  expect(screen.queryByText('Giỗ Tổ Hùng Vương')).not.toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Tổng ngày nghỉ' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('status')).toHaveLength(2);

  await act(async () => {
    pendingHolidays.resolve(jsonResponse(200, state.holidays.y0));
    pendingStats.resolve(jsonResponse(200, state.stats.y0));
  });

  expect(await screen.findByText('Nghỉ hè 2025')).toBeInTheDocument();
  await expectStat('Tổng ngày nghỉ', '11');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('ADMIN thêm ngày nghỉ: POST đúng body, dialog đóng, danh sách và 4 thẻ tự làm mới theo dữ liệu mới của backend', async () => {
  const { state, routes } = makeBackend();
  mockFetchRoutes({
    ...routes,
    'POST /holidays': (request) => {
      const body = JSON.parse(request.body);
      const created = rawHoliday({
        _id: 'h-bao',
        name: body.name,
        type: body.type,
        startDate: `${body.startDate}T00:00:00.000Z`,
        endDate: `${body.endDate}T00:00:00.000Z`,
      });
      state.holidays.y1 = [...state.holidays.y1, created];
      state.stats.y1 = { totalHolidayDays: 3, leHolidayDays: 1, dotXuatHolidayDays: 2, remainingTeachingDays: 118 };
      return jsonResponse(201, created);
    },
  });
  renderPage({ role: 'ADMIN' });
  const dialog = await openCreateDialog();

  await fillCreateForm(dialog, { name: 'Nghỉ do bão số 3', startDate: '2026-09-07', endDate: '2026-09-08' });
  await userEvent.selectOptions(within(dialog).getByLabelText('Loại'), 'Nghỉ đột xuất');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));

  const newRowName = await screen.findByText('Nghỉ do bão số 3');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await expectStat('Tổng ngày nghỉ', '3');
  await expectStat('Nghỉ đột xuất', '2');
  await expectStat('Số ngày dạy còn lại', '118');
  const postCalls = callsTo('POST', '/holidays');
  expect(postCalls).toHaveLength(1);
  expect(JSON.parse(postCalls[0][0].body)).toEqual({
    schoolYearId: 'y1',
    name: 'Nghỉ do bão số 3',
    type: 'DOT_XUAT',
    startDate: '2026-09-07',
    endDate: '2026-09-08',
  });
  const cells = within(newRowName.closest('tr')).getAllByRole('cell');
  expect(cells.map((cell) => cell.textContent)).toEqual(
    expect.arrayContaining(['Nghỉ đột xuất', '07/09/2026', '08/09/2026']),
  );
});

// Backend tính lại sổ báo giảng cả trường trong cùng request (tới ~5 giây): đây là lúc người dùng hay bấm đúp.
test('bấm Lưu liên tiếp trong lúc backend đang tính lại: chỉ gửi 1 POST, Esc không đóng giữa chừng, xong mới đóng', async () => {
  const { routes } = makeBackend();
  const pendingPost = deferred();
  mockFetchRoutes({ ...routes, 'POST /holidays': () => pendingPost.promise });
  renderPage({ role: 'ADMIN' });
  const dialog = await openCreateDialog();
  await fillCreateForm(dialog, { name: 'Nghỉ lễ 30/4', startDate: '2026-04-30', endDate: '2026-04-30' });

  await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));
  const savingButton = await within(dialog).findByRole('button', { name: 'Đang lưu...' });
  await userEvent.click(savingButton);
  await userEvent.dblClick(savingButton);
  await userEvent.type(within(dialog).getByLabelText('Tên'), '{enter}{enter}');
  await userEvent.keyboard('{Escape}');

  expect(callsTo('POST', '/holidays')).toHaveLength(1);
  expect(savingButton).toBeDisabled();
  expect(screen.getByRole('dialog', { name: 'Thêm ngày nghỉ' })).toBeInTheDocument();

  await act(async () => {
    pendingPost.resolve(jsonResponse(201, makeHoliday({ _id: 'h-new', name: 'Nghỉ lễ 30/4' })));
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(callsTo('POST', '/holidays')).toHaveLength(1);
});

test('backend trả 400 (câu lỗi zod có tiền tố): hiện nguyên văn trong dialog, dialog không đóng, nút Lưu dùng lại được', async () => {
  const { routes } = makeBackend();
  mockFetchRoutes({
    ...routes,
    'POST /holidays': () =>
      jsonResponse(400, {
        statusCode: 400,
        message: 'Dữ liệu gửi lên không hợp lệ: Ngày kết thúc không được trước ngày bắt đầu',
        error: 'Bad Request',
      }),
  });
  renderPage({ role: 'ADMIN' });
  const dialog = await openCreateDialog();

  await fillCreateForm(dialog, { name: 'Nghỉ do bão', startDate: '2026-09-10', endDate: '2026-09-02' });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));

  const alert = await within(dialog).findByRole('alert');
  expect(alert.textContent).toBe('Dữ liệu gửi lên không hợp lệ: Ngày kết thúc không được trước ngày bắt đầu');
  expect(screen.getByRole('dialog', { name: 'Thêm ngày nghỉ' })).toBeInTheDocument();
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Lưu' })).toBeEnabled());
});

test('ADMIN sửa ngày nghỉ: PATCH /holidays/:id không rò id/schoolYearId, bảng hiện giá trị mới sau khi refetch', async () => {
  const { state, routes } = makeBackend();
  mockFetchRoutes({
    ...routes,
    'PATCH /holidays/h-gio-to': (request) => {
      const body = JSON.parse(request.body);
      state.holidays.y1 = [
        rawHoliday({
          _id: 'h-gio-to',
          name: body.name,
          type: body.type,
          startDate: `${body.startDate}T00:00:00.000Z`,
          endDate: `${body.endDate}T00:00:00.000Z`,
        }),
      ];
      return jsonResponse(200, state.holidays.y1[0]);
    },
  });
  renderPage({ role: 'ADMIN' });

  await userEvent.click(await screen.findByRole('button', { name: 'Sửa' }));
  const dialog = await screen.findByRole('dialog', { name: 'Sửa ngày nghỉ' });
  expect(within(dialog).getByLabelText('Từ ngày')).toHaveValue('2026-04-26');
  await userEvent.clear(within(dialog).getByLabelText('Tên'));
  await userEvent.type(within(dialog).getByLabelText('Tên'), 'Giỗ Tổ (nghỉ bù)');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));

  expect(await screen.findByText('Giỗ Tổ (nghỉ bù)')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const patchCalls = callsTo('PATCH', '/holidays/h-gio-to');
  expect(patchCalls).toHaveLength(1);
  expect(JSON.parse(patchCalls[0][0].body)).toEqual({
    name: 'Giỗ Tổ (nghỉ bù)',
    type: 'LE',
    startDate: '2026-04-26',
    endDate: '2026-04-26',
  });
});

test('ADMIN xóa ngày nghỉ: DELETE đúng id sau khi xác nhận; hàng biến mất và hiện lại câu "chưa có ngày nghỉ"', async () => {
  const { state, routes } = makeBackend();
  mockFetchRoutes({
    ...routes,
    'DELETE /holidays/h-gio-to': () => {
      state.holidays.y1 = [];
      state.stats.y1 = { totalHolidayDays: 0, leHolidayDays: 0, dotXuatHolidayDays: 0, remainingTeachingDays: 121 };
      return jsonResponse(200, { deleted: true });
    },
  });
  renderPage({ role: 'ADMIN' });

  await userEvent.click(await screen.findByRole('button', { name: 'Xóa' }));
  const dialog = await screen.findByRole('dialog', { name: 'Xóa ngày nghỉ?' });
  expect(callsTo('DELETE', '/holidays/h-gio-to')).toHaveLength(0);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Xóa ngày nghỉ' }));

  expect(await screen.findByText('Năm học này chưa có ngày nghỉ nào')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(callsTo('DELETE', '/holidays/h-gio-to')).toHaveLength(1);
  await expectStat('Tổng ngày nghỉ', '0');
  await expectStat('Số ngày dạy còn lại', '121');
});

test('xóa: bấm xác nhận liên tiếp trong lúc backend đang tính lại chỉ gửi 1 DELETE; nút thành "Đang xóa...", Esc không đóng giữa chừng', async () => {
  const { state, routes } = makeBackend();
  const pendingDelete = deferred();
  mockFetchRoutes({ ...routes, 'DELETE /holidays/h-gio-to': () => pendingDelete.promise });
  renderPage({ role: 'ADMIN' });

  await userEvent.click(await screen.findByRole('button', { name: 'Xóa' }));
  const dialog = await screen.findByRole('dialog', { name: 'Xóa ngày nghỉ?' });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Xóa ngày nghỉ' }));
  const busyButton = await within(dialog).findByRole('button', { name: 'Đang xóa...' });
  await userEvent.click(busyButton);
  await userEvent.dblClick(busyButton);
  await userEvent.keyboard('{Escape}');

  expect(callsTo('DELETE', '/holidays/h-gio-to')).toHaveLength(1);
  expect(busyButton).toBeDisabled();
  expect(within(dialog).getByRole('button', { name: 'Huỷ' })).toBeDisabled();
  expect(screen.getByRole('dialog', { name: 'Xóa ngày nghỉ?' })).toBeInTheDocument();

  await act(async () => {
    state.holidays.y1 = [];
    pendingDelete.resolve(jsonResponse(200, { deleted: true }));
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(callsTo('DELETE', '/holidays/h-gio-to')).toHaveLength(1);
});

test('guard backend trả 403 tiếng Anh cho thống kê: hiện câu tiếng Việt cố định, danh sách ngày nghỉ vẫn hiện', async () => {
  const { routes } = makeBackend();
  mockFetchRoutes({
    ...routes,
    'GET /school-years/y1/calendar-stats': () =>
      jsonResponse(403, { statusCode: 403, message: 'Forbidden resource', error: 'Forbidden' }),
  });

  renderPage();

  expect(await screen.findByRole('alert')).toHaveTextContent('Bạn không có quyền thực hiện thao tác này');
  expect(await screen.findByText('Giỗ Tổ Hùng Vương')).toBeInTheDocument();
});

test('STUDENT vào thẳng URL: thấy câu từ chối và KHÔNG có request nào tới backend', async () => {
  const { routes } = makeBackend();
  mockFetchRoutes(routes);

  renderPage({ role: 'STUDENT' });

  expect(await screen.findByText('Bạn không có quyền xem trang này')).toBeInTheDocument();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('không có năm học nào (backend trả []): hiện "Chưa có năm học nào" và không gọi ngày nghỉ/thống kê với id rỗng', async () => {
  mockFetchRoutes({ 'GET /school-years': () => jsonResponse(200, []) });

  renderPage({ role: 'ADMIN' });

  expect(await screen.findByText('Chưa có năm học nào')).toBeInTheDocument();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(global.fetch.mock.calls.map(([request]) => new URL(request.url).pathname)).toEqual(['/school-years']);
});
