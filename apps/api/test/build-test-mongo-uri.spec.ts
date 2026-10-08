import { buildTestMongoUri } from './build-test-mongo-uri';

describe('buildTestMongoUri', () => {
  const originalEnv = process.env.MONGO_TEST_URI;

  afterEach(() => {
    process.env.MONGO_TEST_URI = originalEnv;
  });

  it('ghép tên database riêng vào host:port lấy từ MONGO_TEST_URI, giữ nguyên replicaSet', () => {
    process.env.MONGO_TEST_URI = 'mongodb://127.0.0.1:54321/?replicaSet=rs0';
    expect(buildTestMongoUri('auth_e2e')).toBe('mongodb://127.0.0.1:54321/auth_e2e?replicaSet=rs0');
  });

  it('throw lỗi rõ ràng nếu MONGO_TEST_URI chưa được set (globalSetup chưa chạy)', () => {
    delete process.env.MONGO_TEST_URI;
    expect(() => buildTestMongoUri('x')).toThrow(/MONGO_TEST_URI/);
  });
});
