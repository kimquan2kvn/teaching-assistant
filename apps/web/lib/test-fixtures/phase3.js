// Fixture đúng hợp đồng API Phase 3 (bảng "Hợp đồng API dùng ở FE" của plan phase3-ui) — MỘT nơi duy nhất để
// chỉnh khi đối chiếu với backend thật (Task 19). Mọi test Phase 3 import từ đây, không tự dựng object rời.
// Mỗi hàm trả object MỚI (kể cả object lồng nhau) để test này sửa fixture không rò sang test khác.

export function makeSchoolYear(overrides = {}) {
  return {
    _id: 'y1',
    name: '2025-2026',
    startDate: '2025-09-05T00:00:00.000Z',
    endDate: '2026-05-31T00:00:00.000Z',
    isCurrent: true,
    ...overrides,
  };
}

export function makeHoliday(overrides = {}) {
  return {
    _id: 'h1',
    schoolYearId: 'y1',
    startDate: '2026-01-08T00:00:00.000Z',
    endDate: '2026-01-08T00:00:00.000Z',
    type: 'LE',
    name: 'Nghỉ lễ',
    ...overrides,
  };
}

export function makeSlot(overrides = {}) {
  return {
    _id: 's1',
    positionId: 'p-toan',
    dayOfWeek: 2,
    period: 1,
    effectiveFrom: '2026-01-05T00:00:00.000Z',
    effectiveTo: null,
    ...overrides,
  };
}

export function makePpctItem(overrides = {}) {
  return {
    _id: 'i1',
    positionId: 'p-toan',
    order: 1,
    week: 1,
    periodLabel: '1',
    title: 'Bài 1',
    periodCount: 1,
    requirement: '',
    ...overrides,
  };
}

export function makeLessonLog(overrides = {}) {
  return {
    _id: 'l1',
    positionId: 'p-toan',
    ppctItemId: 'i1',
    date: '2026-01-05T00:00:00.000Z',
    done: false,
    isManuallyAdjusted: false,
    ppctItem: { order: 1, week: 1, periodLabel: '1', title: 'Bài 1', periodCount: 1, requirement: '' },
    ...overrides,
  };
}

// GET /lesson-logs/week và /timetable/me: position dùng `_id` (khác `id` của GET /positions/mine).
export function makeWeekLog(overrides = {}) {
  return {
    ...makeLessonLog(),
    position: { _id: 'p-toan', classId: 'class-1', className: '11A4', subject: 'Toán' },
    ...overrides,
  };
}

// Shape của GET /positions/mine.
export function makeMyPosition(overrides = {}) {
  return {
    id: 'p-toan',
    type: 'SUBJECT',
    subject: 'Toán',
    class: { id: 'class-1', code: '11A4-8X2K', name: '11A4' },
    ...overrides,
  };
}

// Shape của GET /classes/:id/detail. Vị trí HOMEROOM không có key `subject` (backend không gán).
export const CLASS_DETAIL = {
  class: { id: 'class-1', code: '11A4-8X2K', name: '11A4' },
  positions: [
    { id: 'p-hr', type: 'HOMEROOM', holder: { id: 'u-gvcn', fullName: 'Nguyễn Thị Lan' } },
    { id: 'p-toan', type: 'SUBJECT', subject: 'Toán', holder: { id: 'u-toan', fullName: 'Trần Văn Hùng' } },
    { id: 'p-van', type: 'SUBJECT', subject: 'Ngữ văn', holder: { id: 'u-van', fullName: 'Lê Thị Mai' } },
    { id: 'p-ly', type: 'SUBJECT', subject: 'Vật lý', holder: null },
  ],
};
