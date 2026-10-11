import type { IncomingMessage } from 'http';
import { NestApplicationOptions } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { MongoExceptionFilter } from './common/filters/mongo-exception.filter';

// Tắt body parser mặc định của Nest (cố định 100kb, không nâng riêng được cho 1 route) để configureApp tự đăng ký.
// main.ts và test app (createPhase3App) cùng dùng APP_OPTIONS + configureApp, nên e2e chạy đúng cấu hình production.
export const APP_OPTIONS: NestApplicationOptions = { bodyParser: false };

const DEFAULT_BODY_LIMIT = '100kb';
// POST /positions/:positionId/ppct/import/commit nhận tới 500 dòng × (title 300 + requirement 1000 + note 500 +
// periodLabel 20 ký tự): ≈ 0,9 MB nếu toàn ASCII, ≈ 2,8 MB nếu mọi ký tự là chữ tiếng Việt 3 byte UTF-8 — 3mb là mức
// tối thiểu đủ cho 500 dòng tối đa. Chỉ nâng riêng cho route này vì body được parse TRƯỚC guard đăng nhập, nâng toàn cục
// sẽ để cả các route chưa xác thực (đăng nhập, đăng ký) nhận body vài MB.
const PPCT_IMPORT_COMMIT_BODY_LIMIT = '3mb';
const PPCT_IMPORT_COMMIT_PATH = /^\/positions\/[^/]+\/ppct\/import\/commit\/?$/i;
const JSON_CONTENT_TYPE = /^application\/json\b/i;

function isPpctImportCommitJson(req: IncomingMessage): boolean {
  const pathname = (req.url ?? '').split('?')[0];
  return (
    req.method === 'POST' &&
    PPCT_IMPORT_COMMIT_PATH.test(pathname) &&
    JSON_CONTENT_TYPE.test(req.headers['content-type'] ?? '')
  );
}

export function configureApp(app: NestExpressApplication): void {
  // CORS phải đứng TRƯỚC body parser: parser ném lỗi 413 trước khi request tới các middleware phía sau, thiếu header
  // CORS thì trình duyệt chặn không cho web đọc thông báo lỗi.
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? 'http://localhost:3000',
    credentials: true,
  });
  app.use(cookieParser());
  // Parser giới hạn lớn chỉ nhận request import commit (qua hàm `type`); mọi request khác, và request import commit đã
  // được parse, đi tiếp tới parser mặc định bên dưới (body-parser bỏ qua request đã có req._body).
  app.useBodyParser('json', { limit: PPCT_IMPORT_COMMIT_BODY_LIMIT, type: isPpctImportCommitJson });
  app.useBodyParser('json', { limit: DEFAULT_BODY_LIMIT });
  app.useBodyParser('urlencoded', { extended: true, limit: DEFAULT_BODY_LIMIT });
  app.useGlobalFilters(new MongoExceptionFilter());
}
