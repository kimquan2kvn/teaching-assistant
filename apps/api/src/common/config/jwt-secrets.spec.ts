import { getJwtAccessSecret, getJwtRefreshSecret } from './jwt-secrets';

describe('jwt-secrets', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAccess = process.env.JWT_ACCESS_SECRET;
  const originalRefresh = process.env.JWT_REFRESH_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.JWT_ACCESS_SECRET = originalAccess;
    process.env.JWT_REFRESH_SECRET = originalRefresh;
  });

  it('trả về giá trị trong biến môi trường nếu có', () => {
    process.env.JWT_ACCESS_SECRET = 'real-access-secret';
    expect(getJwtAccessSecret()).toBe('real-access-secret');
  });

  it('trả fallback dev nếu chưa set và không phải production', () => {
    delete process.env.JWT_REFRESH_SECRET;
    process.env.NODE_ENV = 'test';
    expect(getJwtRefreshSecret()).toBe('dev-refresh-secret');
  });

  it('throw lỗi rõ ràng nếu NODE_ENV=production mà thiếu JWT_ACCESS_SECRET', () => {
    delete process.env.JWT_ACCESS_SECRET;
    process.env.NODE_ENV = 'production';
    expect(() => getJwtAccessSecret()).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('throw lỗi rõ ràng nếu NODE_ENV=production mà thiếu JWT_REFRESH_SECRET', () => {
    delete process.env.JWT_REFRESH_SECRET;
    process.env.NODE_ENV = 'production';
    expect(() => getJwtRefreshSecret()).toThrow(/JWT_REFRESH_SECRET/);
  });
});
