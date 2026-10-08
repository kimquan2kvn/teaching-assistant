import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../database/schemas/user.schema';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

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
  async setActive(@Param('id') id: string, @Body() body: { isActive: boolean }) {
    await this.userModel.updateOne({ _id: id }, { isActive: body.isActive }).exec();
    return { success: true };
  }
}
