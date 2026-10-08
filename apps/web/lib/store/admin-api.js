import { apiSlice } from './api-slice';

export const adminApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getTeachers: builder.query({
      query: () => '/admin/teachers',
      providesTags: ['Teachers'],
    }),
    setTeacherActive: builder.mutation({
      query: ({ id, isActive }) => ({ url: `/admin/teachers/${id}/active`, method: 'PATCH', body: { isActive } }),
      invalidatesTags: ['Teachers'],
    }),
    getTeacherPositions: builder.query({
      query: (teacherId) => `/admin/teachers/${teacherId}/positions`,
      providesTags: (result, error, teacherId) => [{ type: 'TeacherPositions', id: teacherId }],
    }),
  }),
});

export const {
  useGetTeachersQuery,
  useSetTeacherActiveMutation,
  useGetTeacherPositionsQuery,
} = adminApi;
