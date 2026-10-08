import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { updateSchoolConfigSchema } from '@so-chu-nhiem/shared';
import type { UpdateSchoolConfigInput } from '@so-chu-nhiem/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SchoolConfigService } from './school-config.service';

@Controller('school-config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TEACHER', 'ADMIN')
export class SchoolConfigController {
  constructor(private readonly schoolConfigService: SchoolConfigService) {}

  @Get()
  async get() {
    return this.schoolConfigService.getConfig();
  }

  @Patch()
  @Roles('ADMIN')
  async update(@Body(new ZodValidationPipe(updateSchoolConfigSchema)) body: UpdateSchoolConfigInput) {
    return this.schoolConfigService.update(body);
  }
}
