import { Injectable } from '@nestjs/common';

// Tách "bây giờ" thành provider để test giả lập được giờ (override Clock bằng bản trả mốc cố định).
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
