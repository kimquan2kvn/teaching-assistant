import { z } from 'zod';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_ONLY_ERROR_MESSAGE = 'Ngày không hợp lệ, định dạng yêu cầu: yyyy-mm-dd';

// Ngày thuần (không giờ) lưu 00:00 UTC của đúng ngày đó. Không dùng z.coerce.date(): nó nhận cả
// '2026-02-30' (Date lăn sang 02/03) lẫn chuỗi có giờ/múi giờ, làm lệch ngày khi server chạy UTC.
export const dateOnlySchema = z.string().transform((value, ctx) => {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    // Chặn ngày "lăn" (30/02, tháng 13) bằng cách so lại y/m/d sau khi dựng.
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return date;
    }
  }
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: DATE_ONLY_ERROR_MESSAGE });
  return z.NEVER;
});
