import type { WordKey } from "./en.js";
import { NL as CATALOG } from "./areas/catalog.js";
import { NL as PREVIEWS } from "./areas/previews.js";
import { NL as PURCHASES } from "./areas/purchases.js";
import { NL as TRAYS } from "./areas/trays.js";

/** The engine's sentences in Dutch, in "je" (`say`, docs/localization.md): every key of `en.ts`, the same `{name}` values. */
export const DUTCH: Readonly<Record<WordKey, string>> = { ...PURCHASES, ...TRAYS, ...PREVIEWS, ...CATALOG };
