import { languageCode, normalizeUserLanguage } from "./user-language.js";
import { ENGLISH, type WordKey } from "./words/en.js";
import { FRENCH } from "./words/fr.js";

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
 * (`words/fr.ts`, in "tu"), which the type check holds to every key.
 */
export type { WordKey } from "./words/en.js";

/** Each translation by language; English is `ENGLISH`. */
const TABLES: Readonly<Record<string, Readonly<Record<WordKey, string>>>> = { fr: FRENCH };

export function say(language: string | null | undefined, key: WordKey, values: Readonly<Record<string, string | number>> = {}): string {
  const tag = normalizeUserLanguage(language);
  const table = tag == null ? undefined : (TABLES[tag] ?? TABLES[languageCode(tag)]);
  const template = table?.[key] ?? ENGLISH[key];
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in values ? String(values[name]) : whole));
}

/** The languages the engine has a table for, English first. */
export const SAY_LANGUAGES: readonly string[] = ["en", ...Object.keys(TABLES)];
