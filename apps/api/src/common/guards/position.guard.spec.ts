import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Model, Types } from 'mongoose';
import { Position } from '../../database/schemas/position.schema';
import { PositionGuard } from './position.guard';

function buildContext(options: {
  requirement?: 'HOMEROOM' | 'ANY';
  user?: { id: string; role: string };
  classId?: string;
  foundPosition: { type: string; holderId: string } | null;
}) {
  const reflector = { getAllAndOverride: () => options.requirement } as unknown as Reflector;
  const findOneMock = jest.fn<{ exec: () => Promise<typeof options.foundPosition> }, [Record<string, unknown>]>(
    () => ({ exec: async () => options.foundPosition }),
  );
  const positionModel = { findOne: findOneMock } as unknown as Model<Position>;
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ user: options.user, params: { classId: options.classId } }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return { guard: new PositionGuard(reflector, positionModel), context, findOneMock };
}

describe('PositionGuard', () => {
  it('cho qua nếu route không khai báo @RequirePosition', async () => {
    const { guard, context } = buildContext({ requirement: undefined, foundPosition: null });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('ADMIN luôn được bỏ qua, không query DB', async () => {
    const { guard, context } = buildContext({
      requirement: 'HOMEROOM',
      user: { id: '6ac0000000000000000000a1', role: 'ADMIN' },
      classId: '6ac0000000000000000000c1',
      foundPosition: null,
    });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it("'ANY': cho qua nếu đang giữ SUBJECT của đúng lớp, query KHÔNG lọc theo type", async () => {
    const { guard, context, findOneMock } = buildContext({
      requirement: 'ANY',
      user: { id: '6ac0000000000000000000b1', role: 'TEACHER' },
      classId: '6ac0000000000000000000c1',
      foundPosition: { type: 'SUBJECT', holderId: '6ac0000000000000000000b1' },
    });
    expect(await guard.canActivate(context)).toBe(true);

    // Phải xác nhận ĐÚNG filter được dùng để query — nếu không, 1 bản mock trả cứng `foundPosition` có
    // thể khiến test pass dù code bỏ mất điều kiện `classId`/`holderId`/`type` thật sự lọc gì.
    expect(findOneMock).toHaveBeenCalledTimes(1);
    const filter = findOneMock.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.classId).toBeInstanceOf(Types.ObjectId);
    expect(String(filter.classId)).toBe('6ac0000000000000000000c1');
    expect(filter.holderId).toBeInstanceOf(Types.ObjectId);
    expect(String(filter.holderId)).toBe('6ac0000000000000000000b1');
    expect(filter.type).toBeUndefined();
  });

  it("'HOMEROOM': từ chối nếu chỉ giữ SUBJECT (không phải HOMEROOM) của lớp đó, query CÓ lọc type: HOMEROOM", async () => {
    const { guard, context, findOneMock } = buildContext({
      requirement: 'HOMEROOM',
      user: { id: '6ac0000000000000000000b1', role: 'TEACHER' },
      classId: '6ac0000000000000000000c1',
      foundPosition: null, // query lọc type: HOMEROOM sẽ không tìm thấy vì teacher-1 chỉ giữ SUBJECT
    });
    expect(await guard.canActivate(context)).toBe(false);

    const filter = findOneMock.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.type).toBe('HOMEROOM');
  });

  it('từ chối nếu không giữ vị trí nào của đúng classId trong route', async () => {
    const { guard, context } = buildContext({
      requirement: 'ANY',
      user: { id: '6ac0000000000000000000b1', role: 'TEACHER' },
      classId: '6ac0000000000000000000c1',
      foundPosition: null,
    });
    expect(await guard.canActivate(context)).toBe(false);
  });
});
