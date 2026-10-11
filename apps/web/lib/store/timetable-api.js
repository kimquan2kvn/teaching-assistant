import { apiSlice } from './api-slice';

// Ghi tiết nào cũng làm backend tính lại sổ báo giảng của đúng vị trí đó (cùng transaction với việc ghi tiết) và có
// thể dịch buổi học sang nhiều tuần, nên làm mới mọi lưới tuần đang cache (tag 'TeacherWeek' không kèm id) thay vì
// đoán tuần nào bị ảnh hưởng.
function invalidatesAfterSlotWrite(result, error, { positionId }) {
  return [
    { type: 'TimetableSlots', id: positionId },
    { type: 'LessonLogs', id: positionId },
    'TeacherWeek',
  ];
}

export const timetableApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPositionTimetableSlots: builder.query({
      query: (positionId) => `/positions/${positionId}/timetable-slots`,
      providesTags: (result, error, positionId) => [{ type: 'TimetableSlots', id: positionId }],
    }),
    createTimetableSlot: builder.mutation({
      query: ({ positionId, ...body }) => ({
        url: `/positions/${positionId}/timetable-slots`,
        method: 'POST',
        body,
      }),
      invalidatesTags: invalidatesAfterSlotWrite,
    }),
    updateTimetableSlot: builder.mutation({
      query: ({ positionId, slotId, ...body }) => ({
        url: `/positions/${positionId}/timetable-slots/${slotId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: invalidatesAfterSlotWrite,
    }),
    deleteTimetableSlot: builder.mutation({
      query: ({ positionId, slotId }) => ({
        url: `/positions/${positionId}/timetable-slots/${slotId}`,
        method: 'DELETE',
      }),
      invalidatesTags: invalidatesAfterSlotWrite,
    }),
    // Chỉ TEACHER (ADMIN/STUDENT bị 403). Không có weekStart thì backend tự lấy tuần hiện tại theo giờ Việt Nam.
    getMyTimetableWeek: builder.query({
      query: ({ weekStart } = {}) => (weekStart ? `/timetable/me?weekStart=${weekStart}` : '/timetable/me'),
      providesTags: ['TeacherWeek'],
    }),
  }),
});

export const {
  useGetPositionTimetableSlotsQuery,
  useCreateTimetableSlotMutation,
  useUpdateTimetableSlotMutation,
  useDeleteTimetableSlotMutation,
  useGetMyTimetableWeekQuery,
} = timetableApi;
