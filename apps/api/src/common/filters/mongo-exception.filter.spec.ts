import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { Error as MongooseError } from 'mongoose';
import { MongoExceptionFilter } from './mongo-exception.filter';

function buildHost() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const response = { status };
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('MongoExceptionFilter', () => {
  it('giữ nguyên HttpException đã có (vd BadRequestException từ zod), không đổi status/body', () => {
    const filter = new MongoExceptionFilter();
    const { host, status, json } = buildHost();
    const exc = new BadRequestException('Dữ liệu gửi lên không hợp lệ: abc');
    filter.catch(exc, host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(exc.getResponse());
  });

  it('Mongoose CastError (vd ObjectId không hợp lệ) -> 400 tiếng Việt, không lộ message gốc tiếng Anh', () => {
    const filter = new MongoExceptionFilter();
    const { host, status, json } = buildHost();
    const castError = new MongooseError.CastError('ObjectId', 'not-an-id', 'studentId');
    filter.catch(castError, host);
    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body.message).not.toMatch(/Cast to/i);
  });

  it('lỗi trùng khoá (code 11000) -> 409', () => {
    const filter = new MongoExceptionFilter();
    const { host, status } = buildHost();
    filter.catch({ code: 11000, message: 'E11000 duplicate key error' }, host);
    expect(status).toHaveBeenCalledWith(409);
  });

  it('body quá lớn (PayloadTooLargeError của body-parser, không phải HttpException) -> 413 tiếng Việt, không lộ chi tiết kỹ thuật, không log như lỗi máy chủ', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const filter = new MongoExceptionFilter();
    const { host, status, json } = buildHost();
    const payloadTooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
      type: 'entity.too.large',
      expose: true,
      length: 150000,
      limit: 102400,
    });

    filter.catch(payloadTooLarge, host);

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({
      statusCode: 413,
      error: 'Payload Too Large',
      message: 'Dữ liệu gửi lên quá lớn, vui lòng giảm bớt rồi thử lại',
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('lỗi không nhận diện được -> 500 tiếng Việt chung chung, không lộ message gốc', () => {
    const filter = new MongoExceptionFilter();
    const { host, status, json } = buildHost();
    filter.catch(new Error('some internal node stack trace detail'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json.mock.calls[0][0].message).not.toMatch(/internal node stack trace/);
  });
});
