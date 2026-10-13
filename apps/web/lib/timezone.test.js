// Canh cấu hình ghim múi giờ trong jest.config.js: nếu bị gỡ, các test "hôm nay theo giờ VN" sẽ fail trên CI (UTC).
describe('môi trường test', () => {
  test('jest chạy ở giờ Việt Nam (UTC+7)', () => {
    expect(process.env.TZ).toBe('Asia/Ho_Chi_Minh');
    expect(new Date('2026-10-08T23:30:00.000Z').getTimezoneOffset()).toBe(-420);
  });
});
