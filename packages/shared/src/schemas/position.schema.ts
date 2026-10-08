import { z } from 'zod';

export const reassignPositionSchema = z.object({
  teacherId: z.string().min(1),
});
export type ReassignPositionInput = z.infer<typeof reassignPositionSchema>;
