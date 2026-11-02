// The types of scripts/theme-css.mjs, for vite.config.ts and the tests.
export function scoped(selector: string, condition: string): string
export function themeCSS(): { postcssPlugin: string }
