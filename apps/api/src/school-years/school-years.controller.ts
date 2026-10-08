import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { createSchoolYearSchema } from '@so-chu-nhiem/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SchoolYearsService } from './school-years.service';

@Controller('school-years')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SchoolYearsController {
  constructor(private readonly schoolYearsService: SchoolYearsService) {}

  @Get()
  async list() {
    return this.schoolYearsService.list();
  }

  @Post()
  @Roles('ADMIN')
  async create(
    @Body(new ZodValidationPipe(createSchoolYearSchema))
    body: { name: string; startDate: Date; endDate: Date; isCurrent: boolean },
  ) {
    return this.schoolYearsService.create(body);
  }
}
