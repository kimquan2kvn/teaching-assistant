import { Injectable } from '@nestjs/common';
import { AttendanceService } from '../attendance/attendance.service';
import { ConductLogService } from '../conduct-log/conduct-log.service';
import { PunishmentsService } from '../punishments/punishments.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly conductLogService: ConductLogService,
    private readonly punishmentsService: PunishmentsService,
  ) {}

  async getClassDashboard(classId: string, dateStr: string) {
    const [attendanceSummary, recentConductLogs, conductRating, pendingPunishments] = await Promise.all([
      this.attendanceService.getClassSummary(classId, dateStr),
      this.conductLogService.listByClass(classId),
      this.conductLogService.getWeeklyRating(classId, dateStr),
      this.punishmentsService.listByClass(classId, { status: 'PENDING' }),
    ]);
    return {
      attendanceSummary,
      recentConductLogs: recentConductLogs.slice(0, 20),
      conductRating,
      pendingPunishments,
    };
  }
}
