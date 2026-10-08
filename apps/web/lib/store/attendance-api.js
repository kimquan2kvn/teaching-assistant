import { apiSlice } from './api-slice';

export const attendanceApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPositionAttendance: builder.query({
      query: ({ positionId, date }) => `/positions/${positionId}/attendance?date=${date}`,
      providesTags: (result, error, { positionId }) => [{ type: 'PositionAttendance', id: positionId }],
    }),
    // PUT thay thế toàn bộ bản ghi ngoại lệ của positionId+date: `entries` CHỈ chứa học sinh khác "Có mặt"
    // (xem markAttendanceSchema/AttendanceService.markAttendance ở BE) — trang gọi endpoint này chịu trách
    // nhiệm lọc trước khi gửi, không lọc lại ở đây.
    markAttendance: builder.mutation({
      query: ({ positionId, date, entries }) => ({
        url: `/positions/${positionId}/attendance?date=${date}`,
        method: 'PUT',
        body: { entries },
      }),
      // Điểm danh HOMEROOM đổi thì cả thống kê lớp (ClassAttendanceSummary) lẫn Dashboard theo lớp đều lệch
      // theo (DashboardService dùng chung AttendanceService.getClassSummary) — invalidate cả 2, không chỉ
      // riêng PositionAttendance của vị trí vừa ghi.
      invalidatesTags: (result, error, { positionId, classId }) => [
        { type: 'PositionAttendance', id: positionId },
        { type: 'ClassAttendanceSummary', id: classId },
        { type: 'Dashboard', id: classId },
      ],
    }),
    // Luôn tính theo vị trí HOMEROOM của lớp (điểm danh "chính thức"), không gộp các vị trí SUBJECT — xem
    // AttendanceService.getClassSummary ở BE.
    getClassAttendanceSummary: builder.query({
      query: ({ classId, date }) => `/classes/${classId}/attendance/summary?date=${date}`,
      providesTags: (result, error, { classId }) => [{ type: 'ClassAttendanceSummary', id: classId }],
    }),
  }),
});

export const {
  useGetPositionAttendanceQuery,
  useMarkAttendanceMutation,
  useGetClassAttendanceSummaryQuery,
} = attendanceApi;
