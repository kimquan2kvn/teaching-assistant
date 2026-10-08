import { generateClassCode } from './classes.service';

describe('generateClassCode', () => {
  it('sinh mã đúng định dạng <tên>-<5 ký tự trong bảng chữ an toàn>', () => {
    const code = generateClassCode('11A4');
    expect(code).toMatch(/^11A4-[A-HJ-NP-Z2-9]{5}$/);
  });

  it('sinh ra nhiều mã khác nhau qua nhiều lần gọi (không bị cố định/lặp lại)', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateClassCode('X')));
    // 50 lần sinh 5 ký tự từ bảng 32 ký tự gần như chắc chắn không trùng nhau hết nếu nguồn ngẫu nhiên hoạt động
    expect(codes.size).toBeGreaterThan(45);
  });
});
