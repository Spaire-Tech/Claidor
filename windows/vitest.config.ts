import { defineConfig } from 'vitest/config'

// The main process's own logic, run in Node; Electron itself is checked by
// `npm run smoke` (scripts/smoke.mjs).
export default defineConfig({
  // The tests compile the web app's own files too (the bridge's contract, the saved chats). Its
  // tsconfig extends a package that exists only once `pnpm install` has run in clients/, which a
  // PC that builds only the Windows app hasn't (the Dell, 7 November 2026: those two test files
  // could not load). So no tsconfig is read; the settings that change how a file is compiled are
  // given here: the Windows app's target and the web app's JSX (both ES2022 or later, as theirs).
  esbuild: {
    tsconfigRaw: JSON.stringify({ compilerOptions: { target: 'ES2023', jsx: 'react-jsx' } }),
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
