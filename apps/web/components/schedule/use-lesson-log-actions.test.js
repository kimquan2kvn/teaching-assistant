import { act, renderHook } from '@testing-library/react';
import { getMoveSuccessMessage, useLessonLogActions, useMoveLogFlow } from './use-lesson-log-actions';

const updateLessonLogMock = jest.fn();
jest.mock('@/lib/store/lesson-logs-api', () => ({
  ...jest.requireActual('@/lib/store/lesson-logs-api'),
  useUpdateLessonLogMutation: () => [updateLessonLogMock, { isLoading: false }],
}));

const LOG = { _id: 'l1', positionId: 'p-toan' };
const OTHER_LOG = { _id: 'l2', positionId: 'p-van' };
const FALLBACK_MESSAGE = 'Cập nhật buổi báo giảng thất bại, vui lòng thử lại';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function resolveWith(value = {}) {
  updateLessonLogMock.mockReturnValue({ unwrap: () => Promise.resolve(value) });
}

function rejectWith(error) {
  updateLessonLogMock.mockReturnValue({ unwrap: () => Promise.reject(error) });
}

// Mutation chỉ kết thúc khi test gọi gate.resolve/reject: để kiểm trạng thái "đang chờ backend tính lại".
function holdUntilSettled() {
  const gate = deferred();
  updateLessonLogMock.mockReturnValue({ unwrap: () => gate.promise });
  return gate;
}

beforeEach(() => {
  updateLessonLogMock.mockReset();
});

describe('useLessonLogActions: tích "Đã thực hiện"', () => {
  test('gọi updateLessonLog đúng payload; busyIds và pending giữ giá trị dự định trong lúc chờ rồi trả về rỗng', async () => {
    const gate = holdUntilSettled();
    const { result } = renderHook(() => useLessonLogActions());

    let outcome;
    act(() => {
      outcome = result.current.toggleDone(LOG, true);
    });

    expect(updateLessonLogMock).toHaveBeenCalledTimes(1);
    expect(updateLessonLogMock).toHaveBeenCalledWith({ positionId: 'p-toan', logId: 'l1', done: true });
    expect(result.current.busyIds.has('l1')).toBe(true);
    expect(result.current.pending.get('l1')).toBe(true);

    await act(async () => {
      gate.resolve({});
    });

    await expect(outcome).resolves.toBe(true);
    expect(result.current.busyIds.size).toBe(0);
    expect(result.current.pending.size).toBe(0);
    expect(result.current.error).toBeNull();
  });

  test('bỏ tích (done=false) cũng giữ giá trị false trong pending lúc chờ — không bị coi là "không có giá trị"', () => {
    holdUntilSettled();
    const { result } = renderHook(() => useLessonLogActions());

    act(() => {
      result.current.toggleDone(LOG, false);
    });

    expect(updateLessonLogMock).toHaveBeenCalledWith({ positionId: 'p-toan', logId: 'l1', done: false });
    expect(result.current.pending.has('l1')).toBe(true);
    expect(result.current.pending.get('l1')).toBe(false);
  });

  test('lỗi 403 của guard (tiếng Anh) → resolve false, error là câu tiếng Việt cố định, busy/pending được dọn', async () => {
    rejectWith({ status: 403, data: { message: 'Forbidden resource' } });
    const { result } = renderHook(() => useLessonLogActions());

    let outcome;
    await act(async () => {
      outcome = await result.current.toggleDone(LOG, true);
    });

    expect(outcome).toBe(false);
    expect(result.current.error).toBe('Bạn không có quyền thực hiện thao tác này');
    expect(result.current.busyIds.size).toBe(0);
    expect(result.current.pending.size).toBe(0);
  });

  test('lỗi mạng (không có message của backend) → câu tiếng Việt dự phòng, không phải chữ tiếng Anh của trình duyệt', async () => {
    rejectWith({ status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' });
    const { result } = renderHook(() => useLessonLogActions());

    await act(async () => {
      await result.current.toggleDone(LOG, true);
    });

    expect(result.current.error).toBe(FALLBACK_MESSAGE);
  });
});

describe('useLessonLogActions: chuyển ngày', () => {
  test('moveLog gọi updateLessonLog với {positionId, logId, date} và resolve true khi thành công', async () => {
    resolveWith();
    const { result } = renderHook(() => useLessonLogActions());

    let outcome;
    await act(async () => {
      outcome = await result.current.moveLog(LOG, '2026-01-22');
    });

    expect(outcome).toBe(true);
    expect(updateLessonLogMock).toHaveBeenCalledWith({ positionId: 'p-toan', logId: 'l1', date: '2026-01-22' });
    expect(result.current.error).toBeNull();
    expect(result.current.pending.size).toBe(0);
  });

  test('chuyển ngày không động tới pending của "Đã thực hiện" (chỉ busy trong lúc chờ)', () => {
    holdUntilSettled();
    const { result } = renderHook(() => useLessonLogActions());

    act(() => {
      result.current.moveLog(LOG, '2026-01-22');
    });

    expect(result.current.busyIds.has('l1')).toBe(true);
    expect(result.current.pending.size).toBe(0);
  });

  test.each([
    [400, 'Ngày này không có tiết của môn'],
    [409, 'Ngày này đã có buổi học khác, không thể chuyển vào'],
    [404, 'Không tìm thấy buổi học'],
  ])('lỗi %s → resolve false và error là message nguyên văn của backend', async (status, message) => {
    rejectWith({ status, data: { message } });
    const { result } = renderHook(() => useLessonLogActions());

    let outcome;
    await act(async () => {
      outcome = await result.current.moveLog(LOG, '2026-01-22');
    });

    expect(outcome).toBe(false);
    expect(result.current.error).toBe(message);
    expect(result.current.busyIds.size).toBe(0);
  });
});

describe('useLessonLogActions: lỗi và gửi trùng', () => {
  test('clearError() xóa error', async () => {
    rejectWith({ status: 409, data: { message: 'Ngày này đã có buổi học khác, không thể chuyển vào' } });
    const { result } = renderHook(() => useLessonLogActions());
    await act(async () => {
      await result.current.moveLog(LOG, '2026-01-22');
    });
    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  test('bắt đầu thao tác mới thì xóa lỗi cũ ngay (không để lỗi của lần trước đứng cạnh lần đang gửi)', async () => {
    rejectWith({ status: 400, data: { message: 'Ngày này không có tiết của môn' } });
    const { result } = renderHook(() => useLessonLogActions());
    await act(async () => {
      await result.current.moveLog(LOG, '2026-01-22');
    });
    expect(result.current.error).toBe('Ngày này không có tiết của môn');

    holdUntilSettled();
    act(() => {
      result.current.toggleDone(OTHER_LOG, true);
    });

    expect(result.current.error).toBeNull();
  });

  test('gọi liên tiếp cùng một buổi khi lần đầu chưa xong (bấm đúp) → chỉ gửi 1 lần, lần sau resolve false và không báo lỗi', async () => {
    const gate = holdUntilSettled();
    const { result } = renderHook(() => useLessonLogActions());

    let first;
    let second;
    act(() => {
      first = result.current.moveLog(LOG, '2026-01-22');
      second = result.current.moveLog(LOG, '2026-01-22');
    });

    expect(updateLessonLogMock).toHaveBeenCalledTimes(1);
    await expect(second).resolves.toBe(false);
    expect(result.current.error).toBeNull();

    await act(async () => {
      gate.resolve({});
    });
    await expect(first).resolves.toBe(true);
  });

  test('buổi đang chuyển ngày thì tích "Đã thực hiện" cùng buổi đó bị bỏ qua (và ngược lại)', async () => {
    const gate = holdUntilSettled();
    const { result } = renderHook(() => useLessonLogActions());

    let toggled;
    act(() => {
      result.current.moveLog(LOG, '2026-01-22');
      toggled = result.current.toggleDone(LOG, true);
    });

    expect(updateLessonLogMock).toHaveBeenCalledTimes(1);
    await expect(toggled).resolves.toBe(false);
    expect(result.current.pending.size).toBe(0);

    await act(async () => {
      gate.resolve({});
    });
  });

  test('sau khi xong, cùng buổi đó gửi lại được', async () => {
    resolveWith();
    const { result } = renderHook(() => useLessonLogActions());

    await act(async () => {
      await result.current.toggleDone(LOG, true);
    });
    await act(async () => {
      await result.current.toggleDone(LOG, false);
    });

    expect(updateLessonLogMock).toHaveBeenCalledTimes(2);
    expect(updateLessonLogMock).toHaveBeenLastCalledWith({ positionId: 'p-toan', logId: 'l1', done: false });
  });

  test('hai buổi khác nhau gửi song song được; busyIds chứa cả hai và mỗi buổi dùng positionId của chính nó', async () => {
    const gate = holdUntilSettled();
    const { result } = renderHook(() => useLessonLogActions());

    act(() => {
      result.current.toggleDone(LOG, true);
      result.current.toggleDone(OTHER_LOG, true);
    });

    expect(updateLessonLogMock).toHaveBeenCalledTimes(2);
    expect(updateLessonLogMock).toHaveBeenCalledWith({ positionId: 'p-toan', logId: 'l1', done: true });
    expect(updateLessonLogMock).toHaveBeenCalledWith({ positionId: 'p-van', logId: 'l2', done: true });
    expect([...result.current.busyIds].sort()).toEqual(['l1', 'l2']);

    await act(async () => {
      gate.resolve({});
    });
    expect(result.current.busyIds.size).toBe(0);
  });
});

describe('useLessonLogActions: isRefreshing (tránh nháy lại giá trị cũ giữa lúc lưu xong và lúc danh sách tải lại)', () => {
  function renderRefreshing(initialIsRefreshing = false) {
    return renderHook(({ isRefreshing }) => useLessonLogActions({ isRefreshing }), {
      initialProps: { isRefreshing: initialIsRefreshing },
    });
  }

  test('lưu xong mà danh sách đang tải lại → pending vẫn giữ giá trị dự định; tải lại xong thì bỏ', async () => {
    const gate = holdUntilSettled();
    const { result, rerender } = renderRefreshing(false);

    act(() => {
      result.current.toggleDone(LOG, true);
    });
    // RTK Query bắt đầu tải lại ngay khi mutation hoàn tất (invalidatesTags).
    rerender({ isRefreshing: true });
    await act(async () => {
      gate.resolve({});
    });

    expect(result.current.busyIds.size).toBe(0);
    expect(result.current.pending.get('l1')).toBe(true);

    rerender({ isRefreshing: false });

    expect(result.current.pending.size).toBe(0);
  });

  test('tải lại xong rồi một lần tải khác bắt đầu (vd đổi tuần) → giá trị dự định cũ không sống lại', async () => {
    const gate = holdUntilSettled();
    const { result, rerender } = renderRefreshing(false);
    act(() => {
      result.current.toggleDone(LOG, true);
    });
    rerender({ isRefreshing: true });
    await act(async () => {
      gate.resolve({});
    });
    expect(result.current.pending.get('l1')).toBe(true);
    rerender({ isRefreshing: false });

    rerender({ isRefreshing: true });

    expect(result.current.pending.size).toBe(0);
  });

  test('lưu lỗi thì bỏ pending ngay dù danh sách đang tải lại (checkbox về đúng trạng thái trong dữ liệu)', async () => {
    const gate = holdUntilSettled();
    const { result, rerender } = renderRefreshing(true);

    act(() => {
      result.current.toggleDone(LOG, true);
    });
    expect(result.current.pending.get('l1')).toBe(true);

    await act(async () => {
      gate.reject({ status: 500, data: { message: 'Đã có lỗi xảy ra, vui lòng thử lại sau' } });
    });

    expect(result.current.pending.size).toBe(0);
    expect(result.current.error).toBe('Đã có lỗi xảy ra, vui lòng thử lại sau');
    rerender({ isRefreshing: false });
    expect(result.current.pending.size).toBe(0);
  });

  test('không truyền isRefreshing: lưu xong là pending rỗng ngay', async () => {
    resolveWith();
    const { result } = renderHook(() => useLessonLogActions());

    await act(async () => {
      await result.current.toggleDone(LOG, true);
    });

    expect(result.current.pending.size).toBe(0);
  });
});

describe('getMoveSuccessMessage', () => {
  test('ngày dạng dd/mm/yyyy và câu nhắc các buổi chưa chốt đã được xếp lại', () => {
    expect(getMoveSuccessMessage('2026-01-22')).toBe(
      'Đã chuyển buổi học sang ngày 22/01/2026. Các buổi chưa chốt của môn đã được xếp lại.',
    );
  });
});

describe('useMoveLogFlow', () => {
  function makeActions(overrides = {}) {
    return {
      toggleDone: jest.fn().mockResolvedValue(true),
      moveLog: jest.fn().mockResolvedValue(true),
      clearError: jest.fn(),
      ...overrides,
    };
  }

  test('requestMove mở hộp thoại cho đúng buổi, xóa lỗi và thông báo cũ', async () => {
    const actions = makeActions();
    const { result } = renderHook(() => useMoveLogFlow(actions));
    await act(async () => {
      await result.current.dropLog(LOG, '2026-01-22');
    });
    expect(result.current.notice).not.toBeNull();

    act(() => {
      result.current.requestMove(LOG);
    });

    expect(result.current.movingLog).toBe(LOG);
    expect(result.current.notice).toBeNull();
    expect(actions.clearError).toHaveBeenCalled();
  });

  test('closeMove đóng hộp thoại và xóa lỗi của lần chuyển đó', () => {
    const actions = makeActions();
    const { result } = renderHook(() => useMoveLogFlow(actions));
    act(() => {
      result.current.requestMove(LOG);
    });
    actions.clearError.mockClear();

    act(() => {
      result.current.closeMove();
    });

    expect(result.current.movingLog).toBeNull();
    expect(actions.clearError).toHaveBeenCalled();
  });

  test('submitMove chuyển đúng buổi đang mở hộp thoại; thành công → thông báo, trả true', async () => {
    const actions = makeActions();
    const { result } = renderHook(() => useMoveLogFlow(actions));
    act(() => {
      result.current.requestMove(LOG);
    });

    let outcome;
    await act(async () => {
      outcome = await result.current.submitMove('2026-01-22');
    });

    expect(outcome).toBe(true);
    expect(actions.moveLog).toHaveBeenCalledWith(LOG, '2026-01-22');
    expect(result.current.notice).toBe(getMoveSuccessMessage('2026-01-22'));
  });

  test('submitMove thất bại → trả false, KHÔNG có thông báo thành công', async () => {
    const actions = makeActions({ moveLog: jest.fn().mockResolvedValue(false) });
    const { result } = renderHook(() => useMoveLogFlow(actions));
    act(() => {
      result.current.requestMove(LOG);
    });

    let outcome;
    await act(async () => {
      outcome = await result.current.submitMove('2026-01-22');
    });

    expect(outcome).toBe(false);
    expect(result.current.notice).toBeNull();
  });

  test('submitMove khi chưa mở hộp thoại → trả false, không gọi moveLog', async () => {
    const actions = makeActions();
    const { result } = renderHook(() => useMoveLogFlow(actions));

    let outcome;
    await act(async () => {
      outcome = await result.current.submitMove('2026-01-22');
    });

    expect(outcome).toBe(false);
    expect(actions.moveLog).not.toHaveBeenCalled();
  });

  test('dropLog chuyển buổi bị thả; thành công → thông báo; thất bại → không thông báo', async () => {
    const actions = makeActions();
    const { result } = renderHook(() => useMoveLogFlow(actions));

    await act(async () => {
      await result.current.dropLog(OTHER_LOG, '2026-01-15');
    });
    expect(actions.moveLog).toHaveBeenCalledWith(OTHER_LOG, '2026-01-15');
    expect(result.current.notice).toBe(getMoveSuccessMessage('2026-01-15'));

    actions.moveLog.mockResolvedValue(false);
    await act(async () => {
      await result.current.dropLog(OTHER_LOG, '2026-01-16');
    });
    expect(result.current.notice).toBeNull();
  });

  test('clearFeedback xóa cả lỗi lẫn thông báo thành công nhưng không đóng hộp thoại đang mở', async () => {
    const actions = makeActions();
    const { result } = renderHook(() => useMoveLogFlow(actions));
    await act(async () => {
      await result.current.dropLog(LOG, '2026-01-22');
    });
    act(() => {
      result.current.requestMove(OTHER_LOG);
    });
    await act(async () => {
      await result.current.submitMove('2026-01-23');
    });
    expect(result.current.notice).not.toBeNull();
    actions.clearError.mockClear();

    act(() => {
      result.current.clearFeedback();
    });

    expect(actions.clearError).toHaveBeenCalledTimes(1);
    expect(result.current.notice).toBeNull();
    expect(result.current.movingLog).toBe(OTHER_LOG);
  });

  test('tích "Đã thực hiện" xóa thông báo chuyển ngày cũ rồi gọi toggleDone', async () => {
    const actions = makeActions();
    const { result } = renderHook(() => useMoveLogFlow(actions));
    await act(async () => {
      await result.current.dropLog(LOG, '2026-01-22');
    });
    expect(result.current.notice).not.toBeNull();

    await act(async () => {
      await result.current.toggleDone(LOG, true);
    });

    expect(actions.toggleDone).toHaveBeenCalledWith(LOG, true);
    expect(result.current.notice).toBeNull();
  });
});

describe('useLessonLogActions: listFetch (thao tác ghi chồng nhau làm invalidation bị hoãn)', () => {
  const SETTLE_TIME = new Date('2026-01-14T03:00:30.000Z').getTime();
  const BEFORE_SETTLE = SETTLE_TIME - 30_000;

  function renderTracking(listFetch) {
    return renderHook(({ listFetch: current }) => useLessonLogActions({ listFetch: current }), {
      initialProps: { listFetch },
    });
  }

  async function settleToggleAt(result, time) {
    jest.useFakeTimers({ now: time });
    const gate = holdUntilSettled();
    act(() => {
      result.current.toggleDone(LOG, true);
    });
    await act(async () => {
      gate.resolve({});
    });
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  test('lưu xong khi danh sách không đang tải và chưa có lần tải nào sau đó → vẫn giữ giá trị dự định', async () => {
    const { result, rerender } = renderTracking({ isFetching: false, startedTimeStamp: BEFORE_SETTLE });

    await settleToggleAt(result, SETTLE_TIME);
    rerender({ listFetch: { isFetching: false, startedTimeStamp: BEFORE_SETTLE } });

    expect(result.current.pending.get('l1')).toBe(true);
  });

  test('lần tải bắt đầu SAU lúc lưu xong đang chạy thì giữ; tải xong thì bỏ hẳn, tải khác (cache cũ) không làm sống lại', async () => {
    const { result, rerender } = renderTracking({ isFetching: false, startedTimeStamp: BEFORE_SETTLE });
    await settleToggleAt(result, SETTLE_TIME);

    rerender({ listFetch: { isFetching: true, startedTimeStamp: SETTLE_TIME + 100 } });
    expect(result.current.pending.get('l1')).toBe(true);

    rerender({ listFetch: { isFetching: false, startedTimeStamp: SETTLE_TIME + 100 } });
    expect(result.current.pending.size).toBe(0);

    rerender({ listFetch: { isFetching: false, startedTimeStamp: BEFORE_SETTLE } });
    expect(result.current.pending.size).toBe(0);
  });

  test('lần tải bắt đầu TRƯỚC lúc lưu xong (dữ liệu có thể cũ) kết thúc thì chưa bỏ giá trị dự định', async () => {
    const { result, rerender } = renderTracking({ isFetching: true, startedTimeStamp: BEFORE_SETTLE });
    await settleToggleAt(result, SETTLE_TIME);

    rerender({ listFetch: { isFetching: false, startedTimeStamp: BEFORE_SETTLE } });

    expect(result.current.pending.get('l1')).toBe(true);
  });
});
