import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { makeStore } from '@/lib/store/store';
import { setCredentials } from '@/lib/store/auth-slice';
import { CLASS_DETAIL, makeSlot } from '@/lib/test-fixtures/phase3';
import ClassTimetablePage from './page';

// Khác page.test.jsx (mock hook): ở đây chạy store và RTK Query THẬT, chỉ giả lập fetch. Kiểm chứng điều mock hook không
// chứng minh được: ngữ nghĩa thật của currentData/data khi đổi môn (bảng không được hiện tiết của môn cũ kèm nút
// Sửa/Xóa), và danh sách tự tải lại sau khi ghi (kể cả khi ghi lỗi) không làm bảng/hộp thoại biến mất.

const GVBM_TOAN = { id: 'u-toan', role: 'TEACHER' };
const ADMIN = { id: 'u-admin', role: 'ADMIN' };

const SLOT_TOAN = makeSlot({ _id: 's-toan', positionId: 'p-toan', dayOfWeek: 4, period: 3 });
const SLOT_VAN = makeSlot({ _id: 's-van', positionId: 'p-van', dayOfWeek: 6, period: 2 });

function respond(status, body) {
  const text = JSON.stringify(body);
  return Promise.resolve({
    status,
    text: () => Promise.resolve(text),
    clone() {
      return { text: () => Promise.resolve(text) };
    },
  });
}

// Định tuyến theo "METHOD /đường-dẫn" (sau khi ghi nhiều query refetch cùng lúc nên thứ tự gọi fetch không cố định).
function mockFetchRoutes(routes) {
  global.fetch = jest.fn((request) => {
    const { pathname } = new URL(request.url);
    const route = routes[`${request.method} ${pathname}`];
    if (!route) return respond(404, { message: `Test chưa mock ${request.method} ${pathname}` });
    return route(request);
  });
}

function callsTo(method, pathname) {
  return global.fetch.mock.calls.filter(
    ([request]) => request.method === method && new URL(request.url).pathname === pathname,
  );
}

function renderPage(user) {
  const store = makeStore();
  store.dispatch(setCredentials({ user, accessToken: 'token' }));
  return render(
    <Provider store={store}>
      <ClassTimetablePage params={{ classId: 'class-1' }} searchParams={{}} />
    </Provider>,
  );
}

beforeEach(() => {
  global.fetch = jest.fn();
});

test('đổi môn lúc GET tiết của môn mới còn treo: KHÔNG hiện lại tiết môn cũ (kèm Sửa/Xóa), không có request ghi nào; về xong mới hiện đúng môn mới', async () => {
  let releaseVan;
  mockFetchRoutes({
    'GET /classes/class-1/detail': () => respond(200, CLASS_DETAIL),
    'GET /positions/p-toan/timetable-slots': () => respond(200, [SLOT_TOAN]),
    'GET /positions/p-van/timetable-slots': () =>
      new Promise((resolve) => {
        releaseVan = () => respond(200, [SLOT_VAN]).then(resolve);
      }),
  });
  renderPage(ADMIN);
  expect(await screen.findByText('Thứ 4')).toBeInTheDocument();

  await userEvent.selectOptions(screen.getByLabelText('Môn'), 'p-van');

  expect(await screen.findByText('Đang tải...')).toBeInTheDocument();
  expect(screen.queryByText('Thứ 4')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Sửa' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Xóa' })).toBeNull();
  expect(global.fetch.mock.calls.filter(([request]) => request.method !== 'GET')).toHaveLength(0);

  await act(async () => {
    releaseVan();
  });
  expect(await screen.findByText('Thứ 6')).toBeInTheDocument();
  expect(screen.queryByText('Thứ 4')).toBeNull();
});

test('đổi môn xong và tiết môn mới đã về: Xóa gửi DELETE đúng positionId và slotId của môn đang xem', async () => {
  let vanSlots = [SLOT_VAN];
  mockFetchRoutes({
    'GET /classes/class-1/detail': () => respond(200, CLASS_DETAIL),
    'GET /positions/p-toan/timetable-slots': () => respond(200, [SLOT_TOAN]),
    'GET /positions/p-van/timetable-slots': () => respond(200, [...vanSlots]),
    'DELETE /positions/p-van/timetable-slots/s-van': () => {
      vanSlots = [];
      return respond(200, { deleted: true });
    },
  });
  renderPage(ADMIN);
  await screen.findByText('Thứ 4');

  await userEvent.selectOptions(screen.getByLabelText('Môn'), 'p-van');
  await screen.findByText('Thứ 6');
  await userEvent.click(screen.getByRole('button', { name: 'Xóa' }));
  await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Xác nhận' }));

  expect(await screen.findByText('Môn này chưa khai báo tiết nào')).toBeInTheDocument();
  expect(global.fetch.mock.calls.filter(([request]) => request.method === 'DELETE')).toHaveLength(1);
  expect(callsTo('DELETE', '/positions/p-van/timetable-slots/s-van')).toHaveLength(1);
});

test('tạo tiết bị 409: danh sách tự tải lại ngay sau lỗi nhưng bảng không nháy "Đang tải..." nên hộp thoại và message lỗi vẫn còn', async () => {
  const message = 'Tiết này đã có trong thời khóa biểu của môn trong khoảng thời gian trùng';
  let slotListRequests = 0;
  let releaseRefetch;
  mockFetchRoutes({
    'GET /classes/class-1/detail': () => respond(200, CLASS_DETAIL),
    'GET /positions/p-toan/timetable-slots': () => {
      slotListRequests += 1;
      if (slotListRequests === 1) return respond(200, [SLOT_TOAN]);
      return new Promise((resolve) => {
        releaseRefetch = () => respond(200, [SLOT_TOAN]).then(resolve);
      });
    },
    'POST /positions/p-toan/timetable-slots': () => respond(409, { statusCode: 409, message }),
  });
  renderPage(GVBM_TOAN);
  await screen.findByText('Thứ 4');

  await userEvent.click(screen.getByRole('button', { name: 'Thêm tiết' }));
  const dialog = await screen.findByRole('dialog', { name: 'Thêm tiết' });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));

  expect(await within(dialog).findByText(message)).toBeInTheDocument();
  // Lần tải lại thứ hai đang treo: danh sách cũ của CHÍNH môn này phải còn nguyên (currentData không mất khi refetch).
  await waitFor(() => expect(slotListRequests).toBe(2));
  expect(screen.queryByText('Đang tải...')).toBeNull();
  expect(screen.getByRole('dialog', { name: 'Thêm tiết' })).toBeInTheDocument();
  expect(within(dialog).getByText(message)).toBeInTheDocument();

  await act(async () => {
    releaseRefetch();
  });
  expect(screen.getByRole('dialog', { name: 'Thêm tiết' })).toBeInTheDocument();
  expect(within(dialog).getByText(message)).toBeInTheDocument();
});
