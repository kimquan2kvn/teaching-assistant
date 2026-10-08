import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AttendanceRecord, AttendanceStatus } from '../database/schemas/attendance-record.schema';
import { Position } from '../database/schemas/position.schema';
import { parseDateOnly } from '../common/utils/date';

@Injectable()
export class AttendanceService {
  constructor(@InjectModel(AttendanceRecord.name) private readonly attendanceModel: Model<AttendanceRecord>) {}

  async markAttendance(
    position: Position,
    dateStr: string,
    entries: Array<{ studentId: string; status: AttendanceStatus }>,
    recordedBy: string,
  ): Promise<AttendanceRecord[]> {
    const date = parseDateOnly(dateStr);
    const keepStudentIds = entries.map((e) => e.studentId);
    await this.attendanceModel
      .deleteMany({ positionId: position._id, date, studentId: { $nin: keepStudentIds } })
      .exec();
    await Promise.all(
      entries.map((e) =>
        this.attendanceModel
          .findOneAndUpdate(
            { positionId: position._id, studentId: e.studentId, date },
            { classId: position.classId, status: e.status, recordedBy },
            { upsert: true, new: true },
          )
          .exec(),
      ),
    );
    return this.getByPosition(String(position._id), dateStr);
  }

  async getByPosition(positionId: string, dateStr: string): Promise<AttendanceRecord[]> {
    const date = parseDateOnly(dateStr);
    return this.attendanceModel.find({ positionId, date }).exec();
  }

  async getClassSummary(classId: string, dateStr: string): Promise<Record<AttendanceStatus, number>> {
    const date = parseDateOnly(dateStr);
    const counts: Record<AttendanceStatus, number> = { PRESENT: 0, EXCUSED: 0, LATE: 0, UNEXCUSED: 0 };
    const records = await this.attendanceModel.find({ classId, date }).exec();
    for (const r of records) counts[r.status] += 1;
    return counts;
  }
}
