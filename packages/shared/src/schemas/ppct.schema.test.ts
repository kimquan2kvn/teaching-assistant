import { createPpctItemSchema, ppctImportCommitSchema, updatePpctItemSchema } from './ppct.schema';

const validItem = { week: 1, periodLabel: '1', title: 'Mở đầu', periodCount: 1, requirement: 'Nắm khái niệm' };

describe('createPpctItemSchema', () => {
  it('chấp nhận mục hợp lệ; note tuỳ chọn', () => {
    expect(createPpctItemSchema.parse(validItem)).toEqual(validItem);
    expect(createPpctItemSchema.parse({ ...validItem, note: 'Ôn tập' }).note).toBe('Ôn tập');
  });

  it.each([0, 11])('từ chối periodCount=%i', (periodCount) => {
    expect(createPpctItemSchema.safeParse({ ...validItem, periodCount }).success).toBe(false);
  });

  it.each([1, 10])('chấp nhận periodCount=%i', (periodCount) => {
    expect(createPpctItemSchema.safeParse({ ...validItem, periodCount }).success).toBe(true);
  });

  it.each([0, 61])('từ chối week=%i', (week) => {
    expect(createPpctItemSchema.safeParse({ ...validItem, week }).success).toBe(false);
  });

  it.each([1, 60])('chấp nhận week=%i', (week) => {
    expect(createPpctItemSchema.safeParse({ ...validItem, week }).success).toBe(true);
  });

  it('week và periodCount phải là số nguyên', () => {
    expect(createPpctItemSchema.safeParse({ ...validItem, week: 1.5 }).success).toBe(false);
    expect(createPpctItemSchema.safeParse({ ...validItem, periodCount: 1.5 }).success).toBe(false);
  });

  it("periodLabel được cắt khoảng trắng ('  TC3 ' -> 'TC3'), chấp nhận '15-16', tối đa 20 ký tự", () => {
    expect(createPpctItemSchema.parse({ ...validItem, periodLabel: '  TC3 ' }).periodLabel).toBe('TC3');
    expect(createPpctItemSchema.safeParse({ ...validItem, periodLabel: '15-16' }).success).toBe(true);
    expect(createPpctItemSchema.safeParse({ ...validItem, periodLabel: 'a'.repeat(20) }).success).toBe(true);
    expect(createPpctItemSchema.safeParse({ ...validItem, periodLabel: 'a'.repeat(21) }).success).toBe(false);
  });

  it('periodLabel và title rỗng (sau khi cắt khoảng trắng) bị từ chối', () => {
    expect(createPpctItemSchema.safeParse({ ...validItem, periodLabel: '   ' }).success).toBe(false);
    expect(createPpctItemSchema.safeParse({ ...validItem, title: '  ' }).success).toBe(false);
  });

  it("requirement bỏ trống thì mặc định ''", () => {
    expect(createPpctItemSchema.parse({ ...validItem, requirement: undefined }).requirement).toBe('');
  });
});

describe('updatePpctItemSchema', () => {
  it('partial KHÔNG chèn lại default: { title } phải ra đúng { title } (không xoá requirement khi PATCH)', () => {
    const parsed = updatePpctItemSchema.parse({ title: 'x' });
    expect(parsed).toEqual({ title: 'x' });
    expect('requirement' in parsed).toBe(false);
  });

  it('vẫn kiểm tra giới hạn của từng field khi gửi', () => {
    expect(updatePpctItemSchema.safeParse({ periodCount: 0 }).success).toBe(false);
    expect(updatePpctItemSchema.safeParse({ week: 61 }).success).toBe(false);
    expect(updatePpctItemSchema.safeParse({ periodLabel: '  ' }).success).toBe(false);
  });

  it('body rỗng là hợp lệ ở tầng schema', () => {
    expect(updatePpctItemSchema.parse({})).toEqual({});
  });
});

describe('ppctImportCommitSchema', () => {
  it('từ chối rows rỗng', () => {
    expect(ppctImportCommitSchema.safeParse({ rows: [] }).success).toBe(false);
  });

  it('chấp nhận đúng 500 dòng, từ chối 501 dòng', () => {
    const makeRows = (count: number) => Array.from({ length: count }, () => validItem);
    expect(ppctImportCommitSchema.safeParse({ rows: makeRows(500) }).success).toBe(true);
    expect(ppctImportCommitSchema.safeParse({ rows: makeRows(501) }).success).toBe(false);
  });

  it('mỗi dòng được kiểm tra như createPpctItemSchema (periodCount sai thì cả lô bị từ chối)', () => {
    expect(ppctImportCommitSchema.safeParse({ rows: [validItem, { ...validItem, periodCount: 0 }] }).success).toBe(false);
  });
});
