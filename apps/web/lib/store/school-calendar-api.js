import { apiSlice } from './api-slice';

// Ghi ngày nghỉ làm backend tính lại sổ báo giảng của MỌI vị trí có PPCT trong năm học (cùng 1 transaction, có thể
// mất vài giây). Ngoài danh sách + thống kê của đúng năm học đó, phải làm mới cả mọi query sổ báo giảng đang cache:
// 'LessonLogs' và 'TeacherWeek' để KHÔNG kèm id nghĩa là khớp mọi vị trí/tuần.
const invalidatesAfterHolidayWrite = (result, error, { schoolYearId }) => [
  { type: 'Holidays', id: schoolYearId },
  { type: 'CalendarStats', id: schoolYearId },
  'LessonLogs',
  'TeacherWeek',
];

export const schoolCalendarApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Mọi vai trò đã đăng nhập đọc được; backend không sắp xếp (find() thô) nên nơi dùng tự chọn năm hiện hành.
    getSchoolYears: builder.query({
      query: () => '/school-years',
      providesTags: ['SchoolYears'],
    }),
    getHolidays: builder.query({
      query: (schoolYearId) => `/school-years/${schoolYearId}/holidays`,
      providesTags: (result, error, schoolYearId) => [{ type: 'Holidays', id: schoolYearId }],
    }),
    // Cố ý không gửi `asOf`: backend mặc định là hôm nay theo giờ Việt Nam, FE không tự tính ngày.
    getCalendarStats: builder.query({
      query: (schoolYearId) => `/school-years/${schoolYearId}/calendar-stats`,
      providesTags: (result, error, schoolYearId) => [{ type: 'CalendarStats', id: schoolYearId }],
    }),
    createHoliday: builder.mutation({
      query: (body) => ({ url: '/holidays', method: 'POST', body }),
      invalidatesTags: invalidatesAfterHolidayWrite,
    }),
    // `schoolYearId` chỉ dùng để invalidate đúng năm học: ngày nghỉ không chuyển được sang năm khác nên tách khỏi
    // body (backend cũng bỏ qua khóa này).
    updateHoliday: builder.mutation({
      query: ({ id, schoolYearId, ...body }) => ({ url: `/holidays/${id}`, method: 'PATCH', body }),
      invalidatesTags: invalidatesAfterHolidayWrite,
    }),
    deleteHoliday: builder.mutation({
      query: ({ id }) => ({ url: `/holidays/${id}`, method: 'DELETE' }),
      invalidatesTags: invalidatesAfterHolidayWrite,
    }),
  }),
});

export const {
  useGetSchoolYearsQuery,
  useGetHolidaysQuery,
  useGetCalendarStatsQuery,
  useCreateHolidayMutation,
  useUpdateHolidayMutation,
  useDeleteHolidayMutation,
} = schoolCalendarApi;
