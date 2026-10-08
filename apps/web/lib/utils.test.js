import { buildIdNameMap, getMyPositionsInClass, formatSignedPoints, todayDateOnly } from './utils';

describe('buildIdNameMap', () => {
  test('mảng rỗng → Map rỗng, không throw', () => {
    const map = buildIdNameMap([], 'fullName');
    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBe(0);
  });

  test('ghép _id (ObjectId) → giá trị field tên được chỉ định', () => {
    const items = [
      { _id: 'a1', fullName: 'Nguyễn Văn A' },
      { _id: 'a2', fullName: 'Trần Thị B' },
    ];
    const map = buildIdNameMap(items, 'fullName');
    expect(map.get('a1')).toBe('Nguyễn Văn A');
    expect(map.get('a2')).toBe('Trần Thị B');
  });

  test('dùng được với field tên khác (vd label của danh mục vi phạm)', () => {
    const items = [{ _id: 'c1', label: 'Đi học muộn' }];
    const map = buildIdNameMap(items, 'label');
    expect(map.get('c1')).toBe('Đi học muộn');
  });

  test('ép _id không phải string (vd ObjectId) về string làm key', () => {
    const items = [{ _id: { toString: () => 'obj-id-1' }, fullName: 'X' }];
    const map = buildIdNameMap(items, 'fullName');
    expect(map.get('obj-id-1')).toBe('X');
  });
});

describe('getMyPositionsInClass', () => {
  const positions = [
    { id: 'p1', type: 'HOMEROOM', holder: { id: 'u1', fullName: 'GV A' } },
    { id: 'p2', type: 'SUBJECT', holder: { id: 'u2', fullName: 'GV B' } },
    { id: 'p3', type: 'SUBJECT', holder: null },
  ];

  test('ADMIN → trả nguyên mảng positions đầu vào', () => {
    const currentUser = { id: 'u9', role: 'ADMIN' };
    const result = getMyPositionsInClass(positions, currentUser);
    expect(result).toEqual(positions);
  });

  test('TEACHER giữ đúng 1 trong 3 vị trí → trả mảng có đúng 1 phần tử là vị trí đó', () => {
    const currentUser = { id: 'u1', role: 'TEACHER' };
    const result = getMyPositionsInClass(positions, currentUser);
    expect(result).toEqual([positions[0]]);
  });

  test('TEACHER không giữ vị trí nào trong lớp → trả mảng rỗng', () => {
    const currentUser = { id: 'u-khac', role: 'TEACHER' };
    const result = getMyPositionsInClass(positions, currentUser);
    expect(result).toEqual([]);
  });

  test('không có currentUser → trả mảng rỗng, không throw', () => {
    const result = getMyPositionsInClass(positions, null);
    expect(result).toEqual([]);
  });
});

describe('todayDateOnly', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('trả đúng ngày theo giờ ĐỊA PHƯƠNG, không lùi 1 ngày vào buổi sáng sớm (giờ VN UTC+7, lúc điểm danh)', () => {
    // 2026-10-08T23:30:00Z = 06:30 sáng 2026-10-09 giờ VN (UTC+7) — nếu dùng toISOString().slice(0,10) (UTC
    // thuần) sẽ trả nhầm "2026-10-08", đúng lúc giáo viên đang điểm danh đầu giờ sáng.
    jest.useFakeTimers().setSystemTime(new Date('2026-10-08T23:30:00.000Z'));
    expect(todayDateOnly()).toBe('2026-10-09');
  });
});

describe('formatSignedPoints', () => {
  test('số dương → thêm dấu + phía trước', () => {
    expect(formatSignedPoints(10)).toBe('+10');
  });

  test('số âm → giữ nguyên dấu - có sẵn', () => {
    expect(formatSignedPoints(-5)).toBe('-5');
  });

  test('số 0 → "0", không thêm dấu +', () => {
    expect(formatSignedPoints(0)).toBe('0');
  });
});
