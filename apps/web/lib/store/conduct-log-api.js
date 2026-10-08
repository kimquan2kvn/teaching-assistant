import { apiSlice } from './api-slice';

export const conductLogApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Trả nguyên {conductLog, punishments} từ BE — 1 lần ghi vi phạm/điểm cộng có thể kéo theo tạo Punishment
    // (chép phạt tự động), nên invalidate cả 4 mặt dữ liệu liên quan thay vì chỉ ConductLogs.
    createConductLog: builder.mutation({
      query: ({ positionId, classId, ...body }) => ({
        url: `/positions/${positionId}/conduct-logs`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (result, error, { classId }) => [
        { type: 'ConductLogs', id: classId },
        { type: 'ConductRating', id: classId },
        { type: 'Punishments', id: classId },
        { type: 'Dashboard', id: classId },
      ],
    }),
    getClassConductLogs: builder.query({
      query: ({ classId, studentId }) =>
        studentId ? `/classes/${classId}/conduct-logs?studentId=${studentId}` : `/classes/${classId}/conduct-logs`,
      providesTags: (result, error, { classId }) => [{ type: 'ConductLogs', id: classId }],
    }),
  }),
});

export const { useCreateConductLogMutation, useGetClassConductLogsQuery } = conductLogApi;
