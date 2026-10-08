import { createStudentSchema, markTransferredSchema, importConfirmSchema } from './student.schema';

describe('createStudentSchema', () => {
  it('yêu cầu fullName, dob tuỳ chọn', () => {
    expect(createStudentSchema.safeParse({ fullName: 'Nguyễn Văn A' }).success).toBe(true);
    expect(createStudentSchema.safeParse({ fullName: '' }).success).toBe(false);
  });

  it('dob: null hoặc chuỗi rỗng được coi là "không có ngày sinh", KHÔNG bị coerce thành 1970-01-01', () => {
    // z.coerce.date() coi `new Date(null)` (epoch) là ngày hợp lệ — phải chặn null/'' trước khi coerce,
    // nếu không 1 dòng import có ô ngày sinh bị parse lỗi (preview trả dob: null do JSON.stringify một
    // Invalid Date) sẽ lưu thành 01/01/1970 mà không có cảnh báo nào ở tầng validate.
    const resultNull = createStudentSchema.safeParse({ fullName: 'A', dob: null });
    expect(resultNull.success).toBe(true);
    expect(resultNull.success && resultNull.data.dob).toBeUndefined();

    const resultEmpty = createStudentSchema.safeParse({ fullName: 'A', dob: '' });
    expect(resultEmpty.success).toBe(true);
    expect(resultEmpty.success && resultEmpty.data.dob).toBeUndefined();
  });
});

describe('markTransferredSchema', () => {
  it('yêu cầu transferDate và transferReason không rỗng', () => {
    expect(
      markTransferredSchema.safeParse({ transferDate: '2026-01-15', transferReason: 'Chuyển trường' }).success,
    ).toBe(true);
    expect(markTransferredSchema.safeParse({ transferDate: '2026-01-15', transferReason: '' }).success).toBe(false);
  });
});

describe('importConfirmSchema', () => {
  it('yêu cầu rows là mảng không rỗng, mỗi phần tử có fullName', () => {
    expect(importConfirmSchema.safeParse({ rows: [{ fullName: 'A' }] }).success).toBe(true);
    expect(importConfirmSchema.safeParse({ rows: [] }).success).toBe(false);
  });

  it('dob: null trong 1 dòng không bị coerce thành 1970-01-01 (cùng lý do như createStudentSchema)', () => {
    const result = importConfirmSchema.safeParse({ rows: [{ fullName: 'A', dob: null }] });
    expect(result.success).toBe(true);
    expect(result.success && result.data.rows[0].dob).toBeUndefined();
  });

  it('giới hạn tối đa 2000 dòng để tránh 1 request chèn vô hạn bản ghi', () => {
    const rows = Array.from({ length: 2001 }, (_, i) => ({ fullName: `Học sinh ${i}` }));
    expect(importConfirmSchema.safeParse({ rows }).success).toBe(false);
    expect(importConfirmSchema.safeParse({ rows: rows.slice(0, 2000) }).success).toBe(true);
  });
});
