import { getConductRatingLabel, MAX_VIOLATION_POINTS, MAX_MERIT_POINTS } from './conduct';

describe('getConductRatingLabel', () => {
  it.each([
    [100, 'Xuất sắc'],
    [95, 'Xuất sắc'],
    [94, 'Tốt'],
    [90, 'Tốt'],
    [89, 'Khá'],
    [80, 'Khá'],
    [79, 'Đạt'],
    [65, 'Đạt'],
    [64, 'Cần rèn luyện'],
    [50, 'Cần rèn luyện'],
    [49, 'Chưa đạt'],
    [-10, 'Chưa đạt'],
  ])('điểm %i → %s', (score, label) => {
    expect(getConductRatingLabel(score)).toBe(label);
  });
});

it('giới hạn điểm vi phạm/điểm cộng đúng yêu cầu gốc', () => {
  expect(MAX_VIOLATION_POINTS).toBe(50);
  expect(MAX_MERIT_POINTS).toBe(30);
});
