import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Model } from 'mongoose';
import { Position } from '../../database/schemas/position.schema';
import { PositionGuard } from './position.guard';

function buildContext(options: {
  requirement?: 'HOMEROOM' | 'ANY';
  user?: { id: string; role: string };
  classId?: string;
  foundPosition: { type: string; holderId: string } | null;
}) {
  const reflector = { getAllAndOverride: () => options.requirement } as unknown as Reflector;
  const positionModel = {
    findOne: jest.fn(() => ({ exec: async () => options.foundPosition })),
  } as unknown as Model<Position>;
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ user: options.user, params: { classId: options.classId } }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return { guard: new PositionGuard(reflector, positionModel), context };
}

describe('PositionGuard', () => {
  it('cho qua nếu route không khai báo @RequirePosition', async () => {
    const { guard, context } = buildContext({ requirement: undefined, foundPosition: null });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('ADMIN luôn được bỏ qua, không query DB', async () => {
    const { guard, context } = buildContext({
      requirement: 'HOMEROOM',
      user: { id: 'admin-1', role: 'ADMIN' },
      classId: 'class-1',
      foundPosition: null,
    });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it("'ANY': cho qua nếu đang giữ SUBJECT của đúng lớp", async () => {
    const { guard, context } = buildContext({
      requirement: 'ANY',
      user: { id: 'teacher-1', role: 'TEACHER' },
      classId: 'class-1',
      foundPosition: { type: 'SUBJECT', holderId: 'teacher-1' },
    });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it("'HOMEROOM': từ chối nếu chỉ giữ SUBJECT (không phải HOMEROOM) của lớp đó", async () => {
    const { guard, context } = buildContext({
      requirement: 'HOMEROOM',
      user: { id: 'teacher-1', role: 'TEACHER' },
      classId: 'class-1',
      foundPosition: null, // query lọc type: HOMEROOM sẽ không tìm thấy vì teacher-1 chỉ giữ SUBJECT
    });
    expect(await guard.canActivate(context)).toBe(false);
  });

  it('từ chối nếu không giữ vị trí nào của đúng classId trong route', async () => {
    const { guard, context } = buildContext({
      requirement: 'ANY',
      user: { id: 'teacher-1', role: 'TEACHER' },
      classId: 'class-1',
      foundPosition: null,
    });
    expect(await guard.canActivate(context)).toBe(false);
  });
});
