'use client';

import { MoveLogDialog } from './move-log-dialog';

// Phần phản hồi chung của hai trang sổ báo giảng sau khi ghi: thông báo thành công, lỗi của thao tác tích/kéo-thả và
// hộp thoại "Chuyển ngày". `actions` là kết quả useLessonLogActions, `flow` là kết quả useMoveLogFlow.
export function LessonLogFeedback({ actions, flow }) {
  const { movingLog } = flow;

  return (
    <>
      {flow.notice && (
        <p role="status" className="mt-4 rounded-md bg-success-soft px-3 py-2 text-sm">
          {flow.notice}
        </p>
      )}
      {/* Hộp thoại đang mở thì lỗi hiện ngay trong hộp thoại nên không lặp lại ở đây. */}
      {actions.error && !movingLog && (
        <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {actions.error}
        </p>
      )}
      {movingLog && (
        <MoveLogDialog
          key={movingLog._id}
          log={movingLog}
          error={actions.error}
          busy={actions.busyIds.has(movingLog._id)}
          onClose={flow.closeMove}
          onSubmit={flow.submitMove}
        />
      )}
    </>
  );
}
