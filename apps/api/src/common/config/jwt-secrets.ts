function requireEnvOrDevFallback(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Thiếu biến môi trường bắt buộc: ${name}`);
  }
  return devFallback;
}

export function getJwtAccessSecret(): string {
  return requireEnvOrDevFallback('JWT_ACCESS_SECRET', 'dev-access-secret');
}

export function getJwtRefreshSecret(): string {
  return requireEnvOrDevFallback('JWT_REFRESH_SECRET', 'dev-refresh-secret');
}
