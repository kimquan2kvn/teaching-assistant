import { updateSchoolConfigSchema } from './school-config.schema';

describe('updateSchoolConfigSchema', () => {
  it('mọi field đều tuỳ chọn, trong giới hạn hợp lý', () => {
    expect(updateSchoolConfigSchema.safeParse({}).success).toBe(true);
    expect(updateSchoolConfigSchema.safeParse({ weeklyViolationThreshold: 3 }).success).toBe(true);
    expect(updateSchoolConfigSchema.safeParse({ weeklyViolationThreshold: 0 }).success).toBe(false);
    expect(updateSchoolConfigSchema.safeParse({ defaultPunishmentDueDays: 31 }).success).toBe(false);
  });

  it('saturdayIsSchoolDay phải là boolean (cờ Thứ Bảy có phải ngày học cho thẻ thống kê lịch năm học)', () => {
    expect(updateSchoolConfigSchema.safeParse({ saturdayIsSchoolDay: true }).success).toBe(true);
    expect(updateSchoolConfigSchema.safeParse({ saturdayIsSchoolDay: false }).success).toBe(true);
    expect(updateSchoolConfigSchema.safeParse({ saturdayIsSchoolDay: 'yes' }).success).toBe(false);
    expect(updateSchoolConfigSchema.parse({ saturdayIsSchoolDay: true })).toEqual({ saturdayIsSchoolDay: true });
  });
});
