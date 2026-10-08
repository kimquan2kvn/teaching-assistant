import { ArgumentsHost, BadRequestException, Catch, ConflictException, ExceptionFilter, HttpException } from '@nestjs/common';
import { Response } from 'express';
import { Error as MongooseError } from 'mongoose';

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

    console.error(exception);
    response.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Đã có lỗi xảy ra, vui lòng thử lại sau',
    });
  }
}
