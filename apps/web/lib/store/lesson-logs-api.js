import { apiSlice } from './api-slice';

// Chỉ gắn tham số có giá trị: ô ngày bị xóa trống cho chuỗi rỗng và backend trả 400 cho `from=`.
function buildQueryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const lessonLogsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPositionLessonLogs: builder.query({
      query: ({ positionId, from, to }) => `/positions/${positionId}/lesson-logs${buildQueryString({ from, to })}`,
      providesTags: (result, error, { positionId }) => [{ type: 'LessonLogs', id: positionId }],
    }),
    // Chỉ TEACHER (ADMIN/STUDENT bị 403). Response là MẢNG buổi học của mọi vị trí SUBJECT giáo viên đang giữ.
    // Không có weekStart thì backend tự lấy tuần hiện tại theo giờ Việt Nam.
    getTeacherWeekLessonLogs: builder.query({
      query: ({ weekStart } = {}) => `/lesson-logs/week${buildQueryString({ weekStart })}`,
      providesTags: ['TeacherWeek'],
    }),
    // Chuyển ngày làm backend xếp lại các buổi chưa khóa của cả vị trí quanh buổi vừa chuyển, nên phải làm mới mọi
    // query của vị trí đó (mọi from/to) và mọi lưới tuần, không chỉ buổi vừa sửa.
    updateLessonLog: builder.mutation({
      query: ({ positionId, logId, ...body }) => ({
        url: `/positions/${positionId}/lesson-logs/${logId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (result, error, { positionId }) => [{ type: 'LessonLogs', id: positionId }, 'TeacherWeek'],
    }),
  }),
});

export const {
  useGetPositionLessonLogsQuery,
  useGetTeacherWeekLessonLogsQuery,
  useUpdateLessonLogMutation,
} = lessonLogsApi;
