module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  globalSetup: '<rootDir>/test/mongo-memory-server.global-setup.ts',
  globalTeardown: '<rootDir>/test/mongo-memory-server.global-teardown.ts',
};
