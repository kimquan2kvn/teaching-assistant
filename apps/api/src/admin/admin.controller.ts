import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { setTeacherActiveSchema } from '@so-chu-nhiem/shared';
import type { SetTeacherActiveInput } from '@so-chu-nhiem/shared';
import { User } from '../database/schemas/user.schema';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(@InjectModel(User.name) private readonly userModel: Model<User>) {}

  @Get('teachers')
  async listTeachers() {
    const teachers = await this.userModel.find({ role: 'TEACHER' }).exec();
    return teachers.map((t) => ({
      id: String(t._id),
      username: t.username,
      fullName: t.fullName,
      isActive: t.isActive,
    }));
  }

  @Patch('teachers/:id/active')
  async setActive(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setTeacherActiveSchema)) body: SetTeacherActiveInput,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Mã giáo viên không hợp lệ');
    }
    const result = await this.userModel
      .updateOne({ _id: id, role: 'TEACHER' }, { isActive: body.isActive })
      .exec();
    if (result.matchedCount === 0) {
      throw new NotFoundException('Không tìm thấy giáo viên với mã này');
    }
    return { success: true };
  }
}
