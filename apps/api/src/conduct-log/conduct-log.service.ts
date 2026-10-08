import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConductLog } from '../database/schemas/conduct-log.schema';
import { Position } from '../database/schemas/position.schema';
import { Punishment } from '../database/schemas/punishment.schema';
import { ConductSpecialRule } from '../database/schemas/conduct-catalog-item.schema';
import { getConductRatingLabel, HOMEWORK_NOT_DONE_LINES_BY_OCCURRENCE } from '@so-chu-nhiem/shared';
import type { CreateConductLogInput } from '@so-chu-nhiem/shared';
import { ConductCatalogService } from '../conduct-catalog/conduct-catalog.service';
import { StudentsService } from '../students/students.service';
import { SchoolConfigService } from '../school-config/school-config.service';
import { addDays, getIsoWeekStartVN, parseDateOnly } from '../common/utils/date';

@Injectable()
export class ConductLogService {
  constructor(
    @InjectModel(ConductLog.name) private readonly conductLogModel: Model<ConductLog>,
    @InjectModel(Punishment.name) private readonly punishmentModel: Model<Punishment>,
    private readonly catalogService: ConductCatalogService,
    private readonly studentsService: StudentsService,
    private readonly schoolConfigService: SchoolConfigService,
  ) {}

  // Không bọc trong 1 transaction nhiều-document: ConductLog và các Punishment không cần tính atomic CHUNG với
  // nhau — mỗi document tự nó đã atomic (insert 1 document luôn atomic trong MongoDB), và quan trọng hơn: MongoDB
  // ABORT TOÀN BỘ transaction ngay khi 1 lệnh bên trong lỗi (kể cả lỗi đã được catch ở tầng ứng dụng) — nghĩa là
  // "bắt lỗi 11000 rồi tiếp tục" như thiết kế ban đầu của plan KHÔNG hoạt động được trong 1 transaction thật: thử
  // nghiệm thực tế gây treo/làm hỏng cả replica set dùng chung cho test. Chỉ rule theo tuần cần chống trùng (dựa
  // vào unique index + bắt lỗi 11000, coi là tín hiệu "đã tồn tại" chứ không phải lỗi thật) — ghi tuần tự, không
  // transaction, là đủ: nếu crash giữa chừng, tệ nhất là thiếu 1 Punishment chưa tạo kịp, không phải dữ liệu sai.
  async create(
    position: Position,
    input: CreateConductLogInput,
    recordedBy: string,
  ): Promise<{ conductLog: ConductLog; punishments: Punishment[] }> {
    await this.studentsService.verifyAllInClass(String(position.classId), [input.studentId]);

    const date = new Date();
    const weekStart = getIsoWeekStartVN(date);
    const doc: Partial<ConductLog> = {
      classId: position.classId,
      positionId: position._id as unknown as ConductLog['positionId'],
      studentId: input.studentId as unknown as ConductLog['studentId'],
      date,
      weekStart,
      recordedBy: recordedBy as unknown as ConductLog['recordedBy'],
      note: input.note,
    };
    let specialRule: ConductSpecialRule | null = null;
    if ('catalogItemId' in input) {
      const item = await this.catalogService.findByIdOrThrow(input.catalogItemId);
      doc.catalogItemId = item._id as unknown as ConductLog['catalogItemId'];
      doc.points = item.kind === 'VIOLATION' ? -item.points : item.points;
      specialRule = item.specialRule;
    } else {
      doc.catalogItemId = null;
      doc.points = input.kind === 'VIOLATION' ? -input.points : input.points;
    }
    const conductLog = await this.conductLogModel.create(doc);

    const config = await this.schoolConfigService.getConfig();
    const punishments: Punishment[] = [];

    if (conductLog.points < 0) {
      const violationCount = await this.conductLogModel.countDocuments({
        studentId: conductLog.studentId,
        weekStart,
        points: { $lt: 0 },
      });
      if (violationCount >= config.weeklyViolationThreshold) {
        try {
          const p = await this.punishmentModel.create({
            studentId: conductLog.studentId,
            classId: conductLog.classId,
            kind: 'WEEKLY_THRESHOLD',
            reason: `Đủ ${config.weeklyViolationThreshold} vi phạm trong tuần`,
            lines: config.defaultWeeklyPunishmentLines,
            dueDate: addDays(date, config.defaultPunishmentDueDays),
            triggerConductLogId: conductLog._id,
            weekStart,
          });
          punishments.push(p);
        } catch (err) {
          if ((err as { code?: number })?.code !== 11000) throw err;
        }
      }
    }

    if (specialRule === 'HOMEWORK_NOT_DONE') {
      const occurrence = await this.conductLogModel.countDocuments({
        studentId: conductLog.studentId,
        catalogItemId: conductLog.catalogItemId,
      });
      const idx = Math.min(occurrence, HOMEWORK_NOT_DONE_LINES_BY_OCCURRENCE.length) - 1;
      const lines = HOMEWORK_NOT_DONE_LINES_BY_OCCURRENCE[idx];
      const notifyParent = occurrence >= HOMEWORK_NOT_DONE_LINES_BY_OCCURRENCE.length;
      const p = await this.punishmentModel.create({
        studentId: conductLog.studentId,
        classId: conductLog.classId,
        kind: 'HOMEWORK_REPEAT',
        reason: `Không làm bài tập về nhà (lần ${occurrence})`,
        lines,
        notifyParent,
        dueDate: addDays(date, config.defaultPunishmentDueDays),
        triggerConductLogId: conductLog._id,
      });
      punishments.push(p);
    }

    return { conductLog, punishments };
  }

  async listByClass(classId: string, filter?: { studentId?: string }): Promise<ConductLog[]> {
    if (!Types.ObjectId.isValid(classId)) {
      throw new BadRequestException('Mã lớp không hợp lệ');
    }
    const query: Record<string, unknown> = { classId };
    if (filter?.studentId) {
      if (!Types.ObjectId.isValid(filter.studentId)) {
        throw new BadRequestException('Mã học sinh không hợp lệ');
      }
      query.studentId = filter.studentId;
    }
    return this.conductLogModel.find(query).sort({ date: -1 }).exec();
  }

  async getWeeklyRating(
    classId: string,
    dateInWeek: string,
  ): Promise<Array<{ studentId: string; score: number; label: string }>> {
    if (!Types.ObjectId.isValid(classId)) {
      throw new BadRequestException('Mã lớp không hợp lệ');
    }
    const weekStart = getIsoWeekStartVN(parseDateOnly(dateInWeek));
    const rows = await this.conductLogModel.aggregate([
      { $match: { classId: new Types.ObjectId(classId), weekStart } },
      { $group: { _id: '$studentId', total: { $sum: '$points' } } },
    ]);
    const totalsByStudentId = new Map(rows.map((r) => [String(r._id), r.total as number]));

    const roster = await this.studentsService.list(classId, 'ACTIVE');
    return roster.map((student) => {
      const total = totalsByStudentId.get(String(student._id)) ?? 0;
      const score = 100 + total;
      return { studentId: String(student._id), score, label: getConductRatingLabel(score) };
    });
  }
}
