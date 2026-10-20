import type { WordKey } from "./en.js";
import { FR as CATALOG } from "./areas/catalog.js";
import { FR as PREVIEWS } from "./areas/previews.js";
import { FR as PURCHASES } from "./areas/purchases.js";
import { FR as TRAYS } from "./areas/trays.js";

/** The engine's sentences in French, in "tu" (`say`, docs/localization.md): every key of `en.ts`, the same `{name}` values. */
export const FRENCH: Readonly<Record<WordKey, string>> = { ...PURCHASES, ...TRAYS, ...PREVIEWS, ...CATALOG };
