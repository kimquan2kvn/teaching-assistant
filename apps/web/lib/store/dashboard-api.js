import { apiSlice } from './api-slice';

export const dashboardApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Response gộp 4 khối: {attendanceSummary, recentConductLogs, conductRating, pendingPunishments} — xem
    // DashboardService.getClassDashboard ở BE. CHỈ `attendanceSummary` dùng `date` theo đúng nghĩa "của ngày
    // này"; `conductRating` dùng `date` để suy ra TUẦN chứa ngày đó; `recentConductLogs`/`pendingPunishments`
    // không nhận `date` ở BE (luôn là "gần nhất"/"đang chờ" bất kể `date` truyền lên là gì) — FE không được vẽ
    // UI ngụ ý ngày ảnh hưởng cả 4 khối.
    getClassDashboard: builder.query({
      query: ({ classId, date }) => `/classes/${classId}/dashboard?date=${date}`,
      providesTags: (result, error, { classId }) => [{ type: 'Dashboard', id: classId }],
    }),
  }),
});

export const { useGetClassDashboardQuery } = dashboardApi;
