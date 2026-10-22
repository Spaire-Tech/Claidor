import type { WordKey } from "./en.js";
import { DE as CATALOG } from "./areas/catalog.js";
import { DE as PREVIEWS } from "./areas/previews.js";
import { DE as PURCHASES } from "./areas/purchases.js";
import { DE as TRAYS } from "./areas/trays.js";

/** The engine's sentences in German, in "du" (`say`, docs/localization.md): every key of `en.ts`, the same `{name}` values. */
export const GERMAN: Readonly<Record<WordKey, string>> = { ...PURCHASES, ...TRAYS, ...PREVIEWS, ...CATALOG };
