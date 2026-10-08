import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { updatePunishmentStatusSchema, updatePunishmentLinesSchema } from '@so-chu-nhiem/shared';
import type { UpdatePunishmentStatusInput, UpdatePunishmentLinesInput } from '@so-chu-nhiem/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PunishmentsService } from './punishments.service';

@Controller('punishments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TEACHER', 'ADMIN')
export class PunishmentsController {
  constructor(private readonly punishmentsService: PunishmentsService) {}

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePunishmentStatusSchema)) body: UpdatePunishmentStatusInput,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.punishmentsService.updateStatus(id, body.status, user);
  }

  @Patch(':id/lines')
  async updateLines(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePunishmentLinesSchema)) body: UpdatePunishmentLinesInput,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.punishmentsService.updateLines(id, body.lines, user);
  }
}
