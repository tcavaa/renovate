import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_FILE: 'false',
      LOG_STDOUT: 'false',
      AUTH_SECRET: 'test-secret-that-is-at-least-32-characters-long',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov'],
      // The modules that produce money figures or guard the API. Everything else is covered by
      // the parser/solver scripts, the Playwright flows, or is presentation.
      include: [
        'lib/calculator/**/*.ts',
        'lib/design/pricing.ts',
        'lib/design/matcher.ts',
        'lib/api/**/*.ts',
        'lib/auth/**/*.ts',
        'app/api/projects/route.ts',
        'app/api/design/projects/route.ts',
      ],
      exclude: ['lib/calculator/constants.ts', 'lib/api/designCatalog.ts', 'lib/api/rateBook.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 65,
        statements: 80,
      },
    },
  },
});
