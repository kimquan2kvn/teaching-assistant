export const SUBJECTS = [
  'Toán', 'Ngữ văn', 'Tiếng Anh', 'Vật lý', 'Hóa học', 'Sinh học', 'Lịch sử',
  'Địa lý', 'GDCD', 'Tin học', 'Công nghệ', 'Thể dục', 'GDQP-AN',
] as const;

export type Subject = (typeof SUBJECTS)[number];
