import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import type { CreateHolidayInput, UpdateHolidayInput } from '@so-chu-nhiem/shared';
import { Holiday } from '../database/schemas/holiday.schema';
import { SchoolYear } from '../database/schemas/school-year.schema';
import { Clock } from '../common/utils/clock';
import { minDate, todayDateOnlyVN } from '../common/utils/date';
import { runInTransaction } from '../common/utils/transaction';
import { LessonLogEngineService } from '../lesson-logs/lesson-log-engine.service';
import { SchoolConfigService } from '../school-config/school-config.service';
import { CalendarStats, computeCalendarStats } from './calendar-stats';

const END_BEFORE_START_MESSAGE = 'Ngày kết thúc không được trước ngày bắt đầu';

@Injectable()
export class HolidaysService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Holiday.name) private readonly holidayModel: Model<Holiday>,
    @InjectModel(SchoolYear.name) private readonly schoolYearModel: Model<SchoolYear>,
    private readonly schoolConfigService: SchoolConfigService,
    private readonly engine: LessonLogEngineService,
    private readonly clock: Clock,
  ) {}

  async listBySchoolYear(schoolYearId: string): Promise<Holiday[]> {
    const year = await this.requireSchoolYear(schoolYearId);
    return this.holidayModel.find({ schoolYearId: year._id }).sort({ startDate: 1, endDate: 1, _id: 1 }).exec();
  }

  // Mọi thao tác ghi ngày nghỉ chạy chung 1 transaction với lần tính lại sổ báo giảng của cả năm học: tính lại lỗi
  // thì ngày nghỉ cũng không được lưu (không để lịch nghỉ mới mà sổ báo giảng vẫn theo lịch cũ).
  async create(input: CreateHolidayInput): Promise<Holiday> {
    const year = await this.requireSchoolYear(input.schoolYearId);
    return runInTransaction(this.connection, async (session) => {
      const [holiday] = await this.holidayModel.create(
        [
          {
            schoolYearId: year._id,
            startDate: input.startDate,
            endDate: input.endDate,
            type: input.type,
            name: input.name,
          },
        ],
        { session },
      );
      await this.recalculate(year._id, holiday.startDate, session);
      return holiday;
    });
  }

  async update(id: string, input: UpdateHolidayInput): Promise<Holiday> {
    return runInTransaction(this.connection, async (session) => {
      const existing = await this.requireHoliday(id, session);

      // Schema dùng chung chỉ so sánh khi gửi đủ 2 ngày; gửi 1 ngày thì phải so với giá trị đã lưu.
      const startDate = input.startDate ?? existing.startDate;
      const endDate = input.endDate ?? existing.endDate;
      if (endDate.getTime() < startDate.getTime()) {
        throw new BadRequestException(END_BEFORE_START_MESSAGE);
      }

      // Khoảng bị ảnh hưởng bắt đầu từ ngày bắt đầu sớm hơn giữa giá trị cũ và mới.
      const fromDate = minDate(existing.startDate, startDate);
      existing.set({ startDate, endDate, type: input.type ?? existing.type, name: input.name ?? existing.name });
      await existing.save({ session });
      await this.recalculate(existing.schoolYearId, fromDate, session);
      return existing;
    });
  }

  async remove(id: string): Promise<{ deleted: true }> {
    return runInTransaction(this.connection, async (session) => {
      const holiday = await this.requireHoliday(id, session);
      await this.holidayModel.deleteOne({ _id: holiday._id }, { session });
      await this.recalculate(holiday.schoolYearId, holiday.startDate, session);
      return { deleted: true as const };
    });
  }

  async getCalendarStats(schoolYearId: string, asOf?: Date): Promise<CalendarStats> {
    const year = await this.requireSchoolYear(schoolYearId);
    const config = await this.schoolConfigService.getConfig();
    const holidays = await this.holidayModel.find({ schoolYearId: year._id }).exec();
    return computeCalendarStats({
      yearStart: year.startDate,
      yearEnd: year.endDate,
      asOf: asOf ?? todayDateOnlyVN(this.clock.now()),
      saturdayIsSchoolDay: config.saturdayIsSchoolDay,
      holidays,
    });
  }

  private async recalculate(schoolYearId: Types.ObjectId, fromDate: Date, session: ClientSession): Promise<void> {
    await this.engine.recalculateSchoolYear(String(schoolYearId), fromDate, session);
  }

  // schoolYearId chỉ được schema dùng chung kiểm là chuỗi không rỗng nên id sai định dạng cũng phải ra 404.
  private async requireSchoolYear(schoolYearId: string): Promise<SchoolYear> {
    const year = Types.ObjectId.isValid(schoolYearId) ? await this.schoolYearModel.findById(schoolYearId).exec() : null;
    if (!year) throw new NotFoundException('Không tìm thấy năm học');
    return year;
  }

  private async requireHoliday(id: string, session: ClientSession) {
    const holiday = Types.ObjectId.isValid(id) ? await this.holidayModel.findById(id).session(session) : null;
    if (!holiday) throw new NotFoundException('Không tìm thấy ngày nghỉ');
    return holiday;
  }
}
