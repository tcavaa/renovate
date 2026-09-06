import { defineConfig, globalIgnores } from 'eslint/config';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * ESLint flat config. `next lint` was removed in Next 16, so `pnpm lint` runs `eslint .`
 * directly with the same Next rule set as before.
 */
export default defineConfig([
  ...nextCoreWebVitals,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Product photos come from partner stores at arbitrary sizes; the few remaining <img>
      // uses are deliberate and reviewed.
      '@next/next/no-img-element': 'off',
      // React Compiler rules (new in eslint-config-next 16). Advisory until the flagged
      // patterns — refs read during render in the 3D viewer, setState inside effects — are
      // reworked one by one; none of them is a runtime bug today.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'import/no-anonymous-default-export': 'off',
    },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  globalIgnores([
    '.next/**',
    '.next-build/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'node_modules/**',
    'public/**',
    'lib/db/migrations/**',
  ]),
]);
