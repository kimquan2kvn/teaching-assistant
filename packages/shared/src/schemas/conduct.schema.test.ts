import { createConductCatalogItemSchema, createConductLogSchema } from './conduct.schema';

describe('createConductCatalogItemSchema', () => {
  it('vi phạm (kind=VIOLATION) điểm vượt quá 50 bị từ chối', () => {
    expect(
      createConductCatalogItemSchema.safeParse({ label: 'Đánh nhau', kind: 'VIOLATION', points: 51 }).success,
    ).toBe(false);
    expect(
      createConductCatalogItemSchema.safeParse({ label: 'Đánh nhau', kind: 'VIOLATION', points: 50 }).success,
    ).toBe(true);
  });

  it('điểm cộng (kind=MERIT) điểm vượt quá 30 bị từ chối', () => {
    expect(
      createConductCatalogItemSchema.safeParse({ label: 'Giúp bạn', kind: 'MERIT', points: 31 }).success,
    ).toBe(false);
  });

  it('chấp nhận specialRule tuỳ chọn', () => {
    expect(
      createConductCatalogItemSchema.safeParse({
        label: 'Không làm BTVN',
        kind: 'VIOLATION',
        points: 10,
        specialRule: 'HOMEWORK_NOT_DONE',
      }).success,
    ).toBe(true);
  });
});

describe('createConductLogSchema', () => {
  it('nhánh chọn từ danh mục: cần studentId + catalogItemId', () => {
    expect(
      createConductLogSchema.safeParse({ studentId: 's1', catalogItemId: 'c1' }).success,
    ).toBe(true);
  });

  it("nhánh 'Khác': cần studentId + kind + points + note, điểm phải trong giới hạn theo kind", () => {
    expect(
      createConductLogSchema.safeParse({ studentId: 's1', kind: 'VIOLATION', points: 5, note: 'Nói chuyện riêng' })
        .success,
    ).toBe(true);
    expect(
      createConductLogSchema.safeParse({ studentId: 's1', kind: 'VIOLATION', points: 60, note: 'Quá giới hạn' })
        .success,
    ).toBe(false);
  });
});
