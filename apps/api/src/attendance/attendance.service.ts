import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { AttendanceRecord, AttendanceStatus } from '../database/schemas/attendance-record.schema';
import { Position } from '../database/schemas/position.schema';
import { StudentsService } from '../students/students.service';
import { parseDateOnly } from '../common/utils/date';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(AttendanceRecord.name) private readonly attendanceModel: Model<AttendanceRecord>,
    @InjectModel(Position.name) private readonly positionModel: Model<Position>,
    @InjectConnection() private readonly connection: Connection,
    private readonly studentsService: StudentsService,
  ) {}

  async markAttendance(
    position: Position,
    dateStr: string,
    entries: Array<{ studentId: string; status: AttendanceStatus }>,
    recordedBy: string,
  ): Promise<AttendanceRecord[]> {
    const date = parseDateOnly(dateStr);
    const keepStudentIds = entries.map((e) => e.studentId);
    await this.studentsService.verifyAllInClass(String(position.classId), keepStudentIds);

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.attendanceModel
          .deleteMany({ positionId: position._id, date, studentId: { $nin: keepStudentIds } })
          .session(session);
        await Promise.all(
          entries.map((e) =>
            this.attendanceModel
              .findOneAndUpdate(
                { positionId: position._id, studentId: e.studentId, date },
                { classId: position.classId, status: e.status, recordedBy },
                { upsert: true, new: true, session },
              )
              .exec(),
          ),
        );
      });
    } finally {
      await session.endSession();
    }
    return this.getByPosition(String(position._id), dateStr);
  }

  async getByPosition(positionId: string, dateStr: string): Promise<AttendanceRecord[]> {
    const date = parseDateOnly(dateStr);
    return this.attendanceModel.find({ positionId, date }).exec();
  }

  // Tổng hợp theo đúng vị trí HOMEROOM (điểm danh "chính thức" của GVCN) — không gộp mọi vị trí SUBJECT trong
  // lớp, vì 1 học sinh có thể có nhiều bản ghi khác nhau ở các môn khác nhau cùng ngày, khiến tổng không còn
  // đúng nghĩa "điểm danh hôm nay của lớp". Học sinh không có bản ghi ngoại lệ ở HOMEROOM mặc định Có mặt.
  async getClassSummary(classId: string, dateStr: string): Promise<Record<AttendanceStatus, number>> {
    const date = parseDateOnly(dateStr);
    const counts: Record<AttendanceStatus, number> = { PRESENT: 0, EXCUSED: 0, LATE: 0, UNEXCUSED: 0 };
    const homeroom = await this.positionModel.findOne({ classId, type: 'HOMEROOM' }).exec();
    if (!homeroom) return counts;

    const roster = await this.studentsService.list(classId, 'ACTIVE');
    const records = await this.attendanceModel.find({ positionId: homeroom._id, date }).exec();
    const statusByStudentId = new Map(records.map((r) => [String(r.studentId), r.status]));
    for (const student of roster) {
      const status = statusByStudentId.get(String(student._id)) ?? 'PRESENT';
      counts[status] += 1;
    }
    return counts;
  }
}
