describe('next.config rewrites (proxy API cho demo qua tunnel)', () => {
  const OLD = process.env.API_PROXY_TARGET;
  afterEach(() => {
    if (OLD === undefined) delete process.env.API_PROXY_TARGET;
    else process.env.API_PROXY_TARGET = OLD;
    jest.resetModules();
  });

  test('không đặt API_PROXY_TARGET → không rewrite gì (hành vi cũ)', async () => {
    delete process.env.API_PROXY_TARGET;
    const config = require('./next.config');
    expect(await config.rewrites()).toEqual([]);
  });

  test('đặt API_PROXY_TARGET → /api/* chuyển tiếp sang API, bỏ tiền tố /api', async () => {
    process.env.API_PROXY_TARGET = 'http://localhost:3001';
    const config = require('./next.config');
    expect(await config.rewrites()).toEqual([{ source: '/api/:path*', destination: 'http://localhost:3001/:path*' }]);
  });
});
