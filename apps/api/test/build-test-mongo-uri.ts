export function buildTestMongoUri(dbName: string): string {
  const base = process.env.MONGO_TEST_URI;
  if (!base) {
    throw new Error('MONGO_TEST_URI chưa được set — kiểm tra jest globalSetup đã chạy chưa');
  }
  const hostMatch = base.match(/^mongodb:\/\/([^/]+)/);
  const hostPort = hostMatch![1];
  const rsMatch = base.match(/replicaSet=([^&]+)/);
  const replicaSet = rsMatch ? rsMatch[1] : 'rs0';
  return `mongodb://${hostPort}/${dbName}?replicaSet=${replicaSet}`;
}
