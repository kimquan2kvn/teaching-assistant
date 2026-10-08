import { Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  createStudentSchema,
  updateStudentSchema,
  markTransferredSchema,
  importConfirmSchema,
} from '@so-chu-nhiem/shared';
import type {
  CreateStudentInput,
  UpdateStudentInput,
  MarkTransferredInput,
  ImportConfirmInput,
} from '@so-chu-nhiem/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PositionGuard } from '../common/guards/position.guard';
import { RequirePosition } from '../common/decorators/require-position.decorator';
import { StudentsService } from './students.service';

@Controller('classes/:classId/students')
@UseGuards(JwtAuthGuard, RolesGuard, PositionGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @RequirePosition('ANY')
  async list(@Param('classId') classId: string, @Query('status') status?: 'ACTIVE' | 'ALL') {
    return this.studentsService.list(classId, status ?? 'ACTIVE');
  }

  @Post()
  @RequirePosition('HOMEROOM')
  async create(
    @Param('classId') classId: string,
    @Body(new ZodValidationPipe(createStudentSchema)) body: CreateStudentInput,
  ) {
    return this.studentsService.create(classId, body);
  }

  @Patch(':studentId')
  @RequirePosition('HOMEROOM')
  async update(
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
    @Body(new ZodValidationPipe(updateStudentSchema)) body: UpdateStudentInput,
  ) {
    return this.studentsService.update(classId, studentId, body);
  }

  @Post(':studentId/transfer')
  @RequirePosition('HOMEROOM')
  async transfer(
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
    @Body(new ZodValidationPipe(markTransferredSchema)) body: MarkTransferredInput,
  ) {
    return this.studentsService.transfer(classId, studentId, body);
  }

  @Post('import-preview')
  @RequirePosition('HOMEROOM')
  @UseInterceptors(FileInterceptor('file'))
  async importPreview(@UploadedFile() file: Express.Multer.File) {
    const rows = await this.studentsService.parsePreview(file.buffer);
    return { rows };
  }

  @Post('import-confirm')
  @RequirePosition('HOMEROOM')
  async importConfirm(
    @Param('classId') classId: string,
    @Body(new ZodValidationPipe(importConfirmSchema)) body: ImportConfirmInput,
  ) {
    return this.studentsService.bulkCreate(classId, body.rows);
  }
}
