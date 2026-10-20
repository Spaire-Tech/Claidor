import { EN as CATALOG } from "./areas/catalog.js";
import { EN as PREVIEWS } from "./areas/previews.js";
import { EN as PURCHASES } from "./areas/purchases.js";
import { EN as TRAYS } from "./areas/trays.js";

/**
 * The engine's sentences in English, the source language (`say`, `../say.ts`).
 * A key names where the sentence is said; `{name}` is a value filled in.
 * Each translation (`fr.ts`) has the same keys and the same values.
 */
export const ENGLISH = { ...PURCHASES, ...TRAYS, ...PREVIEWS, ...CATALOG } as const;

export type WordKey = keyof typeof ENGLISH;
