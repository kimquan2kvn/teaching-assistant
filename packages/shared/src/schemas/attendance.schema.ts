import { z } from 'zod';

export const attendanceStatusEnum = z.enum(['PRESENT', 'EXCUSED', 'LATE', 'UNEXCUSED']);
export type AttendanceStatus = z.infer<typeof attendanceStatusEnum>;

export const markAttendanceSchema = z.object({
  entries: z
    .array(z.object({ studentId: z.string().min(1), status: attendanceStatusEnum }))
    .max(200),
});
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
