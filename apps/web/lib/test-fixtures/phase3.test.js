import {
  CLASS_DETAIL,
  makeHoliday,
  makeLessonLog,
  makeMyPosition,
  makePpctItem,
  makeSchoolYear,
  makeSlot,
  makeWeekLog,
} from './phase3';

// Ghim giá trị mặc định đúng bảng "Hợp đồng API dùng ở FE" của plan Phase 3 UI: hơn 10 task sau dựa vào các
// giá trị này (vd ngày nghỉ 08/01/2026, tiết đầu Thứ 2), nên đổi fixture phải đổi cả test này có chủ đích.
describe('fixture hợp đồng API Phase 3', () => {
  test('makeSchoolYear mặc định khớp năm học seed 2025-2026', () => {
    expect(makeSchoolYear()).toEqual({
      _id: 'y1',
      name: '2025-2026',
      startDate: '2025-09-05T00:00:00.000Z',
      endDate: '2026-05-31T00:00:00.000Z',
      isCurrent: true,
    });
  });

  test('makeHoliday mặc định: nghỉ lễ 1 ngày 08/01/2026, ngày dạng ISO 00:00 UTC', () => {
    expect(makeHoliday()).toEqual({
      _id: 'h1',
      schoolYearId: 'y1',
      startDate: '2026-01-08T00:00:00.000Z',
      endDate: '2026-01-08T00:00:00.000Z',
      type: 'LE',
      name: 'Nghỉ lễ',
    });
  });

  test('makeSlot mặc định: Toán, Thứ 2 tiết 1, hiệu lực từ 05/01/2026, chưa có ngày kết thúc', () => {
    expect(makeSlot()).toEqual({
      _id: 's1',
      positionId: 'p-toan',
      dayOfWeek: 2,
      period: 1,
      effectiveFrom: '2026-01-05T00:00:00.000Z',
      effectiveTo: null,
    });
  });

  test('makePpctItem mặc định: không có key note (note là tuỳ chọn ở backend)', () => {
    const item = makePpctItem();
    expect(item).toEqual({
      _id: 'i1',
      positionId: 'p-toan',
      order: 1,
      week: 1,
      periodLabel: '1',
      title: 'Bài 1',
      periodCount: 1,
      requirement: '',
    });
    expect(item).not.toHaveProperty('note');
  });

  test('makeLessonLog mặc định kèm ppctItem lồng nhau', () => {
    expect(makeLessonLog()).toEqual({
      _id: 'l1',
      positionId: 'p-toan',
      ppctItemId: 'i1',
      date: '2026-01-05T00:00:00.000Z',
      done: false,
      isManuallyAdjusted: false,
      ppctItem: { order: 1, week: 1, periodLabel: '1', title: 'Bài 1', periodCount: 1, requirement: '' },
    });
  });

  test('makeWeekLog = makeLessonLog + position {_id, classId, className, subject} (dùng _id, không phải id)', () => {
    expect(makeWeekLog()).toEqual({
      ...makeLessonLog(),
      position: { _id: 'p-toan', classId: 'class-1', className: '11A4', subject: 'Toán' },
    });
  });

  test('makeMyPosition mặc định theo shape của GET /positions/mine (dùng id)', () => {
    expect(makeMyPosition()).toEqual({
      id: 'p-toan',
      type: 'SUBJECT',
      subject: 'Toán',
      class: { id: 'class-1', code: '11A4-8X2K', name: '11A4' },
    });
  });

  test('overrides ghi đè đúng trường được truyền, các trường còn lại giữ mặc định', () => {
    expect(makeSlot({ dayOfWeek: 5, effectiveTo: '2026-02-01T00:00:00.000Z' })).toEqual({
      ...makeSlot(),
      dayOfWeek: 5,
      effectiveTo: '2026-02-01T00:00:00.000Z',
    });
    expect(makeHoliday({ type: 'DOT_XUAT' }).type).toBe('DOT_XUAT');
    expect(makeHoliday({ type: 'DOT_XUAT' }).name).toBe('Nghỉ lễ');
  });

  test('mỗi lần gọi trả object MỚI kể cả object lồng nhau: sửa lần trước không rò sang lần sau', () => {
    const first = makeWeekLog();
    first.position.subject = 'Đã bị sửa';
    first.ppctItem.title = 'Đã bị sửa';
    const position = makeMyPosition();
    position.class.name = 'Đã bị sửa';

    const second = makeWeekLog();
    expect(second.position.subject).toBe('Toán');
    expect(second.ppctItem.title).toBe('Bài 1');
    expect(makeMyPosition().class.name).toBe('11A4');
  });

  test('CLASS_DETAIL: 1 GVCN + 3 vị trí môn (Toán, Ngữ văn có người giữ; Vật lý trống), HOMEROOM không có subject', () => {
    expect(CLASS_DETAIL.class).toEqual({ id: 'class-1', code: '11A4-8X2K', name: '11A4' });
    expect(CLASS_DETAIL.positions.map((p) => [p.id, p.type, p.subject, p.holder?.id ?? null])).toEqual([
      ['p-hr', 'HOMEROOM', undefined, 'u-gvcn'],
      ['p-toan', 'SUBJECT', 'Toán', 'u-toan'],
      ['p-van', 'SUBJECT', 'Ngữ văn', 'u-van'],
      ['p-ly', 'SUBJECT', 'Vật lý', null],
    ]);
    expect(CLASS_DETAIL.positions[0]).not.toHaveProperty('subject');
    for (const position of CLASS_DETAIL.positions) {
      if (position.holder) expect(typeof position.holder.fullName).toBe('string');
    }
  });
});
