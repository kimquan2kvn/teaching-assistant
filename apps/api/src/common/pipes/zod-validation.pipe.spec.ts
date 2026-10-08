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
});
