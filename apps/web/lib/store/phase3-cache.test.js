import { makeStore } from './store';
import { schoolCalendarApi } from './school-calendar-api';
import { ppctApi } from './ppct-api';
import { timetableApi } from './timetable-api';
import { lessonLogsApi } from './lesson-logs-api';
import { positionsApi } from './positions-api';
import { makeHoliday, makeLessonLog, makePpctItem, makeSlot, makeWeekLog } from '../test-fixtures/phase3';

// Review Focus 5: ghi ngày nghỉ / tiết / PPCT / sổ báo giảng làm backend tính lại và dịch nhiều buổi báo giảng, nên các
// query của 4 slice dùng chung 1 cache phải refetch đúng tập liên quan: đủ (thiếu = màn hình hiện dữ liệu cũ) và không
// thừa (thừa = gọi lại vô ích query của vị trí khác). Mỗi ca so TẬP GET phát sinh sau lần ghi với tập kỳ vọng bằng
// toEqual trên mảng đã sắp: 1 phép so vừa chứng minh "có refetch", vừa chứng minh "KHÔNG refetch" các query còn lại,
// vừa bắt refetch đúp (mỗi query phải đúng 1 lần).
//
// Tham gia / ngừng phụ trách / gán lại vị trí (positions-api) chỉ đổi holderId, không tính lại dữ liệu nào, nhưng 2 lưới
// tuần của giáo viên (/timetable/me, /lesson-logs/week) gom theo TẬP vị trí đang giữ nên phải làm mới; dữ liệu theo từng
// vị trí (sổ báo giảng, tiết, PPCT) giữ nguyên nội dung nên không refetch.
//
// Mọi lệnh ghi đều .unwrap(): RTK Query 2.x vẫn áp invalidatesTags cả khi mutation bị từ chối (404/409/5xx), nên route
// quên mock vẫn kéo theo refetch và cho test xanh giả. Cũng vì thế file này không khẳng định "ghi lỗi thì không refetch".

const WEEK = '2026-01-12';

// Mẫu thật của GET /school-years/:id/calendar-stats (đúng 4 khóa).
const STATS = { totalHolidayDays: 4, leHolidayDays: 2, dotXuatHolidayDays: 2, remainingTeachingDays: 6 };
const COMMIT_ROW = { week: 1, periodLabel: '1', title: 'Bài 1', periodCount: 1, requirement: '' };

// Đúng shape GET /timetable/me: mỗi slot kèm position {_id, classId, className, subject}.
function makeWeekGrid() {
  return {
    weekStart: WEEK,
    weekEnd: '2026-01-18',
    slots: [{ ...makeSlot(), position: makeWeekLog().position }],
    lessonLogs: [makeWeekLog()],
  };
}

// 8 query nạp sẵn: có cả query "phải refetch" lẫn query "không được refetch" (vị trí p2, PPCT, tiết, ngày nghỉ).
const GET = {
  logsP1: 'GET /positions/p1/lesson-logs',
  logsP2: 'GET /positions/p2/lesson-logs',
  weekLogs: `GET /lesson-logs/week?weekStart=${WEEK}`,
  weekGrid: `GET /timetable/me?weekStart=${WEEK}`,
  ppctP1: 'GET /positions/p1/ppct',
  slotsP1: 'GET /positions/p1/timetable-slots',
  holidaysY1: 'GET /school-years/y1/holidays',
  statsY1: 'GET /school-years/y1/calendar-stats',
};

const READ_BODIES = {
  [GET.logsP1]: [makeLessonLog()],
  [GET.logsP2]: [makeLessonLog({ _id: 'l2', positionId: 'p2' })],
  [GET.weekLogs]: [makeWeekLog()],
  [GET.weekGrid]: makeWeekGrid(),
  [GET.ppctP1]: [makePpctItem()],
  [GET.slotsP1]: [makeSlot()],
  [GET.holidaysY1]: [makeHoliday()],
  [GET.statsY1]: STATS,
};

// Ghi ngày nghỉ: backend xếp lại sổ báo giảng của MỌI vị trí có PPCT, nên 'LessonLogs' và 'TeacherWeek' phải làm mới
// không kèm id (cả p1 lẫn p2). Danh sách PPCT và tiết không đổi nên không refetch.
const AFTER_HOLIDAY_WRITE = [GET.holidaysY1, GET.statsY1, GET.logsP1, GET.logsP2, GET.weekLogs, GET.weekGrid];
// Ghi tiết / PPCT / sổ báo giảng chỉ tính lại đúng 1 vị trí (p1): sổ báo giảng p1 làm mới theo id vị trí; mọi lưới tuần
// làm mới hết vì buổi học có thể dịch sang tuần khác.
const AFTER_SLOT_WRITE_P1 = [GET.slotsP1, GET.logsP1, GET.weekLogs, GET.weekGrid];
const AFTER_PPCT_WRITE_P1 = [GET.ppctP1, GET.logsP1, GET.weekLogs, GET.weekGrid];
const AFTER_LOG_UPDATE_P1 = [GET.logsP1, GET.weekLogs, GET.weekGrid];
// Đổi người giữ vị trí: chỉ 2 lưới tuần làm mới, mọi query theo vị trí giữ nguyên.
const AFTER_HOLDER_CHANGE = [GET.weekLogs, GET.weekGrid];

function makeHeldPosition(overrides = {}) {
  return { _id: 'p-toan', classId: 'class-1', type: 'SUBJECT', subject: 'Toán', holderId: 'u1', ...overrides };
}

const WRITES = [
  {
    name: 'createHoliday',
    endpoint: schoolCalendarApi.endpoints.createHoliday,
    arg: { schoolYearId: 'y1', name: 'Nghỉ lễ', type: 'LE', startDate: '2026-01-08', endDate: '2026-01-08' },
    write: { 'POST /holidays': [201, makeHoliday()] },
    refetched: AFTER_HOLIDAY_WRITE,
  },
  {
    name: 'updateHoliday',
    endpoint: schoolCalendarApi.endpoints.updateHoliday,
    arg: { id: 'h1', schoolYearId: 'y1', name: 'Đổi tên' },
    write: { 'PATCH /holidays/h1': [200, makeHoliday({ name: 'Đổi tên' })] },
    refetched: AFTER_HOLIDAY_WRITE,
  },
  {
    name: 'deleteHoliday',
    endpoint: schoolCalendarApi.endpoints.deleteHoliday,
    arg: { id: 'h1', schoolYearId: 'y1' },
    write: { 'DELETE /holidays/h1': [200, { deleted: true }] },
    refetched: AFTER_HOLIDAY_WRITE,
  },
  {
    name: 'createTimetableSlot',
    endpoint: timetableApi.endpoints.createTimetableSlot,
    arg: { positionId: 'p1', dayOfWeek: 2, period: 1, effectiveFrom: '2026-01-05', effectiveTo: null },
    write: { 'POST /positions/p1/timetable-slots': [201, makeSlot()] },
    refetched: AFTER_SLOT_WRITE_P1,
  },
  {
    name: 'updateTimetableSlot',
    endpoint: timetableApi.endpoints.updateTimetableSlot,
    arg: { positionId: 'p1', slotId: 's1', period: 3 },
    write: { 'PATCH /positions/p1/timetable-slots/s1': [200, makeSlot({ period: 3 })] },
    refetched: AFTER_SLOT_WRITE_P1,
  },
  {
    name: 'deleteTimetableSlot',
    endpoint: timetableApi.endpoints.deleteTimetableSlot,
    arg: { positionId: 'p1', slotId: 's1' },
    write: { 'DELETE /positions/p1/timetable-slots/s1': [200, { deleted: true }] },
    refetched: AFTER_SLOT_WRITE_P1,
  },
  {
    name: 'createPpctItem',
    endpoint: ppctApi.endpoints.createPpctItem,
    arg: { positionId: 'p1', ...COMMIT_ROW },
    write: { 'POST /positions/p1/ppct': [201, makePpctItem()] },
    refetched: AFTER_PPCT_WRITE_P1,
  },
  {
    name: 'updatePpctItem',
    endpoint: ppctApi.endpoints.updatePpctItem,
    arg: { positionId: 'p1', itemId: 'i1', title: 'Bài mới' },
    write: { 'PATCH /positions/p1/ppct/i1': [200, makePpctItem({ title: 'Bài mới' })] },
    refetched: AFTER_PPCT_WRITE_P1,
  },
  {
    name: 'deletePpctItem',
    endpoint: ppctApi.endpoints.deletePpctItem,
    arg: { positionId: 'p1', itemId: 'i1' },
    write: { 'DELETE /positions/p1/ppct/i1': [200, { deleted: true }] },
    refetched: AFTER_PPCT_WRITE_P1,
  },
  {
    name: 'importPpctCommit',
    endpoint: ppctApi.endpoints.importPpctCommit,
    arg: { positionId: 'p1', rows: [COMMIT_ROW] },
    write: { 'POST /positions/p1/ppct/import/commit': [201, [makePpctItem()]] },
    refetched: AFTER_PPCT_WRITE_P1,
  },
  {
    name: 'updateLessonLog',
    endpoint: lessonLogsApi.endpoints.updateLessonLog,
    arg: { positionId: 'p1', logId: 'l1', done: true },
    write: { 'PATCH /positions/p1/lesson-logs/l1': [200, makeLessonLog({ done: true })] },
    refetched: AFTER_LOG_UPDATE_P1,
  },
  {
    name: 'joinPosition',
    endpoint: positionsApi.endpoints.joinPosition,
    arg: { code: '11A4-8X2K', type: 'SUBJECT', subject: 'Toán' },
    write: { 'POST /positions/join': [201, makeHeldPosition()] },
    refetched: AFTER_HOLDER_CHANGE,
  },
  {
    name: 'releasePosition',
    endpoint: positionsApi.endpoints.releasePosition,
    arg: 'p-toan',
    write: { 'POST /positions/p-toan/release': [201, makeHeldPosition({ holderId: null })] },
    refetched: AFTER_HOLDER_CHANGE,
  },
  {
    name: 'reassignPosition',
    endpoint: positionsApi.endpoints.reassignPosition,
    arg: { positionId: 'p-toan', teacherId: 'u2', classId: 'class-1', oldTeacherId: 'u1' },
    write: { 'PATCH /positions/p-toan/reassign': [200, makeHeldPosition({ holderId: 'u2' })] },
    refetched: AFTER_HOLDER_CHANGE,
  },
];

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

function keyOf(request) {
  const { pathname, search } = new URL(request.url);
  return `${request.method} ${pathname}${search}`;
}

// Định tuyến theo "METHOD /đường-dẫn?query" thay vì xếp hàng mockReturnValueOnce: sau 1 lần ghi nhiều query refetch
// song song nên thứ tự gọi fetch không cố định. `writes`: { 'METHOD /đường-dẫn': [status, body] }.
function mockBackend(writes) {
  global.fetch = jest.fn((request) => {
    const key = keyOf(request);
    if (key in READ_BODIES) return jsonResponse(200, READ_BODIES[key]);
    if (key in writes) {
      const [status, body] = writes[key];
      return jsonResponse(status, body);
    }
    return jsonResponse(404, { message: `Test chưa mock ${key}` });
  });
}

const flushRefetches = () => new Promise((resolve) => setTimeout(resolve, 0));

// Chờ tới khi không còn request mới phát sinh: phép kiểm "KHÔNG refetch" chỉ đáng tin khi mọi refetch đang bay đã xong.
async function settle() {
  for (let round = 0; round < 10; round += 1) {
    const callsBefore = global.fetch.mock.calls.length;
    await flushRefetches();
    if (global.fetch.mock.calls.length === callsBefore) return;
  }
}

const sentGets = () =>
  global.fetch.mock.calls
    .map(([request]) => keyOf(request))
    .filter((key) => key.startsWith('GET '))
    .sort();

function loadQueries(store) {
  return Promise.all([
    store.dispatch(lessonLogsApi.endpoints.getPositionLessonLogs.initiate({ positionId: 'p1' })),
    store.dispatch(lessonLogsApi.endpoints.getPositionLessonLogs.initiate({ positionId: 'p2' })),
    store.dispatch(lessonLogsApi.endpoints.getTeacherWeekLessonLogs.initiate({ weekStart: WEEK })),
    store.dispatch(timetableApi.endpoints.getMyTimetableWeek.initiate({ weekStart: WEEK })),
    store.dispatch(ppctApi.endpoints.getPositionPpct.initiate('p1')),
    store.dispatch(timetableApi.endpoints.getPositionTimetableSlots.initiate('p1')),
    store.dispatch(schoolCalendarApi.endpoints.getHolidays.initiate('y1')),
    store.dispatch(schoolCalendarApi.endpoints.getCalendarStats.initiate('y1')),
  ]);
}

async function storeWithLoadedQueries(writes) {
  mockBackend(writes);
  const store = makeStore();
  const results = await loadQueries(store);
  // Tiền điều kiện: cả 8 query nạp thành công (không phải 404 do quên mock) và mỗi query mới gọi mạng đúng 1 lần,
  // nếu không thì phép so "refetch bao nhiêu lần" bên dưới không còn nghĩa.
  expect(results.every((result) => result.isSuccess)).toBe(true);
  expect(sentGets()).toEqual(Object.values(GET).sort());
  global.fetch.mockClear();
  return store;
}

test.each(WRITES)(
  '$name thành công: refetch đúng các query liên quan (đủ, không thừa, mỗi query 1 lần)',
  async ({ endpoint, arg, write, refetched }) => {
    const store = await storeWithLoadedQueries(write);

    await store.dispatch(endpoint.initiate(arg)).unwrap();
    await settle();

    expect(sentGets()).toEqual([...refetched].sort());
  },
);

test('importPpctPreview chỉ đọc file nên không refetch query nào; ghi thật (createPpctItem) cùng store thì có', async () => {
  const store = await storeWithLoadedQueries({
    'POST /positions/p1/ppct/import/preview': [201, { rows: [] }],
    'POST /positions/p1/ppct': [201, makePpctItem()],
  });

  const file = new File(['x'], 'ppct.xlsx');
  await store.dispatch(ppctApi.endpoints.importPpctPreview.initiate({ positionId: 'p1', file })).unwrap();
  await settle();
  expect(sentGets()).toEqual([]);

  // Đối chứng (cùng store, cùng cách quan sát): ghi thật thì có refetch, chứng tỏ các query vẫn đang được theo dõi và
  // "không refetch" ở trên là kết quả thật chứ không phải do đo hụt.
  await store.dispatch(ppctApi.endpoints.createPpctItem.initiate({ positionId: 'p1', ...COMMIT_ROW })).unwrap();
  await settle();
  expect(sentGets()).toEqual([...AFTER_PPCT_WRITE_P1].sort());
});

// Lưới tuần của giáo viên chỉ có tiết của các vị trí ĐANG giữ: tham gia 1 môn đã có TKB kế thừa thì có thêm tiết, ngừng
// phụ trách thì mất tiết. Mô phỏng bằng 1 biến "đang giữ" mà lần ghi vị trí đổi.
function mockTeacherWeekBackend({ writeKey, isHoldingAfterWrite }) {
  let isHolding = !isHoldingAfterWrite;
  global.fetch = jest.fn((request) => {
    const key = keyOf(request);
    if (key === writeKey) {
      isHolding = isHoldingAfterWrite;
      return jsonResponse(201, makeHeldPosition());
    }
    if (key === GET.weekGrid) {
      return jsonResponse(200, isHolding ? makeWeekGrid() : { ...makeWeekGrid(), slots: [], lessonLogs: [] });
    }
    if (key === GET.weekLogs) return jsonResponse(200, isHolding ? [makeWeekLog()] : []);
    return jsonResponse(404, { message: `Test chưa mock ${key}` });
  });
}

// Giống 2 trang /thoi-khoa-bieu và /so-bao-giang: mount = đăng ký 2 query lưới tuần, unmount = hủy đăng ký (bản cache
// vẫn sống 60 giây).
function mountWeekPages(store) {
  const grid = store.dispatch(timetableApi.endpoints.getMyTimetableWeek.initiate({ weekStart: WEEK }));
  const logs = store.dispatch(lessonLogsApi.endpoints.getTeacherWeekLessonLogs.initiate({ weekStart: WEEK }));
  return {
    async read() {
      const [gridResult, logsResult] = await Promise.all([grid, logs]);
      return { slots: gridResult.data?.slots.length, lessonLogs: logsResult.data?.length };
    },
    unmount() {
      grid.unsubscribe();
      logs.unsubscribe();
    },
  };
}

const HOLDER_WRITES_FROM_TEACHER = [
  {
    name: 'joinPosition',
    endpoint: positionsApi.endpoints.joinPosition,
    arg: { code: '11A4-8X2K', type: 'SUBJECT', subject: 'Toán' },
    writeKey: 'POST /positions/join',
    isHoldingAfterWrite: true,
  },
  {
    name: 'releasePosition',
    endpoint: positionsApi.endpoints.releasePosition,
    arg: 'p-toan',
    writeKey: 'POST /positions/p-toan/release',
    isHoldingAfterWrite: false,
  },
];

test.each(HOLDER_WRITES_FROM_TEACHER)(
  '$name khi 2 lưới tuần đã unmount (không còn subscriber): mount lại trong hạn cache vẫn lấy dữ liệu mới',
  async ({ endpoint, arg, writeKey, isHoldingAfterWrite }) => {
    mockTeacherWeekBackend({ writeKey, isHoldingAfterWrite });
    const store = makeStore();
    const withSlots = { slots: 1, lessonLogs: 1 };
    const withoutSlots = { slots: 0, lessonLogs: 0 };
    const [before, after] = isHoldingAfterWrite ? [withoutSlots, withSlots] : [withSlots, withoutSlots];

    const firstVisit = mountWeekPages(store);
    expect(await firstVisit.read()).toEqual(before);
    firstVisit.unmount();
    global.fetch.mockClear();

    // Đối chứng: chưa ghi gì thì mount lại dùng bản cache cũ, không gọi mạng — nên việc lấy mới sau lần ghi là do
    // invalidate chứ không phải do query luôn refetch khi mount.
    const controlVisit = mountWeekPages(store);
    expect(await controlVisit.read()).toEqual(before);
    expect(sentGets()).toEqual([]);
    controlVisit.unmount();

    await store.dispatch(endpoint.initiate(arg)).unwrap();
    await settle();
    global.fetch.mockClear();

    const secondVisit = mountWeekPages(store);
    expect(await secondVisit.read()).toEqual(after);
    expect(sentGets()).toEqual([GET.weekLogs, GET.weekGrid].sort());
  },
);
