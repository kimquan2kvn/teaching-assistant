import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Model } from 'mongoose';
import { Position } from '../../database/schemas/position.schema';
import { PositionOwnerGuard } from './position-owner.guard';

const CLASS_A = '6ac0000000000000000000a1';
const POSITION_SUBJECT = '6ac0000000000000000000a2';
const HOLDER = '6ac0000000000000000000a3';
const HOMEROOM_HOLDER = '6ac0000000000000000000a4';

function buildContext(options: {
  requirement?: 'SELF' | 'SELF_OR_HOMEROOM';
  user?: { id: string; role: string };
  positionId?: string;
  position: { _id: string; classId: string; holderId: string | null; type: 'HOMEROOM' | 'SUBJECT' } | null;
  homeroomPosition?: { holderId: string | null } | null;
}) {
  const reflector = { getAllAndOverride: () => options.requirement } as unknown as Reflector;
  const findByIdMock = jest.fn(() => ({ exec: async () => options.position }));
  const findOneMock = jest.fn(() => ({ exec: async () => options.homeroomPosition ?? null }));
  const positionModel = { findById: findByIdMock, findOne: findOneMock } as unknown as Model<Position>;
  const request: Record<string, unknown> = { user: options.user, params: { positionId: options.positionId } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return { guard: new PositionOwnerGuard(reflector, positionModel), context, request };
}

describe('PositionOwnerGuard', () => {
  it('cho qua nếu route không khai báo @RequirePositionOwner', async () => {
    const { guard, context } = buildContext({ requirement: undefined, position: null });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('ADMIN luôn được bỏ qua', async () => {
    const { guard, context } = buildContext({
      requirement: 'SELF',
      user: { id: 'admin-id', role: 'ADMIN' },
      positionId: POSITION_SUBJECT,
      position: null,
    });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it("'SELF': đúng chủ vị trí thì qua, gắn request.position", async () => {
    const { guard, context, request } = buildContext({
      requirement: 'SELF',
      user: { id: HOLDER, role: 'TEACHER' },
      positionId: POSITION_SUBJECT,
      position: { _id: POSITION_SUBJECT, classId: CLASS_A, holderId: HOLDER, type: 'SUBJECT' },
    });
    expect(await guard.canActivate(context)).toBe(true);
    expect(request.position).toBeDefined();
  });

  it("'SELF': không phải chủ vị trí thì bị từ chối dù cùng lớp", async () => {
    const { guard, context } = buildContext({
      requirement: 'SELF',
      user: { id: HOMEROOM_HOLDER, role: 'TEACHER' },
      positionId: POSITION_SUBJECT,
      position: { _id: POSITION_SUBJECT, classId: CLASS_A, holderId: HOLDER, type: 'SUBJECT' },
    });
    expect(await guard.canActivate(context)).toBe(false);
  });

  it("'SELF_OR_HOMEROOM': GVCN (giữ HOMEROOM của lớp đó) xem được vị trí SUBJECT khác", async () => {
    const { guard, context } = buildContext({
      requirement: 'SELF_OR_HOMEROOM',
      user: { id: HOMEROOM_HOLDER, role: 'TEACHER' },
      positionId: POSITION_SUBJECT,
      position: { _id: POSITION_SUBJECT, classId: CLASS_A, holderId: HOLDER, type: 'SUBJECT' },
      homeroomPosition: { holderId: HOMEROOM_HOLDER },
    });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it("'SELF_OR_HOMEROOM': giáo viên không liên quan (không giữ vị trí này, không phải GVCN lớp đó) bị từ chối", async () => {
    const { guard, context } = buildContext({
      requirement: 'SELF_OR_HOMEROOM',
      user: { id: 'outsider-id', role: 'TEACHER' },
      positionId: POSITION_SUBJECT,
      position: { _id: POSITION_SUBJECT, classId: CLASS_A, holderId: HOLDER, type: 'SUBJECT' },
      homeroomPosition: { holderId: HOMEROOM_HOLDER },
    });
    expect(await guard.canActivate(context)).toBe(false);
  });

  it('positionId không tồn tại → từ chối, không throw', async () => {
    const { guard, context } = buildContext({
      requirement: 'SELF',
      user: { id: HOLDER, role: 'TEACHER' },
      positionId: '6ac0000000000000000000ff',
      position: null,
    });
    expect(await guard.canActivate(context)).toBe(false);
  });
});
