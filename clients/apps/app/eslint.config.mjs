import { config } from '@simeon/eslint-config/react-internal'

export default [
  ...config,
  { ignores: ['node_modules/**'] },
  {
    // Vite's own value (the folder the app is served from), not a setting.
    rules: {
      'turbo/no-undeclared-env-vars': ['warn', { allowList: ['^BASE_URL$'] }],
    },
  },
  {
    files: ['scripts/**', 'vite.config.ts'],
    languageOptions: { globals: { process: 'readonly' } },
  },
]
