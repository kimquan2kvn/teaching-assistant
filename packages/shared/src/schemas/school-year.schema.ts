import { z } from 'zod';

export const createSchoolYearSchema = z.object({
  name: z.string().min(1).max(20),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  isCurrent: z.boolean().default(false),
});
export type CreateSchoolYearInput = z.infer<typeof createSchoolYearSchema>;
