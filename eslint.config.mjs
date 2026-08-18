import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'FSP_Frontend_UI_Package/**',
      'src/types/database.ts',
    ],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Structured logging only — see docs Part 3 §5.2.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // The service-role client bypasses RLS. The `server-only` package makes
    // importing it from a Client Component a build error; CI greps as backup.
    files: ['src/components/**', 'src/features/**/components/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/supabase/admin', '**/lib/env'],
              message:
                'Components must not import server-only modules. Pass data down from a Server Component instead.',
            },
          ],
        },
      ],
    },
  },
];

export default config;
