import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SchoolConfig } from '../database/schemas/school-config.schema';
import type { UpdateSchoolConfigInput } from '@so-chu-nhiem/shared';

@Injectable()
export class SchoolConfigService {
  constructor(@InjectModel(SchoolConfig.name) private readonly schoolConfigModel: Model<SchoolConfig>) {}

  async getConfig(): Promise<SchoolConfig> {
    const config = await this.schoolConfigModel.findOne().exec();
    if (!config) {
      throw new NotFoundException('Chưa có cấu hình trường, vui lòng chạy seed hoặc tạo cấu hình trước');
    }
    return config;
  }

  async update(input: UpdateSchoolConfigInput): Promise<SchoolConfig> {
    const config = await this.getConfig();
    if (input.weeklyViolationThreshold !== undefined) config.weeklyViolationThreshold = input.weeklyViolationThreshold;
    if (input.defaultPunishmentDueDays !== undefined) config.defaultPunishmentDueDays = input.defaultPunishmentDueDays;
    if (input.defaultWeeklyPunishmentLines !== undefined)
      config.defaultWeeklyPunishmentLines = input.defaultWeeklyPunishmentLines;
    if (input.saturdayIsSchoolDay !== undefined) config.saturdayIsSchoolDay = input.saturdayIsSchoolDay;
    await config.save();
    return config;
  }
}
