import { nextJsConfig } from '@simeon/eslint-config/next-js'

/** @type {import("eslint").Linter.Config} */
export default [
  ...nextJsConfig,
  // Other configurations
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      // Simeon on the web: the built window (desktop/web/build-web.mjs).
      'public/app/**',
    ],
  },
]
