import { config } from '@simeon/eslint-config/react-internal'

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
]
