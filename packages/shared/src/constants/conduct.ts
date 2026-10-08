export const MAX_VIOLATION_POINTS = 50;
export const MAX_MERIT_POINTS = 30;
export const HOMEWORK_NOT_DONE_LINES_BY_OCCURRENCE = [20, 30, 40, 50] as const;

export function getConductRatingLabel(score: number): string {
  if (score >= 95) return 'Xuất sắc';
  if (score >= 90) return 'Tốt';
  if (score >= 80) return 'Khá';
  if (score >= 65) return 'Đạt';
  if (score >= 50) return 'Cần rèn luyện';
  return 'Chưa đạt';
}
