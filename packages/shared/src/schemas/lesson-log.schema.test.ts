import { recalculateLessonLogsSchema, updateLessonLogSchema } from './lesson-log.schema';

describe('updateLessonLogSchema', () => {
  it('body rỗng bị từ chối với message tiếng Việt', () => {
    const result = updateLessonLogSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0].message).toBe('Cần gửi ít nhất một trong hai trường: date hoặc done');
  });

  it('chấp nhận { done: false } (bỏ tích vẫn là thao tác hợp lệ, không bị coi là rỗng)', () => {
    expect(updateLessonLogSchema.parse({ done: false })).toEqual({ done: false });
  });

  it('chấp nhận { date } và đổi thành Date 00:00 UTC', () => {
    const parsed = updateLessonLogSchema.parse({ date: '2026-01-12' });
    expect(parsed.date?.toISOString()).toBe('2026-01-12T00:00:00.000Z');
    expect('done' in parsed).toBe(false);
  });

  it('chấp nhận gửi cả date và done', () => {
    const parsed = updateLessonLogSchema.parse({ date: '2026-01-12', done: true });
    expect(parsed.done).toBe(true);
    expect(parsed.date?.toISOString()).toBe('2026-01-12T00:00:00.000Z');
  });

  it('từ chối ngày sai định dạng và done không phải boolean', () => {
    expect(updateLessonLogSchema.safeParse({ date: '12/01/2026' }).success).toBe(false);
    expect(updateLessonLogSchema.safeParse({ done: 'yes' }).success).toBe(false);
  });
});

describe('recalculateLessonLogsSchema', () => {
  it('body rỗng hợp lệ (fromDate tuỳ chọn)', () => {
    expect(recalculateLessonLogsSchema.parse({})).toEqual({});
  });

  it('fromDate thành Date 00:00 UTC; sai định dạng bị từ chối', () => {
    expect(recalculateLessonLogsSchema.parse({ fromDate: '2026-01-12' }).fromDate?.toISOString()).toBe(
      '2026-01-12T00:00:00.000Z',
    );
    expect(recalculateLessonLogsSchema.safeParse({ fromDate: '2026-02-30' }).success).toBe(false);
  });
});
