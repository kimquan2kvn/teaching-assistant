import { PositionSchema } from './position.schema';

describe('PositionSchema indexes', () => {
  it('có unique partial index theo (classId, subject) chỉ áp dụng cho type=SUBJECT', () => {
    const indexes = PositionSchema.indexes();
    expect(indexes).toContainEqual([
      { classId: 1, subject: 1 },
      expect.objectContaining({ unique: true, partialFilterExpression: { type: 'SUBJECT' } }),
    ]);
  });

  it('có unique partial index theo (classId, type) chỉ áp dụng cho type=HOMEROOM', () => {
    const indexes = PositionSchema.indexes();
    expect(indexes).toContainEqual([
      { classId: 1, type: 1 },
      expect.objectContaining({ unique: true, partialFilterExpression: { type: 'HOMEROOM' } }),
    ]);
  });
});
