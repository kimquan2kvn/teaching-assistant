import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodIssue, ZodSchema } from 'zod';

function translateIssue(issue: ZodIssue): string {
  const field = issue.path.join('.') || 'dữ liệu';
  switch (issue.code) {
    case 'invalid_type':
      return issue.received === 'undefined' ? `${field}: bắt buộc nhập` : `${field}: kiểu dữ liệu không hợp lệ`;
    case 'too_small':
      return issue.type === 'string'
        ? `${field}: phải có ít nhất ${issue.minimum} ký tự`
        : `${field}: giá trị quá nhỏ`;
    case 'too_big':
      return issue.type === 'string'
        ? `${field}: không được vượt quá ${issue.maximum} ký tự`
        : `${field}: giá trị quá lớn`;
    case 'invalid_enum_value':
      return `${field}: giá trị không hợp lệ`;
    case 'invalid_date':
      return `${field}: ngày không hợp lệ`;
    case 'custom':
      // Message tuỳ chỉnh từ .refine()/.superRefine() trong schema — giữ nguyên văn,
      // không thay bằng "<field>: không hợp lệ" (xem Bước 0, docs/superpowers/plans/2026-10-08-phase2-ui.md).
      return issue.message;
    default:
      return `${field}: không hợp lệ`;
  }
}

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const message = result.error.issues.map(translateIssue).join('; ');
      throw new BadRequestException(`Dữ liệu gửi lên không hợp lệ: ${message}`);
    }
    return result.data;
  }
}
