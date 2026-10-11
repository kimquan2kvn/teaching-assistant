import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Response } from 'express';
import { Error as MongooseError } from 'mongoose';

// body-parser ném lỗi này (qua http-errors) khi body vượt giới hạn; nó không phải HttpException nên không được nhánh
// đầu tiên của filter giữ lại.
function isPayloadTooLargeError(exception: unknown): boolean {
  const error = exception as { type?: unknown; status?: unknown; statusCode?: unknown } | null;
  return error?.type === 'entity.too.large' || error?.status === 413 || error?.statusCode === 413;
}

// Bắt mọi lỗi KHÔNG phải HttpException (đã được service/controller chủ động throw với message tiếng Việt) —
// chủ yếu là lỗi Mongoose/MongoDB lọt qua service mà không được validate trước (vd 1 ObjectId không hợp lệ
// chưa kịp check bằng Types.ObjectId.isValid, hoặc 2 request đua nhau tạo trùng 1 unique index) — để KHÔNG
// bao giờ trả 500 kèm message/stack tiếng Anh gốc của Mongoose ra ngoài, vi phạm yêu cầu gốc "mọi API trả lỗi
// tiếng Việt thân thiện".
@Catch()
export class MongoExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    if (exception instanceof MongooseError.CastError) {
      const mapped = new BadRequestException('Dữ liệu gửi lên không hợp lệ (định dạng id hoặc giá trị sai)');
      response.status(mapped.getStatus()).json(mapped.getResponse());
      return;
    }

    if (exception instanceof MongooseError.ValidationError) {
      const mapped = new BadRequestException('Dữ liệu gửi lên không hợp lệ');
      response.status(mapped.getStatus()).json(mapped.getResponse());
      return;
    }

    if ((exception as { code?: number } | null)?.code === 11000) {
      const mapped = new ConflictException('Dữ liệu đã tồn tại, không thể ghi trùng');
      response.status(mapped.getStatus()).json(mapped.getResponse());
      return;
    }

    if (isPayloadTooLargeError(exception)) {
      const mapped = new PayloadTooLargeException('Dữ liệu gửi lên quá lớn, vui lòng giảm bớt rồi thử lại');
      response.status(mapped.getStatus()).json(mapped.getResponse());
      return;
    }

    console.error(exception);
    response.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Đã có lỗi xảy ra, vui lòng thử lại sau',
    });
  }
}
