import { apiSlice } from './api-slice';

export const classesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    createClass: builder.mutation({
      query: (body) => ({ url: '/classes', method: 'POST', body }),
      invalidatesTags: ['MyPositions'],
    }),
    // Dùng ở màn tham gia lớp (nhập mã) — fetch-on-demand, không cần tag cache vì availability (taken/trống)
    // đổi liên tục và màn đó tự refetch tay sau mỗi lần join thất bại (xem Bước 2.3 của plan).
    getClassByCode: builder.query({
      query: (code) => `/classes/${code}`,
    }),
    getClassDetail: builder.query({
      query: (classId) => `/classes/${classId}/detail`,
      providesTags: (result, error, classId) => [{ type: 'ClassDetail', id: classId }],
    }),
  }),
});

export const {
  useCreateClassMutation,
  useGetClassByCodeQuery,
  useLazyGetClassByCodeQuery,
  useGetClassDetailQuery,
} = classesApi;
