/** @type {import('next').NextConfig} */
const nextConfig = {
  // Demo qua tunnel (ngrok): web và API dùng CHUNG một tên miền, nếu không cookie phiên `refresh_token` do API đặt sẽ
  // không tới được middleware của web. Đặt API_PROXY_TARGET (vd http://localhost:3001) + NEXT_PUBLIC_API_URL=/api để
  // Next chuyển tiếp /api/* sang API. Không đặt biến này thì hành vi như cũ (web gọi thẳng API ở NEXT_PUBLIC_API_URL).
  async rewrites() {
    const target = process.env.API_PROXY_TARGET;
    if (!target) return [];
    return [{ source: '/api/:path*', destination: `${target}/:path*` }];
  },
};

module.exports = nextConfig;
