import { updatePunishmentStatusSchema, updatePunishmentLinesSchema } from './punishment.schema';

describe('updatePunishmentStatusSchema', () => {
  it('chỉ chấp nhận đúng 3 giá trị trạng thái', () => {
    expect(updatePunishmentStatusSchema.safeParse({ status: 'SUBMITTED' }).success).toBe(true);
    expect(updatePunishmentStatusSchema.safeParse({ status: 'DONE' }).success).toBe(false);
  });
});

describe('updatePunishmentLinesSchema', () => {
  it('giới hạn 1-100 dòng', () => {
    expect(updatePunishmentLinesSchema.safeParse({ lines: 1 }).success).toBe(true);
    expect(updatePunishmentLinesSchema.safeParse({ lines: 100 }).success).toBe(true);
    expect(updatePunishmentLinesSchema.safeParse({ lines: 0 }).success).toBe(false);
    expect(updatePunishmentLinesSchema.safeParse({ lines: 101 }).success).toBe(false);
  });
});
