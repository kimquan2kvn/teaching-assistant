import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ResolvedPosition = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().position;
});
