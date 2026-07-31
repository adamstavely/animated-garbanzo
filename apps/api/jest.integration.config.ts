import type { Config } from 'jest';

/**
 * Integration tests: a real Nest application over a real Postgres schema, with
 * only the model call replaced by a stub. Run serially — they share a database.
 */
const config: Config = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: 'test/.*\\.integration-spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 30_000,
  maxWorkers: 1,
  clearMocks: true,
};

export default config;
