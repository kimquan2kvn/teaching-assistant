import { z } from 'zod';

export const createStudentSchema = z.object({
  fullName: z.string().min(1).max(100),
  dob: z.coerce.date().optional(),
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
    .array(z.object({ fullName: z.string().min(1).max(100), dob: z.coerce.date().optional() }))
    .min(1),
});
export type ImportConfirmInput = z.infer<typeof importConfirmSchema>;
