import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  coverageThreshold: {
    global: {
      lines: 60,
      statements: 60,
    },
    './src/bundle.ts': {
      lines: 0,
      statements: 0,
    },
    './src/cli.ts': {
      lines: 36,
      statements: 36,
    },
    './src/reporter.ts': {
      lines: 50,
      statements: 50,
    },
  },
  coverageReporters: ['text', 'lcov'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/ui/**',
    '!src/**/*.d.ts',
  ],
};

export default config;
