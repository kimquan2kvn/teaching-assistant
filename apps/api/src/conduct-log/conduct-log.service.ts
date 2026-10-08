import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConductLog } from '../database/schemas/conduct-log.schema';
import { Position } from '../database/schemas/position.schema';
import { getConductRatingLabel } from '@so-chu-nhiem/shared';
import type { CreateConductLogInput } from '@so-chu-nhiem/shared';
import { ConductCatalogService } from '../conduct-catalog/conduct-catalog.service';
import { StudentsService } from '../students/students.service';
import { getIsoWeekStartVN, parseDateOnly } from '../common/utils/date';

@Injectable()
export class ConductLogService {
  constructor(
    @InjectModel(ConductLog.name) private readonly conductLogModel: Model<ConductLog>,
    private readonly catalogService: ConductCatalogService,
    private readonly studentsService: StudentsService,
  ) {}

  async create(position: Position, input: CreateConductLogInput, recordedBy: string): Promise<ConductLog> {
    await this.studentsService.verifyAllInClass(String(position.classId), [input.studentId]);
    const date = new Date();
    const doc: Partial<ConductLog> = {
      classId: position.classId,
      positionId: position._id as unknown as ConductLog['positionId'],
      studentId: input.studentId as unknown as ConductLog['studentId'],
      date,
      weekStart: getIsoWeekStartVN(date),
      recordedBy: recordedBy as unknown as ConductLog['recordedBy'],
      note: input.note,
    };
    if ('catalogItemId' in input) {
      const item = await this.catalogService.findByIdOrThrow(input.catalogItemId);
      doc.catalogItemId = item._id as unknown as ConductLog['catalogItemId'];
      doc.points = item.kind === 'VIOLATION' ? -item.points : item.points;
    } else {
      doc.catalogItemId = null;
      doc.points = input.kind === 'VIOLATION' ? -input.points : input.points;
    }
    return this.conductLogModel.create(doc);
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
