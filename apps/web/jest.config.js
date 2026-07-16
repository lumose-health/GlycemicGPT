const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^react-markdown$': '<rootDir>/__mocks__/react-markdown.tsx',
    '^remark-gfm$': '<rootDir>/__mocks__/remark-gfm.js',
  },
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/'],
};

// MSW and some of its dependencies ship ESM-only builds, which Jest cannot
// parse untransformed. next/jest only allows appending to
// transformIgnorePatterns, so patch the blanket node_modules exclusion in the
// resolved config instead.
const MSW_ESM_DEPENDENCIES = [
  'msw',
  'rettime',
  '@mswjs',
  '@open-draft',
  '@bundled-es-modules',
  'strict-event-emitter',
  'headers-polyfill',
  'outvariant',
  'is-node-process',
  'statuses',
  'until-async',
].join('|');

module.exports = async () => {
  const config = await createJestConfig(customJestConfig)();
  config.transformIgnorePatterns = config.transformIgnorePatterns.map(
    (pattern) => {
      if (pattern === '/node_modules/') {
        return `/node_modules/(?!(${MSW_ESM_DEPENDENCIES})/)`;
      }
      // With transpilePackages set, next/jest emits
      // `/node_modules/(?!.pnpm)(?!(pkg1|pkg2)/)` instead; extend its allowlist.
      return pattern.replace(
        '/node_modules/(?!.pnpm)(?!(',
        `/node_modules/(?!.pnpm)(?!(${MSW_ESM_DEPENDENCIES}|`
      );
    }
  );
  return config;
};
