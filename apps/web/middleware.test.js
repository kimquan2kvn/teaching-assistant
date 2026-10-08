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
