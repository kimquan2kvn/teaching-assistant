import { useMemo, useRef, useState } from 'react';
import { useUpdateLessonLogMutation } from '@/lib/store/lesson-logs-api';
import { apiErrorMessage, formatDate } from '@/lib/utils';

const UPDATE_FAILED_MESSAGE = 'Cập nhật buổi báo giảng thất bại, vui lòng thử lại';

export function getMoveSuccessMessage(dateOnly) {
  return `Đã chuyển buổi học sang ngày ${formatDate(dateOnly)}. Các buổi chưa chốt của môn đã được xếp lại.`;
}

function withoutSettled(entries) {
  const kept = new Map();
  for (const [logId, entry] of entries) {
    if (!entry.settled) kept.set(logId, entry);
  }
  return kept;
}

// Lần tải lại do invalidation của chính mutation bắt đầu ngay khi mutation hoàn tất, có thể sớm hơn vài ms so với lúc
// hook ghi nhận "đã lưu xong" (vài microtask sau) — dung sai này để lần tải đó vẫn được tính là sau khi lưu.
const REFETCH_START_TOLERANCE_MS = 50;

function isListRefreshedSince(listFetch, settledAt) {
  return !listFetch.isFetching && (listFetch.startedTimeStamp ?? 0) >= settledAt - REFETCH_START_TOLERANCE_MS;
}

// Ghi tích "Đã thực hiện" / chuyển ngày của sổ báo giảng, dùng chung cho trang theo môn-lớp và trang theo tuần.
// Không cập nhật lạc quan: bảng chỉ đổi khi backend trả thành công và danh sách được tải lại.
//
// `pending` giữ giá trị "Đã thực hiện" dự định của buổi đang lưu để checkbox không bật về giá trị cũ. Mutation xong thì
// RTK Query mới bắt đầu tải lại danh sách, nên nếu trang truyền `isRefreshing` (isFetching của query danh sách) giá trị
// dự định được giữ tới khi lần tải lại đó kết thúc — chặn lúc "nháy" giữa 2 thời điểm đó.
//
// Khi còn thao tác ghi khác chạy dở (vd PATCH chuyển ngày chờ backend tính lại), RTK Query hoãn invalidation của mutation
// vừa xong nên KHÔNG có lần tải lại nào bắt đầu và isRefreshing vẫn false: giá trị dự định sẽ bị bỏ sớm. Trang truyền
// thêm `listFetch` ({ isFetching, startedTimeStamp } của query danh sách) để hook chỉ bỏ giá trị dự định khi đã có một
// lần tải BẮT ĐẦU sau lúc lưu xong và đã hoàn tất; có `listFetch` thì `isRefreshing` không còn dùng.
export function useLessonLogActions({ isRefreshing = false, listFetch } = {}) {
  const [updateLessonLog] = useUpdateLessonLogMutation();
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [pendingEntries, setPendingEntries] = useState(() => new Map());
  const [wasRefreshing, setWasRefreshing] = useState(isRefreshing);
  // { message, logId }: lỗi gắn với buổi gây ra nó để hộp thoại của buổi khác không hiện nhầm.
  const [errorState, setError] = useState(null);
  // Cổng chặn gửi trùng đồng bộ: state chỉ có hiệu lực ở lần render sau, không chặn được 2 lần gọi liền nhau
  // trong cùng một sự kiện (bấm đúp, kéo-thả đúp) trong lúc backend còn đang tính lại tới vài giây.
  const inFlightIds = useRef(new Set());

  // Danh sách vừa tải lại xong nghĩa là dữ liệu đã mới: các giá trị dự định đã chốt hết tác dụng. Điều chỉnh state
  // ngay lúc render (mẫu "storing information from previous renders" của React) thay vì useEffect.
  if (wasRefreshing !== isRefreshing) {
    setWasRefreshing(isRefreshing);
    if (wasRefreshing) setPendingEntries(withoutSettled);
  }

  const isListFetching = listFetch?.isFetching;
  const listStartedAt = listFetch?.startedTimeStamp;
  const isTrackingList = listFetch !== undefined;
  const isEntryExpired = (entry) =>
    entry.settled &&
    (isTrackingList
      ? isListRefreshedSince({ isFetching: isListFetching, startedTimeStamp: listStartedAt }, entry.settledAt)
      : !isRefreshing);

  // Giá trị dự định đã hết tác dụng thì xóa hẳn (không chỉ ẩn): đổi sang query khác có startedTimeStamp cũ hơn
  // (vd quay lại tuần đã cache) sẽ không làm nó sống lại.
  if (isTrackingList && [...pendingEntries.values()].some(isEntryExpired)) {
    setPendingEntries((previous) => {
      const kept = new Map();
      for (const [logId, entry] of previous) {
        if (!isEntryExpired(entry)) kept.set(logId, entry);
      }
      return kept;
    });
  }

  const pending = useMemo(() => {
    const visible = new Map();
    for (const [logId, entry] of pendingEntries) {
      if (!entry.settled || isTrackingList || isRefreshing) visible.set(logId, entry.done);
    }
    return visible;
    // isEntryExpired đóng trên các giá trị đã có trong deps (isTrackingList/isRefreshing/listFetch).
  }, [pendingEntries, isRefreshing, isTrackingList]);

  function setEntry(logId, entry) {
    setPendingEntries((previous) => new Map(previous).set(logId, entry));
  }

  function dropEntry(logId) {
    setPendingEntries((previous) => {
      const next = new Map(previous);
      next.delete(logId);
      return next;
    });
  }

  // intendedDone chỉ có với thao tác tích; chuyển ngày không có giá trị dự định để giữ.
  async function runUpdate(log, changes, intendedDone) {
    const logId = log._id;
    if (inFlightIds.current.has(logId)) return false;

    const isToggle = intendedDone !== undefined;
    inFlightIds.current.add(logId);
    setError(null);
    setBusyIds((previous) => new Set(previous).add(logId));
    if (isToggle) setEntry(logId, { done: intendedDone, settled: false });

    try {
      await updateLessonLog({ positionId: log.positionId, logId, ...changes }).unwrap();
      if (isToggle) setEntry(logId, { done: intendedDone, settled: true, settledAt: Date.now() });
      return true;
    } catch (err) {
      setError({ message: apiErrorMessage(err, UPDATE_FAILED_MESSAGE), logId });
      if (isToggle) dropEntry(logId);
      return false;
    } finally {
      inFlightIds.current.delete(logId);
      setBusyIds((previous) => {
        const next = new Set(previous);
        next.delete(logId);
        return next;
      });
    }
  }

  function toggleDone(log, done) {
    return runUpdate(log, { done }, done);
  }

  function moveLog(log, dateOnly) {
    return runUpdate(log, { date: dateOnly });
  }

  function clearError() {
    setError(null);
  }

  return {
    toggleDone,
    moveLog,
    pending,
    busyIds,
    error: errorState?.message ?? null,
    errorLogId: errorState?.logId ?? null,
    clearError,
  };
}

// Luồng "chuyển ngày" của 2 trang sổ báo giảng: mở/đóng hộp thoại, thả thẻ vào cột ngày, và thông báo thành công.
// Nhận kết quả của useLessonLogActions làm tham số.
export function useMoveLogFlow(actions) {
  const [movingLog, setMovingLog] = useState(null);
  const [notice, setNotice] = useState(null);
  // Đổi môn/tuần/chế độ xem trong lúc kéo-thả còn chờ backend: thông báo thành công của thao tác thuộc ngữ cảnh cũ
  // không được hiện sang ngữ cảnh mới.
  const feedbackEpoch = useRef(0);

  function resetFeedback() {
    actions.clearError();
    setNotice(null);
  }

  function clearFeedback() {
    feedbackEpoch.current += 1;
    resetFeedback();
  }

  function requestMove(log) {
    resetFeedback();
    setMovingLog(log);
  }

  function closeMove() {
    actions.clearError();
    setMovingLog(null);
  }

  async function moveTo(log, dateOnly) {
    setNotice(null);
    const epoch = feedbackEpoch.current;
    const isMoved = await actions.moveLog(log, dateOnly);
    if (isMoved && epoch === feedbackEpoch.current) setNotice(getMoveSuccessMessage(dateOnly));
    return isMoved;
  }

  function submitMove(dateOnly) {
    if (!movingLog) return Promise.resolve(false);
    return moveTo(movingLog, dateOnly);
  }

  function toggleDone(log, done) {
    setNotice(null);
    return actions.toggleDone(log, done);
  }

  return { movingLog, notice, clearFeedback, requestMove, closeMove, submitMove, dropLog: moveTo, toggleDone };
}
