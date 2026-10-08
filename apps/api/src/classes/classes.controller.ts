import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { createClassSchema } from '@so-chu-nhiem/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PositionGuard } from '../common/guards/position.guard';
import { RequirePosition } from '../common/decorators/require-position.decorator';
import { ClassesService } from './classes.service';

@Controller('classes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TEACHER', 'ADMIN')
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

  // 2 segment path (:classId/detail) nên không đụng @Get(':code') 1 segment ở trên — Nest phân biệt theo số segment.
  @Get(':classId/detail')
  @UseGuards(PositionGuard)
  @RequirePosition('ANY')
  async findDetail(@Param('classId') classId: string) {
    return this.classesService.findDetail(classId);
  }
}
