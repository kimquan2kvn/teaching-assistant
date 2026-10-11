import { getPeriodKind, toCommitRow, validatePpctRow } from './ppct';

const VALID_ROW = { week: '3', title: 'Bài 3', periodCount: '1', periodLabel: '3' };

const WEEK_ERROR = 'Tuần phải là số nguyên từ 1 đến 60';
const TITLE_EMPTY_ERROR = 'Bài học không được để trống';
const TITLE_LONG_ERROR = 'Bài học quá dài (tối đa 300 ký tự)';
const PERIOD_COUNT_ERROR = 'Số tiết phải là số nguyên từ 1 đến 10';
const PERIOD_LABEL_EMPTY_ERROR = 'Tiết thứ không được để trống';
const PERIOD_LABEL_LONG_ERROR = 'Tiết thứ quá dài (tối đa 20 ký tự)';
const REQUIREMENT_LONG_ERROR = 'Yêu cầu cần đạt quá dài (tối đa 1000 ký tự)';
const NOTE_LONG_ERROR = 'Ghi chú quá dài (tối đa 500 ký tự)';

describe('getPeriodKind', () => {
  test.each([
    ['1', 'CK'],
    ['15-16', 'CK'],
    ['TC3', 'TC'],
    [' tc1 ', 'TC'],
    ['CĐ2', 'CĐ'],
    ['cđ2', 'CĐ'],
    ['CD2', 'CĐ'],
  ])('nhãn %j là loại %s', (periodLabel, kind) => {
    expect(getPeriodKind(periodLabel)).toBe(kind);
  });

  test.each([[''], ['  '], [undefined], [null]])('nhãn %j không có loại (null)', (periodLabel) => {
    expect(getPeriodKind(periodLabel)).toBeNull();
  });
});

describe('validatePpctRow', () => {
  test('dòng hợp lệ (số dạng chuỗi như lấy từ <input>) không có lỗi', () => {
    expect(validatePpctRow(VALID_ROW)).toEqual([]);
  });

  test('chấp nhận cả số thật lẫn chuỗi số, kể cả khoảng trắng hai đầu và 2 giá trị biên', () => {
    expect(validatePpctRow({ ...VALID_ROW, week: 3, periodCount: 1 })).toEqual([]);
    expect(validatePpctRow({ ...VALID_ROW, week: 1, periodCount: 1 })).toEqual([]);
    expect(validatePpctRow({ ...VALID_ROW, week: 60, periodCount: 10 })).toEqual([]);
    expect(validatePpctRow({ ...VALID_ROW, week: ' 12 ', periodCount: '10' })).toEqual([]);
  });

  test.each([[0], [61], [1.5], [''], [null], [undefined], ['abc']])('tuần %j sai', (week) => {
    expect(validatePpctRow({ ...VALID_ROW, week })).toEqual([WEEK_ERROR]);
  });

  // Backend (ppct-import.ts) chỉ nhận chuỗi số nguyên không dấu: Number() sẽ nhận cả '1e1', '0x10'.
  test.each([['1e1'], ['0x10'], ['+5'], ['-1'], ['3.0']])('tuần dạng chuỗi %j không phải số nguyên không dấu', (week) => {
    expect(validatePpctRow({ ...VALID_ROW, week })).toEqual([WEEK_ERROR]);
  });

  test.each([[''], ['   '], [undefined]])('bài học %j bị coi là trống', (title) => {
    expect(validatePpctRow({ ...VALID_ROW, title })).toEqual([TITLE_EMPTY_ERROR]);
  });

  test('bài học đúng 300 ký tự hợp lệ, 301 ký tự quá dài; độ dài tính sau khi cắt khoảng trắng như backend', () => {
    expect(validatePpctRow({ ...VALID_ROW, title: 'a'.repeat(300) })).toEqual([]);
    expect(validatePpctRow({ ...VALID_ROW, title: ` ${'a'.repeat(300)} ` })).toEqual([]);
    expect(validatePpctRow({ ...VALID_ROW, title: 'a'.repeat(301) })).toEqual([TITLE_LONG_ERROR]);
  });

  test.each([[0], [11], [2.5], ['']])('số tiết %j sai', (periodCount) => {
    expect(validatePpctRow({ ...VALID_ROW, periodCount })).toEqual([PERIOD_COUNT_ERROR]);
  });

  test('tiết thứ trống bị báo; đúng 20 ký tự hợp lệ, 21 ký tự quá dài (khớp giới hạn backend)', () => {
    expect(validatePpctRow({ ...VALID_ROW, periodLabel: '  ' })).toEqual([PERIOD_LABEL_EMPTY_ERROR]);
    expect(validatePpctRow({ ...VALID_ROW, periodLabel: '1'.repeat(20) })).toEqual([]);
    expect(validatePpctRow({ ...VALID_ROW, periodLabel: '1'.repeat(21) })).toEqual([PERIOD_LABEL_LONG_ERROR]);
  });

  test('yêu cầu cần đạt: đúng 1000 ký tự hợp lệ, 1001 quá dài; vắng mặt hoặc null là hợp lệ', () => {
    expect(validatePpctRow({ ...VALID_ROW, requirement: 'r'.repeat(1000) })).toEqual([]);
    expect(validatePpctRow({ ...VALID_ROW, requirement: 'r'.repeat(1001) })).toEqual([REQUIREMENT_LONG_ERROR]);
    expect(validatePpctRow({ ...VALID_ROW, requirement: null })).toEqual([]);
  });

  test('ghi chú: đúng 500 ký tự hợp lệ, 501 quá dài; vắng mặt hoặc null là hợp lệ', () => {
    expect(validatePpctRow({ ...VALID_ROW, note: 'n'.repeat(500) })).toEqual([]);
    expect(validatePpctRow({ ...VALID_ROW, note: 'n'.repeat(501) })).toEqual([NOTE_LONG_ERROR]);
    expect(validatePpctRow({ ...VALID_ROW, note: null })).toEqual([]);
  });

  test('nhiều lỗi: đúng thứ tự tuần, bài học, số tiết, tiết thứ, yêu cầu, ghi chú', () => {
    expect(validatePpctRow({ week: 0, title: '', periodCount: 0, periodLabel: '' })).toEqual([
      WEEK_ERROR,
      TITLE_EMPTY_ERROR,
      PERIOD_COUNT_ERROR,
      PERIOD_LABEL_EMPTY_ERROR,
    ]);
    expect(
      validatePpctRow({
        week: 61,
        title: 'a'.repeat(301),
        periodCount: 11,
        periodLabel: '1'.repeat(21),
        requirement: 'r'.repeat(1001),
        note: 'n'.repeat(501),
      }),
    ).toEqual([WEEK_ERROR, TITLE_LONG_ERROR, PERIOD_COUNT_ERROR, PERIOD_LABEL_LONG_ERROR, REQUIREMENT_LONG_ERROR, NOTE_LONG_ERROR]);
  });

  test('dòng preview từ backend có tuần/số tiết null (ô sai) vẫn kiểm được, bỏ qua các khóa phụ', () => {
    const previewRow = {
      rowNumber: 4,
      week: null,
      title: 'Bài 4',
      periodCount: null,
      periodLabel: '4',
      requirement: '',
      note: '',
      errors: [WEEK_ERROR, PERIOD_COUNT_ERROR],
    };
    expect(validatePpctRow(previewRow)).toEqual([WEEK_ERROR, PERIOD_COUNT_ERROR]);
  });
});

describe('toCommitRow', () => {
  test('ép số, cắt khoảng trắng, requirement thiếu thành chuỗi rỗng và KHÔNG có khóa note khi note trống', () => {
    const result = toCommitRow({
      week: '2',
      periodLabel: ' 2 ',
      title: ' Bài 2 ',
      periodCount: '1',
      requirement: undefined,
      note: '  ',
    });
    expect(result).toStrictEqual({ week: 2, periodLabel: '2', title: 'Bài 2', periodCount: 1, requirement: '' });
    expect(result).not.toHaveProperty('note');
  });

  test('note có nội dung thì được giữ (đã cắt khoảng trắng)', () => {
    expect(toCommitRow({ ...VALID_ROW, requirement: ' Yêu cầu ', note: ' Ghi ' })).toStrictEqual({
      week: 3,
      periodLabel: '3',
      title: 'Bài 3',
      periodCount: 1,
      requirement: 'Yêu cầu',
      note: 'Ghi',
    });
  });

  test('chỉ giữ đúng các trường backend nhận: bỏ rowNumber, errors của dòng preview', () => {
    const result = toCommitRow({
      rowNumber: 7,
      week: 5,
      title: 'Bài 5',
      periodCount: 2,
      periodLabel: '5-6',
      requirement: '',
      note: '',
      errors: [],
    });
    expect(Object.keys(result).sort()).toEqual(['periodCount', 'periodLabel', 'requirement', 'title', 'week']);
    expect(result).toMatchObject({ week: 5, periodCount: 2, periodLabel: '5-6' });
  });
});
