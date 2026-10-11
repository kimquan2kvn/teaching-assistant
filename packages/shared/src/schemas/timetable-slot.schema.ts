import { z } from 'zod';
import { MAX_PERIODS_PER_DAY } from '../constants/schedule';
import { dateOnlySchema } from './date-only.schema';

const EFFECTIVE_TO_BEFORE_FROM_MESSAGE = 'Ngày kết thúc hiệu lực không được trước ngày bắt đầu hiệu lực';

// effectiveTo null = tiết đang hiệu lực không có hạn. Refine chạy cả khi 1 ngày parse lỗi (giá trị undefined).
function isEffectiveToBeforeFrom(data: { effectiveFrom?: Date; effectiveTo?: Date | null }): boolean {
  return (
    data.effectiveFrom instanceof Date && data.effectiveTo instanceof Date && data.effectiveTo < data.effectiveFrom
  );
}

const slotFields = {
  dayOfWeek: z.number().int().min(2).max(7),
  period: z.number().int().min(1).max(MAX_PERIODS_PER_DAY),
  effectiveFrom: dateOnlySchema,
  effectiveTo: dateOnlySchema.nullable().optional(),
};

export const createTimetableSlotSchema = z.object(slotFields).refine((data) => !isEffectiveToBeforeFrom(data), {
  message: EFFECTIVE_TO_BEFORE_FROM_MESSAGE,
  path: ['effectiveTo'],
});
export type CreateTimetableSlotInput = z.infer<typeof createTimetableSlotSchema>;

// Chỉ so sánh khi gửi đủ cả 2 ngày; nếu chỉ gửi 1 ngày, service so với giá trị đã lưu.
export const updateTimetableSlotSchema = z
  .object(slotFields)
  .partial()
  .refine((data) => !isEffectiveToBeforeFrom(data), {
    message: EFFECTIVE_TO_BEFORE_FROM_MESSAGE,
    path: ['effectiveTo'],
  });
export type UpdateTimetableSlotInput = z.infer<typeof updateTimetableSlotSchema>;
