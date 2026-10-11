import { z } from 'zod';

export const updateSchoolConfigSchema = z.object({
  weeklyViolationThreshold: z.number().int().min(1).max(50).optional(),
  defaultPunishmentDueDays: z.number().int().min(1).max(30).optional(),
  defaultWeeklyPunishmentLines: z.number().int().min(1).max(100).optional(),
  saturdayIsSchoolDay: z.boolean().optional(),
});
export type UpdateSchoolConfigInput = z.infer<typeof updateSchoolConfigSchema>;
