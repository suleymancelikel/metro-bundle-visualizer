import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  coverageThreshold: {
    global: {
      lines: 80,
      statements: 80,
    },
    './src/bundle.ts': {
      lines: 0,
      statements: 0,
    },
    './src/cli.ts': {
      lines: 40,
      statements: 40,
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
