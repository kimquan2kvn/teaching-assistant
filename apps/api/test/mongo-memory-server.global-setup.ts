import { MongoMemoryReplSet } from 'mongodb-memory-server';

interface GlobalWithReplSet {
  __MONGO_REPLSET__?: MongoMemoryReplSet;
}

module.exports = async function globalSetup() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  (global as unknown as GlobalWithReplSet).__MONGO_REPLSET__ = replSet;
  process.env.MONGO_TEST_URI = replSet.getUri();
};
