import { z } from 'zod';
import { MAX_VIOLATION_POINTS, MAX_MERIT_POINTS } from '../constants/conduct';

export const conductKindEnum = z.enum(['VIOLATION', 'MERIT']);
export type ConductKind = z.infer<typeof conductKindEnum>;

export const conductSpecialRuleEnum = z.enum(['HOMEWORK_NOT_DONE']);
export type ConductSpecialRule = z.infer<typeof conductSpecialRuleEnum>;

function maxPointsFor(kind: ConductKind): number {
  return kind === 'VIOLATION' ? MAX_VIOLATION_POINTS : MAX_MERIT_POINTS;
}

export const createConductCatalogItemSchema = z
  .object({
    label: z.string().min(1).max(100),
    kind: conductKindEnum,
    points: z.number().int().positive(),
    specialRule: conductSpecialRuleEnum.optional(),
  })
  .refine((data) => data.points <= maxPointsFor(data.kind), {
    message: 'Điểm vượt quá giới hạn cho phép theo loại (vi phạm tối đa 50, điểm cộng tối đa 30)',
    path: ['points'],
  });
export type CreateConductCatalogItemInput = z.infer<typeof createConductCatalogItemSchema>;

export const updateConductCatalogItemSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateConductCatalogItemInput = z.infer<typeof updateConductCatalogItemSchema>;

const fromCatalogSchema = z.object({
  studentId: z.string().min(1),
  catalogItemId: z.string().min(1),
  note: z.string().max(200).optional(),
});

const customSchema = z
  .object({
    studentId: z.string().min(1),
    kind: conductKindEnum,
    points: z.number().int().positive(),
    note: z.string().min(1).max(200),
  })
  .refine((data) => data.points <= maxPointsFor(data.kind), {
    message: 'Điểm vượt quá giới hạn cho phép theo loại (vi phạm tối đa 50, điểm cộng tối đa 30)',
    path: ['points'],
  });

export const createConductLogSchema = z.union([fromCatalogSchema, customSchema]);
export type CreateConductLogInput = z.infer<typeof createConductLogSchema>;
