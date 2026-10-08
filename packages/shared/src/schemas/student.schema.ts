import { z } from 'zod';

// z.coerce.date() coi `new Date(null)` (epoch 1970-01-01) là ngày hợp lệ, nên null/'' phải bị chặn TRƯỚC
// khi coerce — nếu không, 1 ô ngày sinh parse lỗi khi import (preview trả về dob: null do JSON.stringify
// một Invalid Date) sẽ lưu thành 01/01/1970 mà không có lỗi nào được báo.
const dobField = z.preprocess((value) => (value === null || value === '' ? undefined : value), z.coerce.date().optional());

export const createStudentSchema = z.object({
  fullName: z.string().min(1).max(100),
  dob: dobField,
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = createStudentSchema.partial();
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const markTransferredSchema = z.object({
  transferDate: z.coerce.date(),
  transferReason: z.string().min(1).max(200),
});
export type MarkTransferredInput = z.infer<typeof markTransferredSchema>;

export const importConfirmSchema = z.object({
  rows: z
    .array(z.object({ fullName: z.string().min(1).max(100), dob: dobField }))
    .min(1)
    .max(2000),
});
export type ImportConfirmInput = z.infer<typeof importConfirmSchema>;
