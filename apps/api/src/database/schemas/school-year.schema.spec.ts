import { SchoolYearSchema } from './school-year.schema';

describe('SchoolYearSchema indexes', () => {
  it('có partial unique index đảm bảo tối đa 1 năm học isCurrent=true', () => {
    const indexes = SchoolYearSchema.indexes();
    expect(indexes).toContainEqual([
      { isCurrent: 1 },
      expect.objectContaining({ unique: true, partialFilterExpression: { isCurrent: true } }),
    ]);
  });
});
