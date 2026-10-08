import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createConductCatalogItemSchema, updateConductCatalogItemSchema } from '@so-chu-nhiem/shared';
import type { CreateConductCatalogItemInput, UpdateConductCatalogItemInput } from '@so-chu-nhiem/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ConductCatalogService } from './conduct-catalog.service';

@Controller('conduct-catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TEACHER', 'ADMIN')
export class ConductCatalogController {
  constructor(private readonly catalogService: ConductCatalogService) {}

  @Get()
  async list() {
    return this.catalogService.list();
  }

  @Post()
  @Roles('ADMIN')
  async create(@Body(new ZodValidationPipe(createConductCatalogItemSchema)) body: CreateConductCatalogItemInput) {
    return this.catalogService.create(body);
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateConductCatalogItemSchema)) body: UpdateConductCatalogItemInput,
  ) {
    return this.catalogService.update(id, body);
  }
}
