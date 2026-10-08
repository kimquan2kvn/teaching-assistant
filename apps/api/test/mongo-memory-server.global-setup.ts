import { MongoMemoryReplSet } from 'mongodb-memory-server';

module.exports = async function globalSetup() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  (global as any).__MONGO_REPLSET__ = replSet;
  process.env.MONGO_TEST_URI = replSet.getUri();
};
