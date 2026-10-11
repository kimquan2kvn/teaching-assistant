import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createPpctItemSchema, ppctImportCommitSchema, updatePpctItemSchema } from '@so-chu-nhiem/shared';
import type { CreatePpctItemInput, PpctImportCommitInput, UpdatePpctItemInput } from '@so-chu-nhiem/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ResolvedPosition } from '../common/decorators/resolved-position.decorator';
import { RequirePositionOwner } from '../common/decorators/require-position-owner.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PositionOwnerGuard } from '../common/guards/position-owner.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Position } from '../database/schemas/position.schema';
import { parsePpctWorkbook } from './ppct-import';
import { PpctService } from './ppct.service';

const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;

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

  // Preview chỉ đọc file và trả các dòng đã parse kèm lỗi để người dùng sửa; không đụng DB.
  @Post('import/preview')
  @RequirePositionOwner('SELF')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_SIZE_BYTES, files: 1 } }))
  async importPreview(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Chưa chọn file để import');
    }
    const rows = await parsePpctWorkbook(file.buffer);
    return { rows };
  }

  @Post('import/commit')
  @RequirePositionOwner('SELF')
  async importCommit(
    @ResolvedPosition() position: Position,
    @Body(new ZodValidationPipe(ppctImportCommitSchema)) body: PpctImportCommitInput,
  ) {
    return this.ppctService.importCommit(position, body.rows);
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
