import { addDays, formatDateOnly, toVnDayOfWeek } from '../../common/utils/date';
import {
  buildCells,
  computeLessonSchedule,
  KeptLog,
  reserveKeptLogs,
  ScheduleHoliday,
  ScheduleInput,
  ScheduledLesson,
  ScheduleSlot,
  SchedulePpctItem,
} from './lesson-schedule';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const slot = (dayOfWeek: number, period: number, from = '2026-01-05', to: string | null = null) => ({
  dayOfWeek,
  period,
  effectiveFrom: d(from),
  effectiveTo: to ? d(to) : null,
});
const item = (k: number, periodCount = 1) => ({ id: `i${k}`, order: k, periodCount });
const items = (n: number) => Array.from({ length: n }, (_, i) => item(i + 1));
const MON_THU = [slot(2, 1), slot(5, 3)]; // 2 tiết/tuần: Thứ Hai tiết 1, Thứ Năm tiết 3 (2026-01-05 là Thứ Hai)
const run = (over: Partial<ScheduleInput> = {}) =>
  computeLessonSchedule({
    fromDate: d('2026-01-05'),
    yearEnd: d('2026-05-31'),
    slots: MON_THU,
    holidays: [],
    ppctItems: items(5),
    keptLogs: [],
    ...over,
  });
const out = (r: ScheduledLesson[]) => r.map((x) => `${x.ppctItemId}@${formatDateOnly(x.date)}`);

describe('computeLessonSchedule', () => {
  it('1. rải cơ bản: 5 mục PPCT, môn 2 tiết/tuần, không ngày nghỉ', () => {
    expect(out(run())).toEqual(['i1@2026-01-05', 'i2@2026-01-08', 'i3@2026-01-12', 'i4@2026-01-15', 'i5@2026-01-19']);
  });

  it('2. nghỉ giữa tuần: ngày lễ trùng 1 tiết, PPCT dồn lùi 1 ô', () => {
    const result = run({ holidays: [{ startDate: d('2026-01-08'), endDate: d('2026-01-08') }] });
    expect(out(result)).toEqual(['i1@2026-01-05', 'i2@2026-01-12', 'i3@2026-01-15', 'i4@2026-01-19', 'i5@2026-01-22']);
  });

  it('3. nghỉ nhiều ngày liên tiếp (cả tuần bão lũ)', () => {
    const result = run({ holidays: [{ startDate: d('2026-01-12'), endDate: d('2026-01-18') }] });
    expect(out(result)).toEqual(['i1@2026-01-05', 'i2@2026-01-08', 'i3@2026-01-19', 'i4@2026-01-22', 'i5@2026-01-26']);
  });

  it('4. thêm ngày nghỉ sau khi đã rải: chỉ tính lại từ fromDate, phần trước không đổi', () => {
    const result = run({
      fromDate: d('2026-01-15'),
      holidays: [{ startDate: d('2026-01-15'), endDate: d('2026-01-15') }],
      keptLogs: [
        { ppctItemId: 'i1', date: d('2026-01-05') },
        { ppctItemId: 'i2', date: d('2026-01-08') },
        { ppctItemId: 'i3', date: d('2026-01-12') },
      ],
    });
    expect(out(result)).toEqual(['i4@2026-01-19', 'i5@2026-01-22']);
  });

  it('5. đổi TKB: tính lại từ effectiveFrom mới', () => {
    const result = run({
      slots: [slot(2, 1, '2026-01-05', '2026-01-18'), slot(3, 2, '2026-01-19')],
      fromDate: d('2026-01-19'),
      ppctItems: items(4),
      keptLogs: [
        { ppctItemId: 'i1', date: d('2026-01-05') },
        { ppctItemId: 'i2', date: d('2026-01-12') },
      ],
    });
    expect(out(result)).toEqual(['i3@2026-01-20', 'i4@2026-01-27']);
  });

  it('6. số tiết/tuần đổi theo giai đoạn (2 rồi 3 tiết/tuần)', () => {
    const result = run({
      slots: [
        slot(2, 1, '2026-01-05', '2026-01-18'),
        slot(5, 3, '2026-01-05', '2026-01-18'),
        slot(2, 1, '2026-01-19'),
        slot(4, 2, '2026-01-19'),
        slot(6, 4, '2026-01-19'),
      ],
      ppctItems: items(8),
    });
    expect(out(result)).toEqual([
      'i1@2026-01-05',
      'i2@2026-01-08',
      'i3@2026-01-12',
      'i4@2026-01-15',
      'i5@2026-01-19',
      'i6@2026-01-21',
      'i7@2026-01-23',
      'i8@2026-01-26',
    ]);
  });

  it('7. tiết TC xen kẽ CK (1,2,TC1,3): chỉ order quyết định, không phải thứ tự mảng', () => {
    const result = run({ ppctItems: [item(4), item(3), item(1), item(2)] });
    expect(out(result)).toEqual(['i1@2026-01-05', 'i2@2026-01-08', 'i3@2026-01-12', 'i4@2026-01-15']);
  });

  it('8. tiết CĐ xen kẽ: chỉ order/periodCount được đọc, nhãn trong id không có nghĩa', () => {
    const result = run({
      ppctItems: [
        { id: 'k1', order: 1, periodCount: 1 },
        { id: 'cd1', order: 2, periodCount: 1 },
        { id: 'cd2', order: 3, periodCount: 1 },
        { id: 'k2', order: 4, periodCount: 1 },
      ],
    });
    expect(out(result)).toEqual(['k1@2026-01-05', 'cd1@2026-01-08', 'cd2@2026-01-12', 'k2@2026-01-15']);
  });

  it('9a. periodCount=2 chiếm 2 ô liên tiếp, tràn sang ngày kế', () => {
    const result = run({ ppctItems: [item(1), item(2, 2), item(3)] });
    expect(out(result)).toEqual(['i1@2026-01-05', 'i2@2026-01-08', 'i3@2026-01-15']);
  });

  it('9b. periodCount=2 chiếm 2 ô cùng ngày', () => {
    const result = run({ slots: [slot(2, 1), slot(2, 2)], ppctItems: [item(1, 2), item(2)] });
    expect(out(result)).toEqual(['i1@2026-01-05', 'i2@2026-01-12']);
  });

  it('10. log khóa tay được giữ nguyên, phần còn lại rải quanh nó', () => {
    const result = run({ ppctItems: items(4), keptLogs: [{ ppctItemId: 'i2', date: d('2026-01-12') }] });
    expect(out(result)).toEqual(['i1@2026-01-05', 'i3@2026-01-08', 'i4@2026-01-15']);
  });

  it('11. log khóa do done không bị dời; các mục sau lấp ô trống phía trước nó', () => {
    const result = run({ ppctItems: items(3), keptLogs: [{ ppctItemId: 'i1', date: d('2026-01-08') }] });
    expect(out(result)).toEqual(['i2@2026-01-05', 'i3@2026-01-12']);
  });

  it('12a. PPCT dài hơn số ô còn lại: phần dư không được xếp, không lỗi', () => {
    const result = run({ yearEnd: d('2026-01-19'), ppctItems: items(7) });
    expect(out(result)).toEqual(['i1@2026-01-05', 'i2@2026-01-08', 'i3@2026-01-12', 'i4@2026-01-15', 'i5@2026-01-19']);
  });

  it('12b. mục cần nhiều ô hơn số ô còn lại thì dừng hẳn, mục sau không được xếp dù còn ô', () => {
    const result = run({
      yearEnd: d('2026-01-15'),
      ppctItems: [item(1), item(2), item(3), item(4, 2), item(5)],
    });
    expect(out(result)).toEqual(['i1@2026-01-05', 'i2@2026-01-08', 'i3@2026-01-12']);
  });

  it('13. slot Thứ Bảy vẫn được xếp tiết (engine không đọc saturdayIsSchoolDay)', () => {
    const result = run({ slots: [slot(7, 1)], ppctItems: items(2) });
    expect(out(result)).toEqual(['i1@2026-01-10', 'i2@2026-01-17']);
  });

  it('15. log khóa nằm đúng ngày nghỉ chiếm ô tự do đầu tiên sau đó', () => {
    const result = run({
      holidays: [{ startDate: d('2026-01-08'), endDate: d('2026-01-08') }],
      ppctItems: items(3),
      keptLogs: [{ ppctItemId: 'i1', date: d('2026-01-08') }],
    });
    expect(out(result)).toEqual(['i2@2026-01-05', 'i3@2026-01-15']);
  });

  it('16a. fromDate sau yearEnd thì không xếp gì', () => {
    expect(run({ fromDate: d('2026-06-01'), yearEnd: d('2026-05-31') })).toEqual([]);
  });

  it('16b. không có slot thì không xếp gì', () => {
    expect(run({ slots: [] })).toEqual([]);
  });

  it('17. effectiveTo bao gồm cả ngày cuối', () => {
    const result = run({ slots: [slot(2, 1, '2026-01-05', '2026-01-12')], ppctItems: items(3) });
    expect(out(result)).toEqual(['i1@2026-01-05', 'i2@2026-01-12']);
  });

  it('log chưa khóa có date < fromDate vẫn được coi là đã xếp (không xếp trùng mục)', () => {
    const result = run({
      fromDate: d('2026-01-12'),
      ppctItems: items(3),
      keptLogs: [{ ppctItemId: 'i1', date: d('2026-01-05') }],
    });
    expect(out(result)).toEqual(['i2@2026-01-12', 'i3@2026-01-15']);
  });

  it('log của mục không còn trong PPCT bị bỏ qua, không chiếm ô', () => {
    const result = run({ ppctItems: items(2), keptLogs: [{ ppctItemId: 'ghost', date: d('2026-01-05') }] });
    expect(out(result)).toEqual(['i1@2026-01-05', 'i2@2026-01-08']);
  });

  it('19. không mutate input và chạy 2 lần cho kết quả bằng nhau', () => {
    const slots = Object.freeze(MON_THU.map((s) => Object.freeze({ ...s })));
    const holidays = Object.freeze([Object.freeze({ startDate: d('2026-01-08'), endDate: d('2026-01-08') })]);
    const ppctItems = Object.freeze([item(3), item(1), item(2, 2)].map((x) => Object.freeze(x)));
    const keptLogs = Object.freeze([Object.freeze({ ppctItemId: 'i1', date: d('2026-01-12') })]);
    const fromDate = d('2026-01-05');
    const yearEnd = d('2026-05-31');
    const before = JSON.stringify({ slots, holidays, ppctItems, keptLogs, fromDate, yearEnd });
    const input: ScheduleInput = {
      fromDate,
      yearEnd,
      slots: slots as never,
      holidays: holidays as never,
      ppctItems: ppctItems as never,
      keptLogs: keptLogs as never,
    };

    const first = out(computeLessonSchedule(input));
    const second = out(computeLessonSchedule(input));

    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
    expect(JSON.stringify({ slots, holidays, ppctItems, keptLogs, fromDate, yearEnd })).toBe(before);
  });
});

describe('log được giữ có periodCount > 1 bắt đầu trước fromDate vẫn chiếm các ô từ fromDate trở đi', () => {
  const MULTI_ITEMS = [item(1), item(2, 2), item(3), item(4)];
  const KEPT_BEFORE_SECOND_CELL: KeptLog[] = [
    { ppctItemId: 'i1', date: d('2026-01-05') },
    { ppctItemId: 'i2', date: d('2026-01-08') },
  ];

  it('đối chứng: tính từ đầu, i2 chiếm 01-08 và 01-12, i3 vào 01-15, i4 vào 01-19', () => {
    expect(out(run({ ppctItems: MULTI_ITEMS }))).toEqual(['i1@2026-01-05', 'i2@2026-01-08', 'i3@2026-01-15', 'i4@2026-01-19']);
  });

  it('fromDate=01-10 (giữa 2 ô của i2): i3, i4 không chèn vào ô thứ 2 của i2, ra đúng như tính từ đầu', () => {
    const result = run({ fromDate: d('2026-01-10'), ppctItems: MULTI_ITEMS, keptLogs: KEPT_BEFORE_SECOND_CELL });
    expect(out(result)).toEqual(['i3@2026-01-15', 'i4@2026-01-19']);
  });

  it('ngày nghỉ 01-12 rơi vào ô thứ 2 của i2, tính từ 01-12: i2 lấy ô kế tiếp còn lại (01-15) nên i3, i4 lùi', () => {
    const result = run({
      fromDate: d('2026-01-12'),
      holidays: [{ startDate: d('2026-01-12'), endDate: d('2026-01-12') }],
      ppctItems: MULTI_ITEMS,
      keptLogs: KEPT_BEFORE_SECOND_CELL,
    });
    expect(out(result)).toEqual(['i3@2026-01-19', 'i4@2026-01-22']);
  });

  it('log quá khứ mà ngày của nó không còn ô không được chiếm mất ô của log quá khứ khác (TKB đổi ngoài luồng)', () => {
    const result = run({
      fromDate: d('2026-01-15'),
      slots: [slot(2, 1)],
      keptLogs: [
        { ppctItemId: 'i1', date: d('2026-01-05'), locked: false },
        { ppctItemId: 'i2', date: d('2026-01-08'), locked: false },
        { ppctItemId: 'i3', date: d('2026-01-12'), locked: false },
      ],
    });
    expect(out(result)).toEqual(['i4@2026-01-19', 'i5@2026-01-26']);
  });
});

describe('bất biến: tính lại từ BẤT KỲ fromDate nào cho đúng lịch như tính lại từ đầu năm', () => {
  const YEAR_END = d('2026-05-31');
  const FIRST_DAY = d('2026-01-05');
  const LAST_PROBE_DAY = d('2026-04-30');
  const periodCounts = (counts: number[]): SchedulePpctItem[] => counts.map((count, i) => item(i + 1, count));
  const holiday = (from: string, to = from): ScheduleHoliday => ({ startDate: d(from), endDate: d(to) });
  const at = (ppctItemId: string, date: string): KeptLog => ({ ppctItemId, date: d(date) });

  interface Fixture {
    name: string;
    slots: ScheduleSlot[];
    holidays: ScheduleHoliday[];
    ppctItems: SchedulePpctItem[];
    // Log bị khóa (done / kéo tay): cố định ngày, cả hai cách tính đều phải giữ nguyên.
    locked: KeptLog[];
  }

  const MIXED_COUNTS = [1, 2, 1, 3, 1, 2, 1, 1, 2, 1, 1, 1];
  const fixtures: Fixture[] = [
    { name: 'bài 2-3 tiết, không ngày nghỉ', slots: MON_THU, holidays: [], ppctItems: periodCounts(MIXED_COUNTS), locked: [] },
    {
      name: 'ngày nghỉ rơi vào ô thứ 2/3 của bài nhiều tiết + nghỉ cả tuần',
      slots: MON_THU,
      holidays: [holiday('2026-01-12'), holiday('2026-01-22'), holiday('2026-02-02', '2026-02-08')],
      ppctItems: periodCounts(MIXED_COUNTS),
      locked: [],
    },
    {
      name: 'nhiều tiết trong ngày + slot Thứ Bảy',
      slots: [slot(2, 1), slot(2, 2), slot(5, 3), slot(7, 1)],
      holidays: [holiday('2026-01-10')],
      ppctItems: periodCounts([2, 1, 3, 1, 2, 2, 1, 3, 1, 1]),
      locked: [],
    },
    {
      name: 'đổi TKB giữa chừng (2 rồi 3 tiết/tuần)',
      slots: [
        slot(2, 1, '2026-01-05', '2026-01-18'),
        slot(5, 3, '2026-01-05', '2026-01-18'),
        slot(2, 1, '2026-01-19'),
        slot(4, 2, '2026-01-19'),
        slot(6, 4, '2026-01-19'),
      ],
      holidays: [holiday('2026-01-26')],
      ppctItems: periodCounts(MIXED_COUNTS),
      locked: [],
    },
    {
      name: 'log done xen giữa các bài nhiều tiết',
      slots: MON_THU,
      holidays: [holiday('2026-01-12')],
      ppctItems: periodCounts(MIXED_COUNTS),
      locked: [at('i3', '2026-01-15'), at('i6', '2026-02-02')],
    },
    {
      name: 'log khóa nằm đúng ngày nghỉ (trôi sang ô kế tiếp)',
      slots: MON_THU,
      holidays: [holiday('2026-01-12'), holiday('2026-01-26')],
      ppctItems: periodCounts(MIXED_COUNTS),
      locked: [at('i3', '2026-01-12'), at('i5', '2026-01-26')],
    },
    {
      name: 'log kéo tay vào đúng giữa độ dài của bài nhiều tiết đứng trước nó',
      slots: MON_THU,
      holidays: [],
      ppctItems: periodCounts([1, 2, 1, 1, 3, 1, 1]),
      locked: [at('i4', '2026-01-12'), at('i7', '2026-01-19')],
    },
  ];

  // Mô phỏng đúng cách LessonLogEngineService chọn log được giữ: mọi log có date < fromDate + mọi log khóa.
  function recomputeFrom(fixture: Fixture, baseline: Map<string, Date>, fromDate: Date, withLockFlags: boolean) {
    const lockedIds = new Set(fixture.locked.map((log) => log.ppctItemId));
    const keptLogs: KeptLog[] = [];
    for (const [ppctItemId, date] of baseline) {
      const isLocked = lockedIds.has(ppctItemId);
      if (date.getTime() >= fromDate.getTime() && !isLocked) continue;
      keptLogs.push(withLockFlags ? { ppctItemId, date, locked: isLocked } : { ppctItemId, date });
    }
    const scheduled = computeLessonSchedule({
      fromDate,
      yearEnd: YEAR_END,
      slots: fixture.slots,
      holidays: fixture.holidays,
      ppctItems: fixture.ppctItems,
      keptLogs,
    });
    return { keptLogs, scheduled };
  }

  describe.each([
    ['log được giữ có cờ locked như service truyền', true],
    ['log được giữ không có cờ locked (KeptLog thuần)', false],
  ])('%s', (_label, withLockFlags) => {
    it.each(fixtures)('$name', (fixture) => {
      const fromScratch = computeLessonSchedule({
        fromDate: FIRST_DAY,
        yearEnd: YEAR_END,
        slots: fixture.slots,
        holidays: fixture.holidays,
        ppctItems: fixture.ppctItems,
        keptLogs: fixture.locked,
      });
      expect(fromScratch.length + fixture.locked.length).toBeGreaterThanOrEqual(fixture.ppctItems.length - 2);
      const baseline = new Map<string, Date>(fixture.locked.map((log) => [log.ppctItemId, log.date]));
      for (const lesson of fromScratch) baseline.set(lesson.ppctItemId, lesson.date);

      for (let from = FIRST_DAY; from.getTime() <= LAST_PROBE_DAY.getTime(); from = addDays(from, 1)) {
        const { keptLogs, scheduled } = recomputeFrom(fixture, baseline, from, withLockFlags);
        const keptIds = new Set(keptLogs.map((log) => log.ppctItemId));
        const expected = fromScratch.filter((lesson) => !keptIds.has(lesson.ppctItemId));

        expect({ from: formatDateOnly(from), dates: out(scheduled) }).toEqual({
          from: formatDateOnly(from),
          dates: out(expected),
        });
      }
    });
  });
});

describe('buildCells', () => {
  const cellKeys = (cells: { date: Date; period: number }[]) => cells.map((c) => `${formatDateOnly(c.date)}#${c.period}`);

  it('14. slot Thứ Hai–Thứ Bảy tiết 1 trong 2 tuần → 12 ô, không ô nào rơi vào Chủ Nhật', () => {
    const slots = [2, 3, 4, 5, 6, 7].map((day) => slot(day, 1));
    const cells = buildCells({ slots, holidays: [], from: d('2026-01-05'), to: d('2026-01-18') });
    expect(cells).toHaveLength(12);
    expect(cells.some((c) => toVnDayOfWeek(c.date) === 1)).toBe(false);
  });

  it('sắp theo ngày rồi tiết tăng dần, khử trùng (ngày, tiết) khi 2 slot chồng nhau', () => {
    const slots = [slot(2, 3), slot(2, 1), slot(2, 3, '2026-01-05', '2026-01-12')];
    const cells = buildCells({ slots, holidays: [], from: d('2026-01-05'), to: d('2026-01-12') });
    expect(cellKeys(cells)).toEqual(['2026-01-05#1', '2026-01-05#3', '2026-01-12#1', '2026-01-12#3']);
  });

  it('bỏ ngày thuộc ngày nghỉ, gồm cả hai đầu khoảng nghỉ', () => {
    const cells = buildCells({
      slots: [slot(2, 1)],
      holidays: [{ startDate: d('2026-01-12'), endDate: d('2026-01-19') }],
      from: d('2026-01-05'),
      to: d('2026-01-26'),
    });
    expect(cellKeys(cells)).toEqual(['2026-01-05#1', '2026-01-26#1']);
  });

  it('chỉ lấy ô trong khoảng hiệu lực của slot và trong from..to (gồm cả hai đầu)', () => {
    const cells = buildCells({
      slots: [slot(2, 1, '2026-01-12', '2026-01-19')],
      holidays: [],
      from: d('2026-01-05'),
      to: d('2026-01-26'),
    });
    expect(cellKeys(cells)).toEqual(['2026-01-12#1', '2026-01-19#1']);
  });
});

describe('reserveKeptLogs', () => {
  const fiveCells = () => buildCells({ slots: MON_THU, holidays: [], from: d('2026-01-05'), to: d('2026-01-19') });

  it('18. log khóa chiếm đúng ô của nó: placements trỏ ô đó và freeCells bớt 1', () => {
    const { freeCells, placements } = reserveKeptLogs(fiveCells(), [{ ppctItemId: 'i2', date: d('2026-01-12') }], items(5));
    expect(formatDateOnly(placements.get('i2')?.date as Date)).toBe('2026-01-12');
    expect(freeCells).toHaveLength(4);
  });

  it('xử lý theo thứ tự (date, order): log cùng ngày thì mục có order nhỏ hơn chọn trước', () => {
    const { placements } = reserveKeptLogs(
      fiveCells(),
      [
        { ppctItemId: 'i2', date: d('2026-01-05') },
        { ppctItemId: 'i1', date: d('2026-01-05') },
      ],
      items(2),
    );
    expect(formatDateOnly(placements.get('i1')?.date as Date)).toBe('2026-01-05');
    expect(formatDateOnly(placements.get('i2')?.date as Date)).toBe('2026-01-08');
  });

  it('mục periodCount=2 chiếm 2 ô tự do liên tiếp kể từ date; placement là ô đầu', () => {
    const { freeCells, placements } = reserveKeptLogs(fiveCells(), [{ ppctItemId: 'i1', date: d('2026-01-08') }], [item(1, 2)]);
    expect(formatDateOnly(placements.get('i1')?.date as Date)).toBe('2026-01-08');
    expect(freeCells.map((c) => formatDateOnly(c.date))).toEqual(['2026-01-05', '2026-01-15', '2026-01-19']);
  });

  it('thiếu ô thì lấy phần có; không còn ô nào sau date thì không có placement', () => {
    const afterAll = reserveKeptLogs(fiveCells(), [{ ppctItemId: 'i1', date: d('2026-02-01') }], items(1));
    expect(afterAll.placements.has('i1')).toBe(false);
    expect(afterAll.freeCells).toHaveLength(5);

    const partial = reserveKeptLogs(fiveCells(), [{ ppctItemId: 'i1', date: d('2026-01-15') }], [item(1, 3)]);
    expect(partial.freeCells.map((c) => formatDateOnly(c.date))).toEqual(['2026-01-05', '2026-01-08', '2026-01-12']);
  });

  it('bỏ qua log của mục không có trong ppctItems (không chiếm ô, không có placement)', () => {
    const { freeCells, placements } = reserveKeptLogs(fiveCells(), [{ ppctItemId: 'ghost', date: d('2026-01-05') }], items(2));
    expect(placements.size).toBe(0);
    expect(freeCells).toHaveLength(5);
  });
});
