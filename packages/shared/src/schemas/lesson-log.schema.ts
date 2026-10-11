import { z } from 'zod';
import { dateOnlySchema } from './date-only.schema';

// done: false là thao tác hợp lệ (bỏ tích), nên kiểm tra "có gửi" bằng !== undefined chứ không dùng truthy.
export const updateLessonLogSchema = z
  .object({
    date: dateOnlySchema.optional(),
    done: z.boolean().optional(),
  })
  .refine((data) => data.date !== undefined || data.done !== undefined, {
    message: 'Cần gửi ít nhất một trong hai trường: date hoặc done',
  });
export type UpdateLessonLogInput = z.infer<typeof updateLessonLogSchema>;

export const recalculateLessonLogsSchema = z.object({
  fromDate: dateOnlySchema.optional(),
});
export type RecalculateLessonLogsInput = z.infer<typeof recalculateLessonLogsSchema>;
