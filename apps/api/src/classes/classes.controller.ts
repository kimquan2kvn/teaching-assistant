import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { createClassSchema } from '@so-chu-nhiem/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ClassesService } from './classes.service';

@Controller('classes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Post()
  async create(
    @CurrentUser() user: { id: string },
    @Body(new ZodValidationPipe(createClassSchema)) body: { name: string; claimHomeroom: boolean },
  ) {
    return this.classesService.create(user.id, body);
  }

  @Get(':code')
  async findByCode(@Param('code') code: string) {
    return this.classesService.findByCode(code);
  }
}
