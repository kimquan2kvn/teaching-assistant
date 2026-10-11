import { useMemo, useState } from 'react';

// Vị trí đang chọn của các trang PPCT/TKB/sổ báo giảng theo lớp. `positions` là danh sách ĐÃ lọc quyền đọc
// (getReadableSubjectPositions). State chỉ giữ lựa chọn TAY của người dùng; mặc định được dẫn xuất ở mỗi lần render
// bằng useMemo chứ không đồng bộ bằng useEffect: dữ liệu lớp về muộn thì chính lần render đó đã chọn đúng, và RTK Query
// trả reference mới của cùng dữ liệu cũng không gây vòng render.
// Thứ tự mặc định: lựa chọn tay (còn trong danh sách) → initialId (có trong danh sách) → vị trí user đang giữ → phần tử đầu.
export function useSelectedPosition({ positions, currentUser, initialId }) {
  const [manualId, setManualId] = useState('');

  const position = useMemo(() => {
    const findById = (id) => (id ? positions.find((candidate) => candidate.id === id) : undefined);
    // Phải kiểm currentUser?.id: vị trí đang trống có holder null, `undefined === undefined` sẽ khớp nhầm.
    const findHeldByUser = () =>
      currentUser?.id ? positions.find((candidate) => candidate.holder?.id === currentUser.id) : undefined;

    return findById(manualId) ?? findById(initialId) ?? findHeldByUser() ?? positions[0];
  }, [positions, currentUser, initialId, manualId]);

  return { positionId: position?.id ?? '', position, setPositionId: setManualId };
}
