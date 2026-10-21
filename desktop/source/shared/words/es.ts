import type { WordKey } from "./en.js";
import { ES as CATALOG } from "./areas/catalog.js";
import { ES as PREVIEWS } from "./areas/previews.js";
import { ES as PURCHASES } from "./areas/purchases.js";
import { ES as TRAYS } from "./areas/trays.js";

/** The engine's sentences in Spanish, in "tú" (`say`, docs/localization.md): every key of `en.ts`, the same `{name}` values. */
export const SPANISH: Readonly<Record<WordKey, string>> = { ...PURCHASES, ...TRAYS, ...PREVIEWS, ...CATALOG };
