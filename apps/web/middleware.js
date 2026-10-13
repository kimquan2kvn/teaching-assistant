import { NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/dang-nhap', '/dang-ky'];

export function middleware(request) {
  const hasSession = request.cookies.has('refresh_token');
  const isPublicPath = PUBLIC_PATHS.includes(request.nextUrl.pathname);
  if (!hasSession && !isPublicPath) {
    return NextResponse.redirect(new URL('/dang-nhap', request.url));
  }
  return NextResponse.next();
}

// `api` được bỏ qua: request /api/* (proxy sang API khi demo qua tunnel) không được chuyển hướng về trang đăng nhập.
export const config = { matcher: ['/((?!_next|api/|favicon.ico).*)'] };
