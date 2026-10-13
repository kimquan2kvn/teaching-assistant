'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { MoveLogDialog } from './move-log-dialog';

// Phần phản hồi chung của hai trang sổ báo giảng sau khi ghi: thông báo thành công, lỗi của thao tác tích/kéo-thả và
// hộp thoại "Chuyển ngày". `actions` là kết quả useLessonLogActions, `flow` là kết quả useMoveLogFlow.
export function LessonLogFeedback({ actions, flow }) {
  const { movingLog } = flow;
  // Lỗi chỉ hiện trong hộp thoại của đúng buổi gây ra nó; lỗi của buổi khác (vd kéo-thả chạy dở) hiện ở banner.
  const isErrorInDialog = Boolean(movingLog) && actions.errorLogId === movingLog._id;

  return (
    <>
      {flow.notice && (
        <Alert role="status" variant="success" className="mt-4">
          <AlertDescription>{flow.notice}</AlertDescription>
        </Alert>
      )}
      {/* Lỗi của buổi đang mở hộp thoại hiện ngay trong hộp thoại nên không lặp lại ở đây. */}
      {actions.error && !isErrorInDialog && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{actions.error}</AlertDescription>
        </Alert>
      )}
      {movingLog && (
        <MoveLogDialog
          key={movingLog._id}
          log={movingLog}
          error={isErrorInDialog ? actions.error : null}
          busy={actions.busyIds.has(movingLog._id)}
          onClose={flow.closeMove}
          onSubmit={flow.submitMove}
        />
      )}
    </>
  );
}
