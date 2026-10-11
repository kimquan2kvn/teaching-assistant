import { Clock } from './clock';

describe('Clock', () => {
  it('now() trả về thời điểm hiện tại (lệch Date.now() dưới 1 giây)', () => {
    const delta = Math.abs(new Clock().now().getTime() - Date.now());
    expect(delta).toBeLessThan(1000);
  });
});
