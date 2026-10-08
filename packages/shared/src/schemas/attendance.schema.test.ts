import { markAttendanceSchema } from './attendance.schema';

describe('markAttendanceSchema', () => {
  it('chấp nhận mảng entries hợp lệ, từ chối status không thuộc enum', () => {
    expect(
      markAttendanceSchema.safeParse({ entries: [{ studentId: 'abc', status: 'LATE' }] }).success,
    ).toBe(true);
    expect(
      markAttendanceSchema.safeParse({ entries: [{ studentId: 'abc', status: 'SICK' }] }).success,
    ).toBe(false);
  });

  it('giới hạn tối đa 200 dòng/lần (tương đương 1 lớp lớn, tránh payload vô hạn)', () => {
    const entries = Array.from({ length: 201 }, (_, i) => ({ studentId: `s${i}`, status: 'LATE' as const }));
    expect(markAttendanceSchema.safeParse({ entries }).success).toBe(false);
  });

  it('từ chối studentId trùng lặp trong cùng 1 lần gửi (tránh 2 upsert đua nhau cùng key)', () => {
    expect(
      markAttendanceSchema.safeParse({
        entries: [
          { studentId: 's1', status: 'LATE' },
          { studentId: 's1', status: 'EXCUSED' },
        ],
      }).success,
    ).toBe(false);
  });
});
