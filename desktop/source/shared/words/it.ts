import type { WordKey } from "./en.js";
import { IT as CATALOG } from "./areas/catalog.js";
import { IT as PREVIEWS } from "./areas/previews.js";
import { IT as PURCHASES } from "./areas/purchases.js";
import { IT as TRAYS } from "./areas/trays.js";

/** The engine's sentences in Italian, in "tu" (`say`, docs/localization.md): every key of `en.ts`, the same `{name}` values. */
export const ITALIAN: Readonly<Record<WordKey, string>> = { ...PURCHASES, ...TRAYS, ...PREVIEWS, ...CATALOG };
