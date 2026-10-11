import { z } from 'zod';
import { dateOnlySchema } from './date-only.schema';

export const holidayTypeEnum = z.enum(['LE', 'DOT_XUAT', 'KHAC']);
export type HolidayType = z.infer<typeof holidayTypeEnum>;

const END_BEFORE_START_MESSAGE = 'Ngày kết thúc không được trước ngày bắt đầu';

// Refine chạy cả khi 1 trong 2 ngày parse lỗi (giá trị lúc đó là undefined) nên phải kiểm tra instanceof Date.
function isEndBeforeStart(data: { startDate?: Date; endDate?: Date }): boolean {
  return data.startDate instanceof Date && data.endDate instanceof Date && data.endDate < data.startDate;
}

const holidayFields = {
  schoolYearId: z.string().min(1),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  type: holidayTypeEnum,
  name: z.string().trim().min(1).max(200),
};

export const createHolidaySchema = z.object(holidayFields).refine((data) => !isEndBeforeStart(data), {
  message: END_BEFORE_START_MESSAGE,
  path: ['endDate'],
});
export type CreateHolidayInput = z.infer<typeof createHolidaySchema>;

// Không có schoolYearId: ngày nghỉ không được chuyển sang năm học khác (zod mặc định bỏ key lạ).
// Chỉ so sánh khi gửi đủ cả 2 ngày; nếu chỉ gửi 1 ngày, service so với giá trị đã lưu.
export const updateHolidaySchema = z
  .object(holidayFields)
  .omit({ schoolYearId: true })
  .partial()
  .refine((data) => !isEndBeforeStart(data), {
    message: END_BEFORE_START_MESSAGE,
    path: ['endDate'],
  });
export type UpdateHolidayInput = z.infer<typeof updateHolidaySchema>;
