import { apiSlice } from './api-slice';

// Tách riêng khỏi conduct-log-api.js dù cùng domain BE (conduct-log.service.ts), để nhóm việc "xếp loại rèn
// luyện" không phải chờ/đụng file của nhóm "vi phạm & điểm cộng" khi 2 nhóm chạy song song — RTK Query cho
// phép nhiều file injectEndpoints độc lập cùng apiSlice (đúng tiền lệ classes-api.js/positions-api.js).
export const conductRatingApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Response đã là mảng ĐẦY ĐỦ học sinh đang học (BE tự join theo roster ACTIVE và tự tính label qua
    // getConductRatingLabel) — mỗi phần tử: { studentId, score, label }. FE không tự tính lại ngưỡng/nhãn.
    getClassConductRating: builder.query({
      query: ({ classId, date }) => `/classes/${classId}/conduct-rating?date=${date}`,
      providesTags: (result, error, { classId }) => [{ type: 'ConductRating', id: classId }],
    }),
  }),
});

export const { useGetClassConductRatingQuery } = conductRatingApi;
