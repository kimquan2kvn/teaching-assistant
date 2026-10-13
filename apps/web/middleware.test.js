import { NextRequest } from 'next/server';
import { middleware } from './middleware';

test('có cookie refresh_token → không redirect (response không có header Location)', () => {
  const req = new NextRequest('http://localhost:3000/', {
    headers: { cookie: 'refresh_token=abc' },
  });
  const res = middleware(req);
  expect(res?.headers.get('location')).toBeNull();
});

test('không có cookie + route không công khai → redirect /dang-nhap', () => {
  const req = new NextRequest('http://localhost:3000/', { headers: {} });
  const res = middleware(req);
  expect(res?.headers.get('location')).toContain('/dang-nhap');
});

test.each(['/dang-nhap', '/dang-ky'])('không có cookie + %s → KHÔNG redirect (tránh vòng lặp)', (path) => {
  const req = new NextRequest(`http://localhost:3000${path}`, { headers: {} });
  const res = middleware(req);
  expect(res?.headers.get('location')).toBeNull();
});

describe('config.matcher', () => {
  // Next biên dịch matcher thành regex neo đầu/cuối; mô phỏng đúng cách đó.
  const { config } = require('./middleware');
  const matches = (path) => new RegExp(`^${config.matcher[0]}$`).test(path);

  test.each(['/', '/lop-hoc', '/lop-hoc/abc/ppct', '/lich-nam-hoc'])('%s đi qua middleware', (path) => {
    expect(matches(path)).toBe(true);
  });

  test.each(['/api/auth/login', '/api/positions/mine', '/_next/static/x.js', '/favicon.ico'])(
    '%s bị bỏ qua (không chuyển hướng về đăng nhập)',
    (path) => {
      expect(matches(path)).toBe(false);
    },
  );
});
