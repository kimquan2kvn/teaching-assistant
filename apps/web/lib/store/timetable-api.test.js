import { makeStore } from './store';
import * as timetableModule from './timetable-api';
import { timetableApi } from './timetable-api';
import { apiErrorMessage } from '../utils';
import { makeSlot, makeWeekLog } from '../test-fixtures/phase3';

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

beforeEach(() => {
  global.fetch = jest.fn();
});

const flushRefetches = () => new Promise((resolve) => setTimeout(resolve, 0));

function pathOf(request) {
  const { pathname, search } = new URL(request.url);
  return `${pathname}${search}`;
}

// Một lần ghi TKB kéo nhiều refetch song song nên mock theo "METHOD /đường-dẫn?query" thay vì theo thứ tự gọi.
function routeFetch(routes) {
  global.fetch.mockImplementation((request) => {
    const key = `${request.method} ${pathOf(request)}`;
    if (!(key in routes)) return jsonResponse(404, { message: `Chưa mock ${key}` });
    return jsonResponse(200, routes[key]);
  });
}

const callsOf = (method, path) =>
  global.fetch.mock.calls.filter(([request]) => request.method === method && pathOf(request) === path);

// Response thật của GET /timetable/me (đã đối chiếu timetable-slots.service.ts getMyWeek): slot của lưới tuần
// không có createdAt/updatedAt nhưng kèm position {_id, classId, className, subject}.
function makeWeekGrid(weekStart, weekEnd) {
  return {
    weekStart,
    weekEnd,
    slots: [{ ...makeSlot(), position: makeWeekLog().position }],
    lessonLogs: [makeWeekLog()],
  };
}

test('xuất đủ 5 hook theo hợp đồng của plan', () => {
  for (const name of [
    'useGetPositionTimetableSlotsQuery',
    'useCreateTimetableSlotMutation',
    'useUpdateTimetableSlotMutation',
    'useDeleteTimetableSlotMutation',
    'useGetMyTimetableWeekQuery',
  ]) {
    expect([name, typeof timetableModule[name]]).toEqual([name, 'function']);
  }
});

test('getPositionTimetableSlots gọi đúng GET /positions/:positionId/timetable-slots và trả nguyên mảng tiết', async () => {
  const slots = [makeSlot(), makeSlot({ _id: 's2', dayOfWeek: 5, period: 3 })];
  global.fetch.mockReturnValueOnce(jsonResponse(200, slots));
  const store = makeStore();
  const result = await store.dispatch(timetableApi.endpoints.getPositionTimetableSlots.initiate('p1'));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  expect(pathOf(request)).toBe('/positions/p1/timetable-slots');
  expect(result.data).toEqual(slots);
});

test('createTimetableSlot gọi đúng POST /positions/:positionId/timetable-slots, body không rò positionId', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(201, makeSlot()));
  const store = makeStore();
  await store.dispatch(
    timetableApi.endpoints.createTimetableSlot.initiate({
      positionId: 'p1',
      dayOfWeek: 2,
      period: 1,
      effectiveFrom: '2026-01-05',
      effectiveTo: null,
    }),
  );
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('POST');
  expect(pathOf(request)).toBe('/positions/p1/timetable-slots');
  expect(JSON.parse(request.body)).toEqual({
    dayOfWeek: 2,
    period: 1,
    effectiveFrom: '2026-01-05',
    effectiveTo: null,
  });
});

test('updateTimetableSlot gọi đúng PATCH /positions/:positionId/timetable-slots/:slotId, body chỉ có trường sửa', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, makeSlot({ period: 3 })));
  const store = makeStore();
  await store.dispatch(
    timetableApi.endpoints.updateTimetableSlot.initiate({ positionId: 'p1', slotId: 's1', period: 3 }),
  );
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('PATCH');
  expect(pathOf(request)).toBe('/positions/p1/timetable-slots/s1');
  expect(JSON.parse(request.body)).toEqual({ period: 3 });
});

test('updateTimetableSlot giữ effectiveTo:null trong body (bỏ ngày kết thúc), không biến thành vắng mặt', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, makeSlot()));
  const store = makeStore();
  await store.dispatch(
    timetableApi.endpoints.updateTimetableSlot.initiate({ positionId: 'p1', slotId: 's1', effectiveTo: null }),
  );
  expect(JSON.parse(global.fetch.mock.calls[0][0].body)).toEqual({ effectiveTo: null });
});

test('deleteTimetableSlot gọi đúng DELETE /positions/:positionId/timetable-slots/:slotId', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, { deleted: true }));
  const store = makeStore();
  await store.dispatch(timetableApi.endpoints.deleteTimetableSlot.initiate({ positionId: 'p1', slotId: 's1' }));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('DELETE');
  expect(pathOf(request)).toBe('/positions/p1/timetable-slots/s1');
});

test('getMyTimetableWeek gọi GET /timetable/me?weekStart= khi có weekStart và trả nguyên lưới tuần', async () => {
  const week = makeWeekGrid('2026-01-12', '2026-01-18');
  global.fetch.mockReturnValueOnce(jsonResponse(200, week));
  const store = makeStore();
  const result = await store.dispatch(timetableApi.endpoints.getMyTimetableWeek.initiate({ weekStart: '2026-01-12' }));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  expect(request.url).toContain('/timetable/me');
  expect(request.url).toContain('weekStart=2026-01-12');
  expect(result.data).toEqual(week);
});

test.each([
  ['{}', {}],
  ['undefined', undefined],
])('getMyTimetableWeek(%s) không gửi weekStart để backend dùng tuần hiện tại', async (_label, arg) => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, makeWeekGrid('2026-01-05', '2026-01-11')));
  const store = makeStore();
  await store.dispatch(timetableApi.endpoints.getMyTimetableWeek.initiate(arg));
  const request = global.fetch.mock.calls[0][0];
  expect(request.url).toContain('/timetable/me');
  expect(request.url).not.toContain('weekStart');
});

const SLOT_WRITES = [
  [
    'createTimetableSlot',
    { positionId: 'p1', dayOfWeek: 2, period: 1, effectiveFrom: '2026-01-05' },
    'POST /positions/p1/timetable-slots',
    makeSlot(),
  ],
  [
    'updateTimetableSlot',
    { positionId: 'p1', slotId: 's1', period: 3 },
    'PATCH /positions/p1/timetable-slots/s1',
    makeSlot({ period: 3 }),
  ],
  [
    'deleteTimetableSlot',
    { positionId: 'p1', slotId: 's1' },
    'DELETE /positions/p1/timetable-slots/s1',
    { deleted: true },
  ],
];

test.each(SLOT_WRITES)(
  '%s thành công refetch tiết của đúng vị trí và MỌI lưới tuần đang cache, không đụng tiết vị trí khác',
  async (endpointName, arg, writeRoute, writeBody) => {
    routeFetch({
      'GET /positions/p1/timetable-slots': [makeSlot()],
      'GET /positions/p2/timetable-slots': [],
      'GET /timetable/me?weekStart=2026-01-12': makeWeekGrid('2026-01-12', '2026-01-18'),
      'GET /timetable/me?weekStart=2026-01-19': makeWeekGrid('2026-01-19', '2026-01-25'),
      [writeRoute]: writeBody,
    });
    const store = makeStore();
    await store.dispatch(timetableApi.endpoints.getPositionTimetableSlots.initiate('p1'));
    await store.dispatch(timetableApi.endpoints.getPositionTimetableSlots.initiate('p2'));
    await store.dispatch(timetableApi.endpoints.getMyTimetableWeek.initiate({ weekStart: '2026-01-12' }));
    await store.dispatch(timetableApi.endpoints.getMyTimetableWeek.initiate({ weekStart: '2026-01-19' }));
    global.fetch.mockClear();

    await store.dispatch(timetableApi.endpoints[endpointName].initiate(arg));
    await flushRefetches();

    expect(callsOf('GET', '/positions/p1/timetable-slots')).toHaveLength(1);
    expect(callsOf('GET', '/timetable/me?weekStart=2026-01-12')).toHaveLength(1);
    expect(callsOf('GET', '/timetable/me?weekStart=2026-01-19')).toHaveLength(1);
    expect(callsOf('GET', '/positions/p2/timetable-slots')).toHaveLength(0);
  },
);

// Thông điệp đúng chữ của backend (timetable-slots.service.ts, shared timetable-slot.schema.ts). POST/PATCH đủ 2 ngày
// đi qua ZodValidationPipe nên message có tiền tố "Dữ liệu gửi lên không hợp lệ: "; PATCH chỉ 1 ngày thì service ném
// message trần.
const NEW_SLOT = { positionId: 'p1', dayOfWeek: 2, period: 1, effectiveFrom: '2026-01-05' };
const SLOT_ERRORS = [
  ['createTimetableSlot', 409, 'Bạn đã có tiết khác vào thời điểm này', NEW_SLOT],
  [
    'createTimetableSlot',
    409,
    'Tiết này đã có trong thời khóa biểu của môn trong khoảng thời gian trùng',
    NEW_SLOT,
  ],
  [
    'createTimetableSlot',
    400,
    'Dữ liệu gửi lên không hợp lệ: Ngày kết thúc hiệu lực không được trước ngày bắt đầu hiệu lực',
    NEW_SLOT,
  ],
  [
    'createTimetableSlot',
    400,
    'Chỉ vị trí giáo viên bộ môn mới có thời khóa biểu và PPCT',
    { ...NEW_SLOT, positionId: 'p-hr' },
  ],
  [
    'updateTimetableSlot',
    400,
    'Ngày kết thúc hiệu lực không được trước ngày bắt đầu hiệu lực',
    { positionId: 'p1', slotId: 's1', effectiveTo: '2026-01-01' },
  ],
  [
    'updateTimetableSlot',
    404,
    'Không tìm thấy tiết trong thời khóa biểu',
    { positionId: 'p1', slotId: 's-khong-co', period: 2 },
  ],
  [
    'deleteTimetableSlot',
    404,
    'Không tìm thấy tiết trong thời khóa biểu',
    { positionId: 'p1', slotId: 's-khong-co' },
  ],
];

test.each(SLOT_ERRORS)(
  '%s lỗi %i giữ nguyên status và message tiếng Việt của backend qua .unwrap(): %s',
  async (endpointName, status, message, arg) => {
    global.fetch.mockReturnValueOnce(jsonResponse(status, { statusCode: status, message, error: 'Lỗi' }));
    const store = makeStore();

    const error = await store.dispatch(timetableApi.endpoints[endpointName].initiate(arg)).unwrap().catch((e) => e);

    expect(error).toMatchObject({ status, data: { message } });
    expect(apiErrorMessage(error, 'Không lưu được tiết')).toBe(message);
  },
);
