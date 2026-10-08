import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { joinClassSchema, reassignPositionSchema } from '@so-chu-nhiem/shared';
import type { JoinClassInput, ReassignPositionInput } from '@so-chu-nhiem/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PositionsService } from './positions.service';

@Controller('positions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TEACHER', 'ADMIN')
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Post('join')
  async join(
    @CurrentUser() user: { id: string },
    @Body(new ZodValidationPipe(joinClassSchema)) body: JoinClassInput,
  ) {
    return this.positionsService.join(user.id, body);
  }

  @Post(':id/release')
  async release(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.positionsService.release(user.id, id);
  }

  @Patch(':id/reassign')
  @Roles('ADMIN')
  async reassign(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reassignPositionSchema)) body: ReassignPositionInput,
  ) {
    return this.positionsService.reassign(body.teacherId, id);
  }
}
