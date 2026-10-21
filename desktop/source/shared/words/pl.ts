import type { WordKey } from "./en.js";
import { PL as CATALOG } from "./areas/catalog.js";
import { PL as PREVIEWS } from "./areas/previews.js";
import { PL as PURCHASES } from "./areas/purchases.js";
import { PL as TRAYS } from "./areas/trays.js";

/** The engine's sentences in Polish, in "ty" (`say`, docs/localization.md): every key of `en.ts`, the same `{name}` values. */
export const POLISH: Readonly<Record<WordKey, string>> = { ...PURCHASES, ...TRAYS, ...PREVIEWS, ...CATALOG };
