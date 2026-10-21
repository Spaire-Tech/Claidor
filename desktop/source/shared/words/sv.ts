import type { WordKey } from "./en.js";
import { SV as CATALOG } from "./areas/catalog.js";
import { SV as PREVIEWS } from "./areas/previews.js";
import { SV as PURCHASES } from "./areas/purchases.js";
import { SV as TRAYS } from "./areas/trays.js";

/** The engine's sentences in Swedish, in "du" (`say`, docs/localization.md): every key of `en.ts`, the same `{name}` values. */
export const SWEDISH: Readonly<Record<WordKey, string>> = { ...PURCHASES, ...TRAYS, ...PREVIEWS, ...CATALOG };
