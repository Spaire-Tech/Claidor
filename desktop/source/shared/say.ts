import { translationFor } from "./user-language.js";
import { ENGLISH, type WordKey } from "./words/en.js";
import { SPANISH } from "./words/es.js";
import { FRENCH } from "./words/fr.js";
import { GERMAN } from "./words/de.js";
import { DUTCH } from "./words/nl.js";
import { ITALIAN } from "./words/it.js";
import { PORTUGUESE } from "./words/pt-BR.js";
import { SWEDISH } from "./words/sv.js";
import { POLISH } from "./words/pl.js";
import { TURKISH } from "./words/tr.js";

/**
 * The engine's sentences the person reads as they come (20 October 2026,
 * docs/localization.md): a refusal the apps show, a card's note, a step of a
 * booking. Not what a model reads: the agents' prompts and tool results stay
 * English, and the agents write to the person in their language themselves.
 *
 *   say(language, "flight.unavailable")
 *   say(language, "flight.priceChanged", { total: offer.total })
 *
 * `language` is the person's (the host setting `userLanguage`; in the
 * transcript extension `this.tm.userLanguage?.()`); none, or one Simeon is
 * not translated into, reads as English. English is the source
 * (`words/en.ts`); each translation is a table with the same keys
 * (`words/fr.ts` in "tu", `words/es.ts` in "tú"), which the type check holds
 * to every key.
 */
export type { WordKey } from "./words/en.js";

/** Each translation by language; English is `ENGLISH`. */
const TABLES: Readonly<Record<string, Readonly<Record<WordKey, string>>>> = { fr: FRENCH, es: SPANISH, de: GERMAN, nl: DUTCH, it: ITALIAN, "pt-BR": PORTUGUESE, sv: SWEDISH, pl: POLISH, tr: TURKISH };

export function say(language: string | null | undefined, key: WordKey, values: Readonly<Record<string, string | number>> = {}): string {
  const template = translationFor(TABLES, language)?.[key] ?? ENGLISH[key];
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in values ? String(values[name]) : whole));
}

/** The languages the engine has a table for, English first. */
export const SAY_LANGUAGES: readonly string[] = ["en", ...Object.keys(TABLES)];
