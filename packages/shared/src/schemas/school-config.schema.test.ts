import { updateSchoolConfigSchema } from './school-config.schema';

describe('updateSchoolConfigSchema', () => {
  it('mọi field đều tuỳ chọn, trong giới hạn hợp lý', () => {
    expect(updateSchoolConfigSchema.safeParse({}).success).toBe(true);
    expect(updateSchoolConfigSchema.safeParse({ weeklyViolationThreshold: 3 }).success).toBe(true);
    expect(updateSchoolConfigSchema.safeParse({ weeklyViolationThreshold: 0 }).success).toBe(false);
    expect(updateSchoolConfigSchema.safeParse({ defaultPunishmentDueDays: 31 }).success).toBe(false);
  });
});
