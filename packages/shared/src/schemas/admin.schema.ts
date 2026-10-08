import { z } from 'zod';

export const setTeacherActiveSchema = z.object({
  isActive: z.boolean(),
});
export type SetTeacherActiveInput = z.infer<typeof setTeacherActiveSchema>;
