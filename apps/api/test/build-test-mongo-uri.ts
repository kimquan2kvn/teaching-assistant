export function buildTestMongoUri(dbName: string): string {
  const base = process.env.MONGO_TEST_URI;
  if (!base) {
    throw new Error('MONGO_TEST_URI chưa được set — kiểm tra jest globalSetup đã chạy chưa');
  }
  const match = base.match(/^mongodb:\/\/([^/]+)/);
  const hostPort = match![1];
  return `mongodb://${hostPort}/${dbName}?replicaSet=rs0`;
}
