import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function buildContext(role: string | undefined, requiredRoles: string[] | undefined) {
  const reflector = { getAllAndOverride: () => requiredRoles } as unknown as Reflector;
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return { guard: new RolesGuard(reflector), context };
}

describe('RolesGuard', () => {
  it('cho qua nếu route không khai báo @Roles', () => {
    const { guard, context } = buildContext('TEACHER', undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('cho qua nếu role của user nằm trong danh sách yêu cầu', () => {
    const { guard, context } = buildContext('ADMIN', ['ADMIN', 'TEACHER']);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('từ chối nếu role của user không nằm trong danh sách yêu cầu', () => {
    const { guard, context } = buildContext('TEACHER', ['ADMIN']);
    expect(guard.canActivate(context)).toBe(false);
  });

  it('từ chối nếu chưa đăng nhập (không có req.user)', () => {
    const { guard, context } = buildContext(undefined, ['ADMIN']);
    expect(guard.canActivate(context)).toBe(false);
  });
});
