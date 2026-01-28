/** @type {import('jest').Config} */
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  preset: 'ts-jest',

  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  testPathIgnorePatterns: [
    '<rootDir>/src/contexts/video/domain/value-objects/',
    '<rootDir>/src/interfaces/',
    '<rootDir>/src/scripts/',
  ],

  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  moduleDirectories: ['node_modules', '<rootDir>'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  restoreMocks: true,

  coverageProvider: 'v8',
  collectCoverage: true,
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/main.ts',
    '!<rootDir>/src/app.module.ts',
    '!<rootDir>/src/**/*.module.ts',
    '!<rootDir>/src/**/*.schema.ts',
    '!<rootDir>/src/**/*.token.ts',
    '!<rootDir>/src/**/*.middleware.ts',
    '!<rootDir>/src/**/*.interceptor.ts',
    '!<rootDir>/src/**/*.guard.ts',
    '!<rootDir>/src/**/*.handler.ts',
    '!<rootDir>/src/**/*.presenter.ts',
    '!<rootDir>/src/**/*.d.ts',
    '!<rootDir>/src/**/*.filter.ts',
    '!<rootDir>/src/contexts/video/domain/**/*.ts',
    '!<rootDir>/src/contexts/video/application/gateways/**/*.ts',
    '!<rootDir>/src/interfaces/**/*.ts',
    '!<rootDir>/src/scripts/**/*.ts',
  ],
  coverageDirectory: '<rootDir>/coverage/unit',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: { branches: 90, functions: 90, lines: 90, statements: 90 },
  },
};
