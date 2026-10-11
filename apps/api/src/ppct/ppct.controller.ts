import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createPpctItemSchema, updatePpctItemSchema } from '@so-chu-nhiem/shared';
import type { CreatePpctItemInput, UpdatePpctItemInput } from '@so-chu-nhiem/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ResolvedPosition } from '../common/decorators/resolved-position.decorator';
import { RequirePositionOwner } from '../common/decorators/require-position-owner.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Position } from '../database/schemas/position.schema';
import { PpctService } from './ppct.service';

@Controller('positions/:positionId/ppct')
@UseGuards(JwtAuthGuard, RolesGuard, PositionOwnerGuard)
@Roles('TEACHER', 'ADMIN')
export class PpctController {
  constructor(private readonly ppctService: PpctService) {}

  @Get()
  @RequirePositionOwner('SELF_OR_HOMEROOM')
  async list(@Param('positionId') positionId: string) {
    return this.ppctService.list(positionId);
  }

  @Post()
  @RequirePositionOwner('SELF')
  async create(
    @ResolvedPosition() position: Position,
    @Body(new ZodValidationPipe(createPpctItemSchema)) body: CreatePpctItemInput,
  ) {
    return this.ppctService.create(position, body);
  }

  @Patch(':itemId')
  @RequirePositionOwner('SELF')
  async update(
    @ResolvedPosition() position: Position,
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(updatePpctItemSchema)) body: UpdatePpctItemInput,
  ) {
    return this.ppctService.update(position, itemId, body);
  }

  @Delete(':itemId')
  @RequirePositionOwner('SELF')
  async remove(@ResolvedPosition() position: Position, @Param('itemId') itemId: string) {
    return this.ppctService.remove(position, itemId);
  }
}
