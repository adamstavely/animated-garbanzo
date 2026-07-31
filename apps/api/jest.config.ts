import type { Config } from 'jest';

/** Unit tests: fast, no database, no network. */
const config: Config = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: 'src/.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/database/migrations/**',
    '!src/database/data-source.ts',
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: { statements: 80, branches: 70, functions: 80, lines: 80 },
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup-unit.ts'],
  clearMocks: true,
};

export default config;
