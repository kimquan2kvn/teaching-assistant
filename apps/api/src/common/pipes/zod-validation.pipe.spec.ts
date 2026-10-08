import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';
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
});
