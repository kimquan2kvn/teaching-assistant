module.exports = async function globalTeardown() {
  const replSet = (global as any).__MONGO_REPLSET__;
  if (replSet) {
    await replSet.stop();
  }
};
