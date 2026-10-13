import { apiSlice } from './api-slice';

export const positionsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getMyPositions: builder.query({
      query: () => '/positions/mine',
      providesTags: ['MyPositions'],
    }),
    joinPosition: builder.mutation({
      query: (body) => ({ url: '/positions/join', method: 'POST', body }),
      // Response là 1 Position (có classId) nên lấy thẳng id lớp từ đó để invalidate đúng ClassDetail —
      // không cần component tự truyền classId cho endpoint này (khác reassignPosition bên dưới).
      // 'TeacherWeek': 2 lưới tuần của giáo viên (/timetable/me, /lesson-logs/week) gom theo tập vị trí đang giữ.
      invalidatesTags: (result) =>
        result ? ['MyPositions', 'TeacherWeek', { type: 'ClassDetail', id: result.classId }] : ['MyPositions', 'TeacherWeek'],
    }),
    releasePosition: builder.mutation({
      query: (positionId) => ({ url: `/positions/${positionId}/release`, method: 'POST' }),
      invalidatesTags: (result) =>
        result ? ['MyPositions', 'TeacherWeek', { type: 'ClassDetail', id: result.classId }] : ['MyPositions', 'TeacherWeek'],
    }),
    // Response của reassign chỉ trả về 1 Position, không cho biết "giáo viên cũ" là ai — component gọi
    // mutation này phải tự cung cấp classId/oldTeacherId để invalidate đúng cache của cả 2 giáo viên.
    reassignPosition: builder.mutation({
      query: ({ positionId, teacherId }) => ({
        url: `/positions/${positionId}/reassign`,
        method: 'PATCH',
        body: { teacherId },
      }),
      invalidatesTags: (result, error, { classId, oldTeacherId, teacherId }) => [
        'TeacherWeek',
        { type: 'ClassDetail', id: classId },
        { type: 'TeacherPositions', id: oldTeacherId },
        { type: 'TeacherPositions', id: teacherId },
      ],
    }),
  }),
});

export const {
  useGetMyPositionsQuery,
  useJoinPositionMutation,
  useReleasePositionMutation,
  useReassignPositionMutation,
} = positionsApi;
