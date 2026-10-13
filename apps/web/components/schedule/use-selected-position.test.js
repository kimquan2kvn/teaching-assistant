import { act, renderHook } from '@testing-library/react';
import { CLASS_DETAIL } from '@/lib/test-fixtures/phase3';
import { getReadableSubjectPositions } from '@/lib/utils';
import { useSelectedPosition } from './use-selected-position';

const ADMIN = { id: 'u-admin', role: 'ADMIN' };
const GVBM_TOAN = { id: 'u-toan', role: 'TEACHER' };
const GVBM_VAN = { id: 'u-van', role: 'TEACHER' };
const OUTSIDER = { id: 'u-khac', role: 'TEACHER' };

// Danh sách ĐÃ lọc quyền đọc như trang truyền vào: ADMIN đọc đủ 3 vị trí môn theo thứ tự p-toan, p-van, p-ly.
const POSITIONS = getReadableSubjectPositions(CLASS_DETAIL.positions, ADMIN);

function renderSelected(initialProps) {
  return renderHook((props) => useSelectedPosition(props), { initialProps });
}

test('initialId có trong danh sách → chọn đúng vị trí đó, kể cả khi user đang giữ vị trí khác', () => {
  const { result } = renderSelected({ positions: POSITIONS, currentUser: GVBM_TOAN, initialId: 'p-van' });
  expect(result.current.positionId).toBe('p-van');
  expect(result.current.position).toBe(POSITIONS[1]);
  expect(result.current.position.subject).toBe('Ngữ văn');
});

test.each([
  ['p-khac không có trong danh sách', 'p-khac'],
  ['không truyền initialId', undefined],
  ['initialId rỗng', ''],
])('%s → rơi về vị trí user đang giữ (u-toan → p-toan)', (_label, initialId) => {
  const { result } = renderSelected({ positions: POSITIONS, currentUser: GVBM_TOAN, initialId });
  expect(result.current.positionId).toBe('p-toan');
});

test('rơi về vị trí user đang giữ chứ không phải phần tử đầu: u-van giữ p-van (phần tử thứ hai)', () => {
  const { result } = renderSelected({ positions: POSITIONS, currentUser: GVBM_VAN, initialId: 'p-khac' });
  expect(result.current.positionId).toBe('p-van');
  expect(result.current.position).toBe(POSITIONS[1]);
});

test('user không giữ vị trí nào trong danh sách → phần tử đầu', () => {
  const outsider = renderSelected({ positions: POSITIONS, currentUser: OUTSIDER });
  expect(outsider.result.current.positionId).toBe('p-toan');

  const admin = renderSelected({ positions: POSITIONS, currentUser: ADMIN });
  expect(admin.result.current.positionId).toBe('p-toan');
});

test.each([
  ['currentUser là null', null],
  ['currentUser không có id', { role: 'TEACHER' }],
])('%s → phần tử đầu, KHÔNG khớp nhầm vị trí đang trống (holder null)', (_label, currentUser) => {
  const toanThenVacantLy = [CLASS_DETAIL.positions[1], CLASS_DETAIL.positions[3]];
  const { result } = renderSelected({ positions: toanThenVacantLy, currentUser });
  expect(result.current.positionId).toBe('p-toan');
});

test('danh sách rỗng → positionId là chuỗi rỗng và position là undefined', () => {
  const { result } = renderSelected({ positions: [], currentUser: GVBM_TOAN, initialId: 'p-van' });
  expect(result.current.positionId).toBe('');
  expect(result.current.position).toBeUndefined();
});

test('dữ liệu về muộn ([] → có vị trí): chọn đúng ngay ở lần render đó, không qua trạng thái rỗng trung gian (không dùng effect)', () => {
  const seenPositionIds = [];
  const { result, rerender } = renderHook(
    (props) => {
      const selected = useSelectedPosition(props);
      seenPositionIds.push(selected.positionId);
      return selected;
    },
    { initialProps: { positions: [], currentUser: GVBM_VAN } },
  );
  expect(result.current.positionId).toBe('');

  rerender({ positions: POSITIONS, currentUser: GVBM_VAN });

  expect(result.current.positionId).toBe('p-van');
  // Cách làm bằng effect + setState sẽ có thêm 1 lần render với '' ở giữa.
  expect(seenPositionIds).toEqual(['', 'p-van']);
});

test('setPositionId thắng mọi mặc định, kể cả khi initialId đổi sau đó', () => {
  const { result, rerender } = renderSelected({ positions: POSITIONS, currentUser: GVBM_TOAN, initialId: 'p-ly' });
  expect(result.current.positionId).toBe('p-ly');

  act(() => {
    result.current.setPositionId('p-van');
  });
  expect(result.current.positionId).toBe('p-van');
  expect(result.current.position.subject).toBe('Ngữ văn');

  rerender({ positions: POSITIONS, currentUser: GVBM_TOAN, initialId: 'p-toan' });
  expect(result.current.positionId).toBe('p-van');
});

test('lựa chọn tay vẫn giữ nguyên khi danh sách được nạp lại thành mảng mới có cùng nội dung', () => {
  const { result, rerender } = renderSelected({ positions: POSITIONS, currentUser: GVBM_TOAN });
  act(() => {
    result.current.setPositionId('p-ly');
  });

  rerender({ positions: [...POSITIONS], currentUser: GVBM_TOAN });

  expect(result.current.positionId).toBe('p-ly');
});

test('vị trí đã chọn tay biến mất khỏi danh sách → rơi lại mặc định', () => {
  const { result, rerender } = renderSelected({ positions: POSITIONS, currentUser: GVBM_TOAN });
  act(() => {
    result.current.setPositionId('p-van');
  });
  expect(result.current.positionId).toBe('p-van');

  const withoutVan = POSITIONS.filter((position) => position.id !== 'p-van');
  rerender({ positions: withoutVan, currentUser: GVBM_TOAN });

  expect(result.current.positionId).toBe('p-toan');
  expect(result.current.position).toBe(withoutVan[0]);
});

test('vị trí chọn tay biến mất khỏi danh sách và danh sách còn lại rỗng → positionId rỗng', () => {
  const { result, rerender } = renderSelected({ positions: POSITIONS, currentUser: GVBM_TOAN });
  act(() => {
    result.current.setPositionId('p-van');
  });

  rerender({ positions: [], currentUser: GVBM_TOAN });

  expect(result.current.positionId).toBe('');
  expect(result.current.position).toBeUndefined();
});
