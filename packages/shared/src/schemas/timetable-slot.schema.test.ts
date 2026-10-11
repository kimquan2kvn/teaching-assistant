import { createTimetableSlotSchema, updateTimetableSlotSchema } from './timetable-slot.schema';

const validSlot = { dayOfWeek: 2, period: 3, effectiveFrom: '2026-09-07' };

describe('createTimetableSlotSchema', () => {
  it('chấp nhận tiết hợp lệ, effectiveFrom thành Date 00:00 UTC', () => {
    const parsed = createTimetableSlotSchema.parse(validSlot);
    expect(parsed.dayOfWeek).toBe(2);
    expect(parsed.period).toBe(3);
    expect(parsed.effectiveFrom.toISOString()).toBe('2026-09-07T00:00:00.000Z');
  });

  it.each([1, 8, 0, 2.5])('từ chối dayOfWeek=%p (Chủ Nhật=1 không bao giờ là ngày học)', (dayOfWeek) => {
    expect(createTimetableSlotSchema.safeParse({ ...validSlot, dayOfWeek }).success).toBe(false);
  });

  it.each([2, 7])('chấp nhận dayOfWeek=%i (Thứ Hai và Thứ Bảy)', (dayOfWeek) => {
    expect(createTimetableSlotSchema.safeParse({ ...validSlot, dayOfWeek }).success).toBe(true);
  });

  it.each([0, 11])('từ chối period=%i', (period) => {
    expect(createTimetableSlotSchema.safeParse({ ...validSlot, period }).success).toBe(false);
  });

  it.each([1, 10])('chấp nhận period=%i', (period) => {
    expect(createTimetableSlotSchema.safeParse({ ...validSlot, period }).success).toBe(true);
  });

  it('effectiveTo: null hoặc bỏ trống đều hợp lệ (null = đang hiệu lực, không hạn)', () => {
    expect(createTimetableSlotSchema.safeParse({ ...validSlot, effectiveTo: null }).success).toBe(true);
    expect(createTimetableSlotSchema.safeParse(validSlot).success).toBe(true);
    expect(createTimetableSlotSchema.parse({ ...validSlot, effectiveTo: null }).effectiveTo).toBeNull();
  });

  it('effectiveTo cùng ngày effectiveFrom là hợp lệ', () => {
    expect(createTimetableSlotSchema.safeParse({ ...validSlot, effectiveTo: '2026-09-07' }).success).toBe(true);
  });

  it('effectiveTo trước effectiveFrom: lỗi ở path effectiveTo với message tiếng Việt', () => {
    const result = createTimetableSlotSchema.safeParse({ ...validSlot, effectiveTo: '2026-09-06' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0].message).toBe(
      'Ngày kết thúc hiệu lực không được trước ngày bắt đầu hiệu lực',
    );
    expect(result.error.issues[0].path).toEqual(['effectiveTo']);
  });

  it('thiếu effectiveFrom hoặc ngày sai định dạng bị từ chối', () => {
    expect(createTimetableSlotSchema.safeParse({ dayOfWeek: 2, period: 3 }).success).toBe(false);
    expect(createTimetableSlotSchema.safeParse({ ...validSlot, effectiveFrom: '07/09/2026' }).success).toBe(false);
  });
});

describe('updateTimetableSlotSchema', () => {
  it('mọi field tuỳ chọn: chỉ gửi period thì ra đúng { period }', () => {
    expect(updateTimetableSlotSchema.parse({ period: 4 })).toEqual({ period: 4 });
  });

  it('vẫn kiểm tra giới hạn của từng field khi gửi', () => {
    expect(updateTimetableSlotSchema.safeParse({ dayOfWeek: 1 }).success).toBe(false);
    expect(updateTimetableSlotSchema.safeParse({ period: 11 }).success).toBe(false);
  });

  it('chỉ gửi effectiveTo (kể cả null) thì không so sánh với effectiveFrom', () => {
    expect(updateTimetableSlotSchema.safeParse({ effectiveTo: '2026-01-01' }).success).toBe(true);
    expect(updateTimetableSlotSchema.parse({ effectiveTo: null })).toEqual({ effectiveTo: null });
  });

  it('gửi cả 2 ngày mà effectiveTo trước effectiveFrom: lỗi', () => {
    const result = updateTimetableSlotSchema.safeParse({ effectiveFrom: '2026-09-07', effectiveTo: '2026-09-01' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0].message).toBe(
      'Ngày kết thúc hiệu lực không được trước ngày bắt đầu hiệu lực',
    );
    expect(result.error.issues[0].path).toEqual(['effectiveTo']);
  });
});
