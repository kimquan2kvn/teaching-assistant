import { apiSlice } from './api-slice';

export const punishmentsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // PositionGuard('ANY') ở BE — bất kỳ ai giữ 1 vị trí nào của lớp đều xem được TOÀN BỘ chép phạt của cả
    // lớp, không lọc theo vị trí ghi (xem "Quyết định thiết kế quan trọng" trong plan).
    getClassPunishments: builder.query({
      query: ({ classId, status }) => `/classes/${classId}/punishments${status ? `?status=${status}` : ''}`,
      providesTags: (result, error, { classId }) => [{ type: 'Punishments', id: classId }],
    }),
    // `classId` chỉ dùng để invalidate cache đúng lớp — BE tự tra classId từ chính bản ghi Punishment
    // (findOrThrowWithAccess) và kiểm tra người gọi có phải GVCN đúng lớp đó hay ADMIN, không nhận classId
    // từ request.
    updatePunishmentStatus: builder.mutation({
      query: ({ id, status }) => ({ url: `/punishments/${id}/status`, method: 'PATCH', body: { status } }),
      invalidatesTags: (result, error, { classId }) => [
        { type: 'Punishments', id: classId },
        { type: 'Dashboard', id: classId },
      ],
    }),
    updatePunishmentLines: builder.mutation({
      query: ({ id, lines }) => ({ url: `/punishments/${id}/lines`, method: 'PATCH', body: { lines } }),
      invalidatesTags: (result, error, { classId }) => [
        { type: 'Punishments', id: classId },
        { type: 'Dashboard', id: classId },
      ],
    }),
  }),
});

export const {
  useGetClassPunishmentsQuery,
  useUpdatePunishmentStatusMutation,
  useUpdatePunishmentLinesMutation,
} = punishmentsApi;
