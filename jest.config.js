/**
 * Jest configuration for content-genie-mcp.
 *
 * The project ships as native ESM (`"type": "module"` in package.json with
 * NodeNext module resolution), so we use ts-jest's ESM preset and tell it
 * to strip the `.js` import suffix that TypeScript-with-NodeNext requires
 * in source but Node doesn't actually need at test time.
 */

/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    // Map "./foo.js" imports back to ".ts" so ts-jest can resolve them.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'esnext',
          moduleResolution: 'bundler',
          target: 'ES2022',
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          resolveJsonModule: true,
        },
      },
    ],
  },
};
