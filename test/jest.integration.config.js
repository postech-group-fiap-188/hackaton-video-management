/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.integration-spec.ts'],

  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  collectCoverage: false,

  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },

  moduleFileExtensions: ['ts', 'js', 'json'],
};
