import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { buildTestMongoUri } from '../test/build-test-mongo-uri';

describe('AppModule (bootstrap smoke test)', () => {
  let app: INestApplication;
  const originalMongodbUri = process.env.MONGODB_URI;

  beforeAll(() => {
    // AppModule's DatabaseModule reads process.env.MONGODB_URI at import time, defaulting to
    // mongodb://localhost:27017/... when unset — a host that doesn't exist in this sandbox, which
    // left `lazyConnection: true`'s background retry timers running after the test finished and kept
    // Jest from exiting cleanly. Point it at the real shared test replica set instead.
    process.env.MONGODB_URI = buildTestMongoUri('app_module_smoke');
  });

  afterAll(async () => {
    await app?.close();
    process.env.MONGODB_URI = originalMongodbUri;
  });

  it('khởi tạo được toàn bộ DI graph thật (không phải module test rút gọn) mà không lỗi', async () => {
    // Mỗi *.e2e.spec.ts khác tự dựng 1 Nest testing module RÚT GỌN (chỉ import đúng controller/provider/
    // MongooseModule.forFeature cần cho test đó), nên một module thiếu `imports: [DatabaseModule]` vẫn
    // có thể pass hết các test đó mà không ai biết — vì bài test không dùng *đúng* AppModule thật. Test
    // này bootstrap chính xác AppModule như lúc chạy production để bắt được đúng loại lỗi "thiếu imports" đó.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- phải require sau khi set MONGODB_URI ở trên, import tĩnh sẽ đọc biến môi trường quá sớm
    const { AppModule } = require('./app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
});
