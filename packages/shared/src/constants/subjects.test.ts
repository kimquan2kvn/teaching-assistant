import { SUBJECTS } from './subjects';

describe('SUBJECTS', () => {
  it('có đúng 13 môn theo thứ tự quy định', () => {
    expect(SUBJECTS).toEqual([
      'Toán', 'Ngữ văn', 'Tiếng Anh', 'Vật lý', 'Hóa học', 'Sinh học', 'Lịch sử',
      'Địa lý', 'GDCD', 'Tin học', 'Công nghệ', 'Thể dục', 'GDQP-AN',
    ]);
  });
});
