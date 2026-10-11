import { dateOnlySchema } from './date-only.schema';

describe('dateOnlySchema', () => {
  it('parse yyyy-mm-dd thành Date lúc 00:00 UTC của đúng ngày đó', () => {
    expect(dateOnlySchema.parse('2026-01-19').toISOString()).toBe('2026-01-19T00:00:00.000Z');
  });

  it('chấp nhận ngày nhuận 29/02 của năm nhuận', () => {
    expect(dateOnlySchema.parse('2028-02-29').toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });

  it.each(['2026-02-30', '19/01/2026', '2026-01-19T20:00:00+07:00', '', '2026-13-01', '2027-02-29'])(
    'từ chối %p bằng issue custom với message tiếng Việt',
    (input) => {
      const result = dateOnlySchema.safeParse(input);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0].code).toBe('custom');
      expect(result.error.issues[0].message).toBe('Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd');
    },
  );

  it('từ chối giá trị không phải chuỗi (không âm thầm ép kiểu)', () => {
    expect(dateOnlySchema.safeParse(20260119).success).toBe(false);
    expect(dateOnlySchema.safeParse(null).success).toBe(false);
  });
});
