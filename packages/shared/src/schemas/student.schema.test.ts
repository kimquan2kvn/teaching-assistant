import { createStudentSchema, markTransferredSchema, importConfirmSchema } from './student.schema';

describe('createStudentSchema', () => {
  it('yêu cầu fullName, dob tuỳ chọn', () => {
    expect(createStudentSchema.safeParse({ fullName: 'Nguyễn Văn A' }).success).toBe(true);
    expect(createStudentSchema.safeParse({ fullName: '' }).success).toBe(false);
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
});
