import type { WordKey } from "./en.js";
import { TR as CATALOG } from "./areas/catalog.js";
import { TR as PREVIEWS } from "./areas/previews.js";
import { TR as PURCHASES } from "./areas/purchases.js";
import { TR as TRAYS } from "./areas/trays.js";

/** The engine's sentences in Turkish, in "sen" (`say`, docs/localization.md): every key of `en.ts`, the same `{name}` values. */
export const TURKISH: Readonly<Record<WordKey, string>> = { ...PURCHASES, ...TRAYS, ...PREVIEWS, ...CATALOG };
