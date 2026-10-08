import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { SchoolYear } from '../database/schemas/school-year.schema';
import type { CreateSchoolYearInput } from '@so-chu-nhiem/shared';

@Injectable()
export class SchoolYearsService {
  constructor(
    @InjectModel(SchoolYear.name) private readonly schoolYearModel: Model<SchoolYear>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async getCurrent(): Promise<SchoolYear> {
    const current = await this.schoolYearModel.findOne({ isCurrent: true }).exec();
    if (!current) {
      throw new NotFoundException('Chưa có năm học hiện hành, vui lòng tạo năm học trước');
    }
    return current;
  }

  async list(): Promise<SchoolYear[]> {
    return this.schoolYearModel.find().exec();
  }

  async create(input: CreateSchoolYearInput): Promise<SchoolYear> {
    if (!input.isCurrent) {
      return this.schoolYearModel.create(input);
    }

    const session = await this.connection.startSession();
    try {
      let created!: SchoolYear;
      await session.withTransaction(async () => {
        await this.schoolYearModel.updateMany(
          { isCurrent: true },
          { isCurrent: false },
          { session },
        );
        const [doc] = await this.schoolYearModel.create([input], { session });
        created = doc;
      });
      return created;
    } finally {
      await session.endSession();
    }
  }
}
