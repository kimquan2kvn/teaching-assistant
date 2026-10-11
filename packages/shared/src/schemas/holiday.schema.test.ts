import { createHolidaySchema, updateHolidaySchema } from './holiday.schema';

const SCHOOL_YEAR_ID = '64b7f0f2a1b2c3d4e5f60718';

const validHoliday = {
  schoolYearId: SCHOOL_YEAR_ID,
  startDate: '2026-02-16',
  endDate: '2026-02-22',
  type: 'LE',
  name: 'Nghỉ Tết Nguyên đán',
};

describe('createHolidaySchema', () => {
  it('chấp nhận ngày nghỉ hợp lệ và đổi ngày thành Date 00:00 UTC', () => {
    const parsed = createHolidaySchema.parse(validHoliday);
    expect(parsed.startDate.toISOString()).toBe('2026-02-16T00:00:00.000Z');
    expect(parsed.endDate.toISOString()).toBe('2026-02-22T00:00:00.000Z');
    expect(parsed.type).toBe('LE');
    expect(parsed.schoolYearId).toBe(SCHOOL_YEAR_ID);
  });

  it('endDate trước startDate: lỗi ở path endDate với message tiếng Việt', () => {
    const result = createHolidaySchema.safeParse({ ...validHoliday, startDate: '2026-02-22', endDate: '2026-02-16' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0].message).toBe('Ngày kết thúc không được trước ngày bắt đầu');
    expect(result.error.issues[0].path).toEqual(['endDate']);
  });

  it('nghỉ đúng 1 ngày (startDate = endDate) là hợp lệ', () => {
    expect(createHolidaySchema.safeParse({ ...validHoliday, startDate: '2026-09-02', endDate: '2026-09-02' }).success).toBe(
      true,
    );
  });

  it.each(['LE', 'DOT_XUAT', 'KHAC'])('chấp nhận loại %s', (type) => {
    expect(createHolidaySchema.safeParse({ ...validHoliday, type }).success).toBe(true);
  });

  it('từ chối loại ngoài enum (TET)', () => {
    expect(createHolidaySchema.safeParse({ ...validHoliday, type: 'TET' }).success).toBe(false);
  });

  it('từ chối tên rỗng hoặc chỉ gồm khoảng trắng', () => {
    expect(createHolidaySchema.safeParse({ ...validHoliday, name: '  ' }).success).toBe(false);
    expect(createHolidaySchema.safeParse({ ...validHoliday, name: '' }).success).toBe(false);
  });

  it('cắt khoảng trắng đầu/cuối của tên', () => {
    expect(createHolidaySchema.parse({ ...validHoliday, name: '  Quốc khánh ' }).name).toBe('Quốc khánh');
  });

  it('từ chối thiếu schoolYearId', () => {
    expect(createHolidaySchema.safeParse({ ...validHoliday, schoolYearId: undefined }).success).toBe(false);
  });

  it('ngày sai định dạng bị từ chối với message tiếng Việt của dateOnlySchema', () => {
    const result = createHolidaySchema.safeParse({ ...validHoliday, startDate: '16/02/2026' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0].message).toBe('Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd');
  });
});

describe('updateHolidaySchema', () => {
  it('mọi field tuỳ chọn: chỉ gửi type thì ra đúng { type }', () => {
    expect(updateHolidaySchema.parse({ type: 'LE' })).toEqual({ type: 'LE' });
  });

  it('bỏ schoolYearId nếu gửi kèm (không được đổi năm học của ngày nghỉ)', () => {
    const parsed = updateHolidaySchema.parse({ type: 'LE', schoolYearId: SCHOOL_YEAR_ID });
    expect(parsed).toEqual({ type: 'LE' });
    expect('schoolYearId' in parsed).toBe(false);
  });

  it('chỉ gửi 1 trong 2 ngày thì không so sánh (service tự kiểm tra với giá trị đã lưu)', () => {
    expect(updateHolidaySchema.safeParse({ endDate: '2026-02-01' }).success).toBe(true);
    expect(updateHolidaySchema.safeParse({ startDate: '2026-02-01' }).success).toBe(true);
  });

  it('gửi cả 2 ngày mà endDate trước startDate: lỗi ở path endDate', () => {
    const result = updateHolidaySchema.safeParse({ startDate: '2026-02-22', endDate: '2026-02-16' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0].message).toBe('Ngày kết thúc không được trước ngày bắt đầu');
    expect(result.error.issues[0].path).toEqual(['endDate']);
  });

  it('body rỗng là hợp lệ ở tầng schema; từ chối name rỗng và type sai', () => {
    expect(updateHolidaySchema.safeParse({}).success).toBe(true);
    expect(updateHolidaySchema.safeParse({ name: '  ' }).success).toBe(false);
    expect(updateHolidaySchema.safeParse({ type: 'TET' }).success).toBe(false);
  });
});
