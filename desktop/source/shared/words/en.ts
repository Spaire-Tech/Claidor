/**
 * The engine's sentences in English, the source language (`say`, `../say.ts`).
 * A key names where the sentence is said; `{name}` is a value filled in.
 * Each translation (`fr.ts`) has the same keys and the same values.
 */
export const ENGLISH = {
} as const satisfies Readonly<Record<string, string>>;

export type WordKey = keyof typeof ENGLISH;
