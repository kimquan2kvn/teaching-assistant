module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  globalSetup: '<rootDir>/test/mongo-memory-server.global-setup.ts',
  globalTeardown: '<rootDir>/test/mongo-memory-server.global-teardown.ts',
  // All e2e tests share one MongoMemoryReplSet (see globalSetup). Running test files in parallel worker
  // processes was observed to intermittently race against the replica set right after startup
  // (MongoNotConnectedError on an otherwise-correct connection) — serializing test files removes that
  // race. The whole suite still runs in a few seconds, so this costs nothing in practice.
  maxWorkers: 1,
};
