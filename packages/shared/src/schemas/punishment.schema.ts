import { z } from 'zod';

export const punishmentStatusEnum = z.enum(['PENDING', 'SUBMITTED', 'LATE']);
export type PunishmentStatus = z.infer<typeof punishmentStatusEnum>;

export const updatePunishmentStatusSchema = z.object({ status: punishmentStatusEnum });
export type UpdatePunishmentStatusInput = z.infer<typeof updatePunishmentStatusSchema>;

export const updatePunishmentLinesSchema = z.object({ lines: z.number().int().min(1).max(100) });
export type UpdatePunishmentLinesInput = z.infer<typeof updatePunishmentLinesSchema>;
