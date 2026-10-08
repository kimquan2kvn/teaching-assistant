import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';
import { createConductLogSchema } from '@so-chu-nhiem/shared';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({ name: z.string().min(1) });

describe('ZodValidationPipe', () => {
  it('trả về giá trị đã parse khi hợp lệ', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(pipe.transform({ name: 'A' })).toEqual({ name: 'A' });
  });

  it('throw BadRequestException với message tiếng Việt khi không hợp lệ', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(() => pipe.transform({ name: '' })).toThrow(BadRequestException);
  });

  it('message lỗi không chứa text tiếng Anh gốc của zod (vd "Required", "must contain")', () => {
    const pipe = new ZodValidationPipe(z.object({ username: z.string().min(3) }));
    try {
      pipe.transform({});
      fail('phải throw');
    } catch (err) {
      const message = (err as BadRequestException).message;
      expect(message).not.toMatch(/Required|must contain|Expected/i);
      expect(message).toContain('username');
    }
  });

  it('message lỗi nêu rõ tên field bị thiếu/sai', () => {
    const pipe = new ZodValidationPipe(z.object({ password: z.string().min(8) }));
    try {
      pipe.transform({ password: '123' });
      fail('phải throw');
    } catch (err) {
      expect((err as BadRequestException).message).toContain('password');
    }
  });

  it('giữ nguyên message tuỳ chỉnh của .refine() (issue code "custom") thay vì "<field>: không hợp lệ"', () => {
    const schema = z
      .object({ password: z.string(), confirmPassword: z.string() })
      .refine((data) => data.password === data.confirmPassword, {
        message: 'Mật khẩu xác nhận không khớp',
        path: ['confirmPassword'],
      });
    const pipe = new ZodValidationPipe(schema);
    try {
      pipe.transform({ password: 'a', confirmPassword: 'b' });
      fail('phải throw');
    } catch (err) {
      const message = (err as BadRequestException).message;
      expect(message).toContain('Mật khẩu xác nhận không khớp');
      expect(message).not.toContain('confirmPassword: không hợp lệ');
    }
  });

  it('message lỗi vượt giới hạn điểm của createConductLogSchema (tích hợp thật với @so-chu-nhiem/shared) giữ nguyên văn message backend', () => {
    const pipe = new ZodValidationPipe(createConductLogSchema);
    try {
      pipe.transform({ studentId: 's1', kind: 'VIOLATION', points: 60, note: 'x' });
      fail('phải throw');
    } catch (err) {
      const message = (err as BadRequestException).message;
      expect(message).toContain('tối đa 50');
    }
  });
});
