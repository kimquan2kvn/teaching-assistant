import { z } from 'zod';

export const attendanceStatusEnum = z.enum(['PRESENT', 'EXCUSED', 'LATE', 'UNEXCUSED']);
export type AttendanceStatus = z.infer<typeof attendanceStatusEnum>;

export const markAttendanceSchema = z
  .object({
    entries: z
      .array(z.object({ studentId: z.string().min(1), status: attendanceStatusEnum }))
      .max(200),
  })
  .refine((data) => new Set(data.entries.map((e) => e.studentId)).size === data.entries.length, {
    message: 'Danh sách điểm danh có học sinh bị lặp lại',
    path: ['entries'],
  });
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
