import { config } from '@claidor/eslint-config/react-internal'

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
]
