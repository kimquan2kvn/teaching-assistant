import { z } from 'zod';
import { SUBJECTS } from '../constants/subjects';

export const createClassSchema = z.object({
  name: z.string().min(1).max(20),
  claimHomeroom: z.boolean(),
});
export type CreateClassInput = z.infer<typeof createClassSchema>;

export const joinClassSchema = z.object({
  code: z.string().min(1),
  type: z.enum(['HOMEROOM', 'SUBJECT']),
  subject: z.enum(SUBJECTS).optional(),
});
export type JoinClassInput = z.infer<typeof joinClassSchema>;
