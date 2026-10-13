import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { makeStore } from '@/lib/store/store';
import { setCredentials } from '@/lib/store/auth-slice';
import { CLASS_DETAIL, makePpctItem } from '@/lib/test-fixtures/phase3';
import PpctPage from './page';

// Khác page.test.jsx (mock hook): ở đây chạy store và RTK Query THẬT, chỉ giả lập fetch. Kiểm chứng những điều mock hook
// không chứng minh được: ngữ nghĩa thật của currentData khi đổi môn, bảng tự làm mới sau khi ghi (tag), và hình dạng
// lỗi thật của backend đi qua .unwrap() tới giao diện.

const GVBM_TOAN = { id: 'u-toan', role: 'TEACHER' };
const ADMIN = { id: 'u-admin', role: 'ADMIN' };

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

function renderPage(user, searchParams) {
  const store = makeStore();
  store.dispatch(setCredentials({ user, accessToken: 'token' }));
  return render(
    <Provider store={store}>
      <PpctPage params={{ classId: 'class-1' }} searchParams={searchParams} />
    </Provider>,
  );
}

beforeEach(() => {
  global.fetch = jest.fn();
});

test('đổi môn: trong lúc chờ PPCT của môn mới KHÔNG hiện lại dòng của môn cũ, tới khi về mới hiện đúng môn mới', async () => {
  let releaseVan;
  mockFetchRoutes({
    'GET /classes/class-1/detail': () => respond(200, CLASS_DETAIL),
    'GET /positions/p-toan/ppct': () => respond(200, [makePpctItem({ title: 'Bài của Toán' })]),
    'GET /positions/p-van/ppct': () =>
      new Promise((resolve) => {
        releaseVan = () =>
          respond(200, [makePpctItem({ _id: 'v1', positionId: 'p-van', title: 'Bài của Văn' })]).then(resolve);
      }),
  });
  renderPage(ADMIN);
  expect(await screen.findByText('Bài của Toán')).toBeInTheDocument();

  await userEvent.selectOptions(screen.getByLabelText('Môn'), 'p-van');

  expect(await screen.findByText('Đang tải...')).toBeInTheDocument();
  expect(screen.queryByText('Bài của Toán')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Sửa' })).toBeNull();

  await act(async () => {
    releaseVan();
  });
  expect(await screen.findByText('Bài của Văn')).toBeInTheDocument();
  expect(screen.queryByText('Bài của Toán')).toBeNull();
});

test('thêm mục: gửi đúng POST, hộp thoại đóng và bảng tự hiện mục mới nhờ refetch sau khi ghi', async () => {
  const serverItems = [makePpctItem({ _id: 'i1', title: 'Bài 1' })];
  mockFetchRoutes({
    'GET /classes/class-1/detail': () => respond(200, CLASS_DETAIL),
    'GET /positions/p-toan/ppct': () => respond(200, [...serverItems]),
    'POST /positions/p-toan/ppct': (request) => {
      const created = { ...JSON.parse(request.body), _id: 'i-moi', positionId: 'p-toan', order: serverItems.length + 1 };
      serverItems.push(created);
      return respond(201, created);
    },
  });
  renderPage(GVBM_TOAN);
  expect(await screen.findByText('Bài 1')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Thêm mục PPCT' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('Tuần'), '4');
  await userEvent.type(within(dialog).getByLabelText('Tiết thứ'), '7');
  await userEvent.type(within(dialog).getByLabelText('Bài học'), 'Bài 7');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm' }));

  expect(await screen.findByText('Bài 7')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(callsTo('POST', '/positions/p-toan/ppct')).toHaveLength(1);
  expect(JSON.parse(callsTo('POST', '/positions/p-toan/ppct')[0][0].body)).toEqual({
    week: 4,
    periodLabel: '7',
    title: 'Bài 7',
    periodCount: 1,
    requirement: '',
  });
});

test('thêm mục bị 409 (2 người cùng thêm): hiện nguyên văn message backend, hộp thoại KHÔNG đóng, bảng không đổi', async () => {
  mockFetchRoutes({
    'GET /classes/class-1/detail': () => respond(200, CLASS_DETAIL),
    'GET /positions/p-toan/ppct': () => respond(200, [makePpctItem({ _id: 'i1', title: 'Bài 1' })]),
    'POST /positions/p-toan/ppct': () =>
      respond(409, { statusCode: 409, message: 'Dữ liệu đã tồn tại, không thể ghi trùng' }),
  });
  renderPage(GVBM_TOAN);
  await screen.findByText('Bài 1');

  await userEvent.click(screen.getByRole('button', { name: 'Thêm mục PPCT' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('Tuần'), '1');
  await userEvent.type(within(dialog).getByLabelText('Tiết thứ'), '2');
  await userEvent.type(within(dialog).getByLabelText('Bài học'), 'Bài 2');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm' }));

  expect(await within(dialog).findByText('Dữ liệu đã tồn tại, không thể ghi trùng')).toBeInTheDocument();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(within(dialog).getByLabelText('Bài học')).toHaveDisplayValue('Bài 2');
});

test('đang lưu (store thật): Esc không đóng hộp thoại, POST đúng 1 lần, lỗi 409 trả về sau đó hiện trong hộp thoại còn mở', async () => {
  let releasePost;
  mockFetchRoutes({
    'GET /classes/class-1/detail': () => respond(200, CLASS_DETAIL),
    'GET /positions/p-toan/ppct': () => respond(200, [makePpctItem({ _id: 'i1', title: 'Bài 1' })]),
    'POST /positions/p-toan/ppct': () =>
      new Promise((resolve) => {
        releasePost = () =>
          respond(409, { statusCode: 409, message: 'Dữ liệu đã tồn tại, không thể ghi trùng' }).then(resolve);
      }),
  });
  renderPage(GVBM_TOAN);
  await screen.findByText('Bài 1');

  await userEvent.click(screen.getByRole('button', { name: 'Thêm mục PPCT' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('Tuần'), '1');
  await userEvent.type(within(dialog).getByLabelText('Tiết thứ'), '2');
  await userEvent.type(within(dialog).getByLabelText('Bài học'), 'Bài 2');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm' }));
  await waitFor(() => expect(callsTo('POST', '/positions/p-toan/ppct')).toHaveLength(1));

  await userEvent.keyboard('{Escape}');
  expect(screen.getByRole('dialog')).toBeInTheDocument();

  await act(async () => {
    releasePost();
  });
  expect(await within(dialog).findByText('Dữ liệu đã tồn tại, không thể ghi trùng')).toBeInTheDocument();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(callsTo('POST', '/positions/p-toan/ppct')).toHaveLength(1);
});

test('sửa và xóa ghi chú: PATCH mang note rỗng tường minh để backend xóa ghi chú đã lưu', async () => {
  mockFetchRoutes({
    'GET /classes/class-1/detail': () => respond(200, CLASS_DETAIL),
    'GET /positions/p-toan/ppct': () => respond(200, [makePpctItem({ _id: 'i1', title: 'Bài 1', note: 'Dạy bù' })]),
    'PATCH /positions/p-toan/ppct/i1': () => respond(200, makePpctItem({ _id: 'i1', title: 'Bài 1' })),
  });
  renderPage(GVBM_TOAN);
  await screen.findByText('Bài 1');

  await userEvent.click(screen.getByRole('button', { name: 'Sửa' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.clear(within(dialog).getByLabelText('Ghi chú'));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(callsTo('PATCH', '/positions/p-toan/ppct/i1')).toHaveLength(1);
  expect(JSON.parse(callsTo('PATCH', '/positions/p-toan/ppct/i1')[0][0].body)).toEqual({
    week: 1,
    periodLabel: '1',
    title: 'Bài 1',
    periodCount: 1,
    requirement: '',
    note: '',
  });
});

test('xóa mục: gửi đúng DELETE và dòng biến khỏi bảng sau khi bảng tự làm mới', async () => {
  let serverItems = [makePpctItem({ _id: 'i1', title: 'Bài 1' }), makePpctItem({ _id: 'i2', order: 2, title: 'Bài 2' })];
  mockFetchRoutes({
    'GET /classes/class-1/detail': () => respond(200, CLASS_DETAIL),
    'GET /positions/p-toan/ppct': () => respond(200, [...serverItems]),
    'DELETE /positions/p-toan/ppct/i1': () => {
      serverItems = serverItems.filter((item) => item._id !== 'i1');
      return respond(200, { deleted: true });
    },
  });
  renderPage(GVBM_TOAN);
  await screen.findByText('Bài 2');

  const firstRow = screen.getAllByRole('row').find((row) => within(row).queryByText('Bài 1'));
  await userEvent.click(within(firstRow).getByRole('button', { name: 'Xóa' }));
  await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Xác nhận xóa' }));

  await waitFor(() => expect(screen.queryByText('Bài 1')).toBeNull());
  expect(screen.getByText('Bài 2')).toBeInTheDocument();
  expect(callsTo('DELETE', '/positions/p-toan/ppct/i1')).toHaveLength(1);
});

test('backend trả 403 tiếng Anh (guard) cho chi tiết lớp: hiện câu tiếng Việt, không hiện bảng', async () => {
  mockFetchRoutes({
    'GET /classes/class-1/detail': () => respond(403, { statusCode: 403, message: 'Forbidden resource' }),
  });
  renderPage(GVBM_TOAN);

  expect(await screen.findByRole('heading', { name: 'Bạn không có quyền xem lớp này' })).toBeInTheDocument();
  expect(screen.queryByRole('table')).toBeNull();
  expect(callsTo('GET', '/positions/p-toan/ppct')).toHaveLength(0);
});
