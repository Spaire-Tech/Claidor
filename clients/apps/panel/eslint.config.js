/**
 * The panel lints like the rest of the workspace.
 *
 * `react-internal` is the shared config for a React package that is not a
 * Next.js app, which is exactly what this is: a Vite build that renders
 * into an Office task pane.
 *
 * Before this file existed the package carried a `lint` script with no
 * config behind it, so `turbo run lint` — which is what CI runs — stopped
 * on « ESLint couldn't find an eslint.config.js ». A script that has never
 * once succeeded is worse than no script: it reads as coverage.
 */

import { config } from '@claidor/eslint-config/react-internal'

export default [
  ...config,
  { ignores: ['dist/**', 'node_modules/**'] },
]
