import type { WordKey } from "./en.js";
import { PT_BR as CATALOG } from "./areas/catalog.js";
import { PT_BR as PREVIEWS } from "./areas/previews.js";
import { PT_BR as PURCHASES } from "./areas/purchases.js";
import { PT_BR as TRAYS } from "./areas/trays.js";

/** The engine's sentences in Brazilian Portuguese, in "você" (`say`, docs/localization.md): every key of `en.ts`, the same `{name}` values. */
export const PORTUGUESE: Readonly<Record<WordKey, string>> = { ...PURCHASES, ...TRAYS, ...PREVIEWS, ...CATALOG };
