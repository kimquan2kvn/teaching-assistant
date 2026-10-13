import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { makeStore } from '@/lib/store/store';
import { setCredentials } from '@/lib/store/auth-slice';
import { makeMyPosition, makeSchoolYear, makeSlot, makeWeekLog } from '@/lib/test-fixtures/phase3';
import ThoiKhoaBieuPage from './page';

// Khác page.test.jsx (mock hook): ở đây chạy store và RTK Query THẬT, chỉ giả lập fetch. Kiểm chứng ngữ nghĩa thật của
// currentData khi đổi tuần (lưới không được hiện tiết của tuần cũ, không nháy câu "tuần này chưa có tiết nào") và hình
// dạng lỗi thật của backend khi tải danh sách vị trí.

const TEACHER = { id: 'u-toan', role: 'TEACHER' };
const EMPTY_WEEK_TEXT = 'Tuần này chưa có tiết nào. Khai báo tiết ở phần "Khai báo tiết" bên dưới.';

const POSITION_TOAN = makeWeekLog().position;
const WEEK_1 = {
  weekStart: '2026-01-12',
  weekEnd: '2026-01-18',
  slots: [makeSlot({ position: POSITION_TOAN })],
  lessonLogs: [makeWeekLog({ date: '2026-01-12T00:00:00.000Z' })],
};
const WEEK_2 = {
  weekStart: '2026-01-19',
  weekEnd: '2026-01-25',
  slots: [
    makeSlot({
      _id: 's-van',
      positionId: 'p-van',
      dayOfWeek: 3,
      period: 2,
      position: { _id: 'p-van', classId: 'class-1', className: '11A4', subject: 'Ngữ văn' },
    }),
  ],
  lessonLogs: [],
};

// Thứ Tư 14/01/2026 10:00 giờ VN. Chỉ giả `Date` (không giả setTimeout/promise) để userEvent và RTK Query chạy bình thường.
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

function mockFetchRoutes(routes) {
  global.fetch = jest.fn((request) => {
    const { pathname } = new URL(request.url);
    const route = routes[`${request.method} ${pathname}`];
    if (!route) return respond(404, { message: `Test chưa mock ${request.method} ${pathname}` });
    return route(request);
  });
}

const weekStartOf = (request) => new URL(request.url).searchParams.get('weekStart');

function renderPage() {
  const store = makeStore();
  store.dispatch(setCredentials({ user: TEACHER, accessToken: 'token' }));
  return render(
    <Provider store={store}>
      <ThoiKhoaBieuPage />
    </Provider>,
  );
}

const baseRoutes = {
  'GET /school-years': () => respond(200, [makeSchoolYear()]),
  'GET /school-years/y1/holidays': () => respond(200, []),
  'GET /positions/mine': () => respond(200, [makeMyPosition()]),
  'GET /positions/p-toan/timetable-slots': () => respond(200, [makeSlot()]),
};

beforeEach(() => {
  fakeNow('2026-01-14T03:00:00.000Z');
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
});

test('sang tuần sau lúc GET tuần mới còn treo: lưới không còn tiết tuần cũ, không nháy "tuần này chưa có tiết nào"; về xong hiện đúng tiết tuần mới', async () => {
  let releaseWeek2;
  mockFetchRoutes({
    ...baseRoutes,
    'GET /timetable/me': (request) => {
      if (weekStartOf(request) === '2026-01-12') return respond(200, WEEK_1);
      return new Promise((resolve) => {
        releaseWeek2 = () => respond(200, WEEK_2).then(resolve);
      });
    },
  });
  renderPage();
  const week1Region = await screen.findByRole('region', { name: 'Thời khóa biểu tuần 12/01 – 17/01' });
  expect(await within(week1Region).findByText('Bài 1')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));

  const region = await screen.findByRole('region', { name: 'Thời khóa biểu tuần 19/01 – 24/01' });
  expect(region.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
  expect(within(region).queryByText('Toán')).toBeNull();
  expect(within(region).queryByText('Bài 1')).toBeNull();
  expect(screen.queryByText(EMPTY_WEEK_TEXT)).toBeNull();

  await act(async () => {
    releaseWeek2();
  });
  expect(await within(region).findByText('Ngữ văn')).toBeInTheDocument();
  expect(region.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'false');
  expect(screen.queryByText(EMPTY_WEEK_TEXT)).toBeNull();
});

test('GET /positions/mine lỗi 500: hiện message backend trong role=alert, không nói "chưa giữ môn nào", lưới tuần vẫn dùng được', async () => {
  mockFetchRoutes({
    ...baseRoutes,
    'GET /positions/mine': () => respond(500, { statusCode: 500, message: 'Đã có lỗi xảy ra, vui lòng thử lại sau' }),
    'GET /timetable/me': () => respond(200, WEEK_1),
  });
  renderPage();

  expect(await screen.findByRole('alert')).toHaveTextContent('Đã có lỗi xảy ra, vui lòng thử lại sau');
  expect(screen.queryByText('Bạn chưa giữ môn nào, hãy tham gia lớp để có thời khóa biểu')).toBeNull();
  expect(screen.queryByText('Khai báo tiết')).toBeNull();
  expect(await screen.findByRole('region', { name: 'Thời khóa biểu tuần 12/01 – 17/01' })).toBeInTheDocument();
});
