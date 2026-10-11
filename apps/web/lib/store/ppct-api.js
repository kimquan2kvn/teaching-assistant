import { apiSlice } from './api-slice';

// Mọi thao tác ghi PPCT làm backend tính lại sổ báo giảng của đúng vị trí đó (cùng 1 transaction) và dịch các buổi
// trong tuần của giáo viên: 'TeacherWeek' để KHÔNG kèm id nghĩa là khớp mọi tuần đang cache.
const invalidatesAfterPpctWrite = (result, error, { positionId }) => [
  { type: 'PpctItems', id: positionId },
  { type: 'LessonLogs', id: positionId },
  'TeacherWeek',
];

export const ppctApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPositionPpct: builder.query({
      query: (positionId) => `/positions/${positionId}/ppct`,
      providesTags: (result, error, positionId) => [{ type: 'PpctItems', id: positionId }],
    }),
    createPpctItem: builder.mutation({
      query: ({ positionId, ...body }) => ({ url: `/positions/${positionId}/ppct`, method: 'POST', body }),
      invalidatesTags: invalidatesAfterPpctWrite,
    }),
    // Body gửi nguyên văn, không lọc giá trị rỗng: backend giữ ghi chú cũ khi vắng khóa `note` và chỉ xóa khi nhận
    // `note: ''`. `order` không sửa được qua PATCH.
    updatePpctItem: builder.mutation({
      query: ({ positionId, itemId, ...body }) => ({
        url: `/positions/${positionId}/ppct/${itemId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: invalidatesAfterPpctWrite,
    }),
    deletePpctItem: builder.mutation({
      query: ({ positionId, itemId }) => ({ url: `/positions/${positionId}/ppct/${itemId}`, method: 'DELETE' }),
      invalidatesTags: invalidatesAfterPpctWrite,
    }),
    // Nhận FormData thay vì JSON (khuôn importPreview của students-api): để browser tự đặt Content-Type
    // multipart kèm boundary. Backend chỉ đọc file và trả { rows }, không ghi gì nên KHÔNG invalidate.
    importPpctPreview: builder.mutation({
      query: ({ positionId, file }) => {
        const formData = new FormData();
        formData.append('file', file);
        return { url: `/positions/${positionId}/ppct/import/preview`, method: 'POST', body: formData };
      },
    }),
    importPpctCommit: builder.mutation({
      query: ({ positionId, rows }) => ({
        url: `/positions/${positionId}/ppct/import/commit`,
        method: 'POST',
        body: { rows },
      }),
      invalidatesTags: invalidatesAfterPpctWrite,
    }),
  }),
});

export const {
  useGetPositionPpctQuery,
  useCreatePpctItemMutation,
  useUpdatePpctItemMutation,
  useDeletePpctItemMutation,
  useImportPpctPreviewMutation,
  useImportPpctCommitMutation,
} = ppctApi;
