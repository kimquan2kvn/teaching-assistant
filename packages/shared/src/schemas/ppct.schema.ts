import { z } from 'zod';
import { MAX_PPCT_IMPORT_ROWS, MAX_PPCT_PERIOD_COUNT, MAX_PPCT_WEEK } from '../constants/schedule';

// periodLabel chỉ là chuỗi hiển thị (mục 2 tiết có thể là '15-16'), nên không ép regex.
export const createPpctItemSchema = z.object({
  week: z.number().int().min(1).max(MAX_PPCT_WEEK),
  periodLabel: z.string().trim().min(1).max(20),
  title: z.string().trim().min(1).max(300),
  periodCount: z.number().int().min(1).max(MAX_PPCT_PERIOD_COUNT),
  requirement: z.string().trim().max(1000).default(''),
  note: z.string().trim().max(500).optional(),
});
export type CreatePpctItemInput = z.infer<typeof createPpctItemSchema>;

// .partial() bọc ZodDefault trong ZodOptional nên key vắng mặt không bị chèn lại default ''
// (nếu bị chèn, PATCH chỉ gửi { title } sẽ xoá mất requirement đã lưu).
export const updatePpctItemSchema = createPpctItemSchema.partial();
export type UpdatePpctItemInput = z.infer<typeof updatePpctItemSchema>;

export const ppctImportCommitSchema = z.object({
  rows: z.array(createPpctItemSchema).min(1).max(MAX_PPCT_IMPORT_ROWS),
});
export type PpctImportCommitInput = z.infer<typeof ppctImportCommitSchema>;
