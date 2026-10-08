import { apiSlice } from './api-slice';

export const studentsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getStudents: builder.query({
      query: ({ classId, status }) => `/classes/${classId}/students?status=${status}`,
      providesTags: (result, error, { classId }) => [{ type: 'Students', id: classId }],
    }),
    createStudent: builder.mutation({
      query: ({ classId, ...body }) => ({ url: `/classes/${classId}/students`, method: 'POST', body }),
      invalidatesTags: (result, error, { classId }) => [{ type: 'Students', id: classId }],
    }),
    updateStudent: builder.mutation({
      query: ({ classId, studentId, ...body }) => ({
        url: `/classes/${classId}/students/${studentId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (result, error, { classId }) => [{ type: 'Students', id: classId }],
    }),
    transferStudent: builder.mutation({
      query: ({ classId, studentId, ...body }) => ({
        url: `/classes/${classId}/students/${studentId}/transfer`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (result, error, { classId }) => [{ type: 'Students', id: classId }],
    }),
    // Nhận FormData thay vì JSON: không dùng cách serialize mặc định của fetchBaseQuery (chỉ JSON-stringify
    // plain object), nên tự dựng FormData ở đây để browser tự set Content-Type: multipart/form-data kèm boundary.
    importPreview: builder.mutation({
      query: ({ classId, file }) => {
        const formData = new FormData();
        formData.append('file', file);
        return { url: `/classes/${classId}/students/import-preview`, method: 'POST', body: formData };
      },
    }),
    importConfirm: builder.mutation({
      query: ({ classId, rows }) => ({
        url: `/classes/${classId}/students/import-confirm`,
        method: 'POST',
        body: { rows },
      }),
      invalidatesTags: (result, error, { classId }) => [{ type: 'Students', id: classId }],
    }),
  }),
});

export const {
  useGetStudentsQuery,
  useCreateStudentMutation,
  useUpdateStudentMutation,
  useTransferStudentMutation,
  useImportPreviewMutation,
  useImportConfirmMutation,
} = studentsApi;
