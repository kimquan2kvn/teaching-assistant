'use client';

import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { SlotPanel } from '@/components/schedule/slot-panel';
import { useSelectedPosition } from '@/components/schedule/use-selected-position';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { selectCurrentUser } from '@/lib/store/auth-slice';
import { useGetClassDetailQuery } from '@/lib/store/classes-api';
import { apiErrorMessage, canEditPosition, getReadableSubjectPositions } from '@/lib/utils';

// 403 = không giữ vị trí nào của lớp (vd gõ nhầm URL), 404 = lớp không tồn tại: phải phân biệt, và lỗi khác (500, mạng)
// không được nói nhầm là "không tìm thấy lớp".
function classErrorTitle(error) {
  if (error?.status === 403) return 'Bạn không có quyền xem lớp này';
  if (error?.status === 404) return 'Không tìm thấy lớp';
  return apiErrorMessage(error, 'Không tải được thông tin lớp, vui lòng thử lại');
}

export default function ClassTimetablePage({ params, searchParams }) {
  const { classId } = params;
  const currentUser = useSelector(selectCurrentUser);
  const { data: detail, isLoading, isError, error } = useGetClassDetailQuery(classId);

  // Chỉ các môn người dùng ĐỌC được: GVBM môn khác không có trong danh sách (backend sẽ trả 403 nếu cố đọc).
  const positions = useMemo(
    () => getReadableSubjectPositions(detail?.positions, currentUser),
    [detail, currentUser],
  );
  const { positionId, position, setPositionId } = useSelectedPosition({
    positions,
    currentUser,
    initialId: searchParams?.positionId,
  });

  if (isError) {
    return (
      <div className="p-6">
        <h1 className="font-heading text-xl font-semibold">{classErrorTitle(error)}</h1>
      </div>
    );
  }

  // Providers khôi phục người dùng bất đồng bộ: chưa có người dùng thì chưa biết được quyền, chưa kết luận "chưa giữ môn nào".
  if (isLoading || !currentUser) {
    return <div className="p-6 text-fg-muted">Đang tải...</div>;
  }

  return (
    <div className="p-6">
      <h1 className="font-heading text-2xl font-semibold">Thời khóa biểu môn</h1>
      <p className="text-fg-muted">{detail.class.name}</p>

      {positions.length === 0 ? (
        <p className="mt-4 text-sm text-fg-muted">Bạn chưa giữ môn nào trong lớp này</p>
      ) : (
        <>
          <div className="mt-4 max-w-xs">
            {positions.length > 1 ? (
              <>
                <Label htmlFor="thoi-khoa-bieu-mon">Môn</Label>
                <NativeSelect
                  id="thoi-khoa-bieu-mon"
                  value={positionId}
                  onChange={(event) => setPositionId(event.target.value)}
                >
                  {positions.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.subject}
                    </option>
                  ))}
                </NativeSelect>
              </>
            ) : (
              <p className="text-sm">
                <span className="text-fg-muted">Môn: </span>
                <span className="font-medium">{position.subject}</span>
              </p>
            )}
          </div>

          <div className="mt-4">
            <SlotPanel positionId={positionId} canEdit={canEditPosition(position, currentUser)} />
          </div>
        </>
      )}
    </div>
  );
}
