import { MongoMemoryReplSet } from 'mongodb-memory-server';

interface GlobalWithReplSet {
  __MONGO_REPLSET__?: MongoMemoryReplSet;
}

module.exports = async function globalTeardown() {
  const replSet = (global as unknown as GlobalWithReplSet).__MONGO_REPLSET__;
  if (replSet) {
    await replSet.stop();
  }
};
