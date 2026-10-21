/**
 * The person's language (20 October 2026). The iPhone and Mac apps write it
 * as the host setting `userLanguage` (a BCP 47 tag: "fr", "pt-BR",
 * "zh-Hant"), beside `userTimeZone`, after every sign-in and whenever it
 * changes. English is the source language: with English, or no language
 * set, every prompt reads exactly as it did before.
 *
 * What it changes: the agents write to the person in it (the `## Language`
 * section of every agent's instructions, and a closing line on the first-run
 * cues), and a voice call hears and speaks it (`voice-call-prompt.ts`).
 * French says "tu" unless the person asks for "vous", Spanish "tú" unless they
 * ask for "usted" (`ADDRESS`, docs/localization.md).
 */

/** The tag as kept ("fr", "pt-BR", "zh-Hant"), or undefined for anything that is not a language tag. */
export function normalizeUserLanguage(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim().replace(/_/g, "-");
  if (trimmed.length === 0 || trimmed.length > 35 || !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(trimmed)) return undefined;
  try { return Intl.getCanonicalLocales(trimmed)[0]; } catch { return undefined; }
}

/** The language alone, lower case: "fr" for "fr-CA", "pt" for "pt-BR". */
export function languageCode(tag: string): string {
  return (tag.split("-")[0] ?? tag).toLowerCase();
}

/** True for English and for no language at all: the prompts stay as they were. */
export function isEnglishOrUnset(tag: string | null | undefined): boolean {
  const normalized = normalizeUserLanguage(tag);
  return normalized == null || languageCode(normalized) === "en";
}

/** The languages Simeon is translated into, by name in English and in their own words. */
const LANGUAGE_NAMES: Readonly<Record<string, { readonly english: string; readonly own: string }>> = {
  en: { english: "English", own: "English" },
  fr: { english: "French", own: "français" },
  es: { english: "Spanish", own: "español" },
  de: { english: "German", own: "Deutsch" },
  "pt-BR": { english: "Brazilian Portuguese", own: "português do Brasil" },
  pt: { english: "Portuguese", own: "português" },
  ja: { english: "Japanese", own: "日本語" },
  it: { english: "Italian", own: "italiano" },
  nl: { english: "Dutch", own: "Nederlands" },
  ko: { english: "Korean", own: "한국어" },
  "zh-Hant": { english: "Traditional Chinese", own: "繁體中文" },
  zh: { english: "Chinese", own: "中文" },
  ar: { english: "Arabic", own: "العربية" },
};

function namesFor(tag: string): { readonly english: string; readonly own: string } {
  const known = LANGUAGE_NAMES[tag] ?? LANGUAGE_NAMES[languageCode(tag)];
  if (known != null) return known;
  const display = (locale: string): string | undefined => { try { return new Intl.DisplayNames([locale], { type: "language" }).of(tag); } catch { return undefined; } };
  const english = display("en") ?? tag;
  return { english, own: display(tag) ?? english };
}

/** "French", for the agents' instructions; the tag itself when nothing better is known. */
export function languageName(tag: string): string {
  return namesFor(tag).english;
}

/**
 * `## Language`, in every agent's instructions when the person's language is
 * not English; empty for English or none, so those prompts are unchanged.
 */
export function renderUserLanguageSystemPrompt(raw: string | null | undefined): string {
  const tag = normalizeUserLanguage(raw);
  if (tag == null || isEnglishOrUnset(tag)) return "";
  const { english, own } = namesFor(tag);
  const name = own.toLowerCase() === english.toLowerCase() ? english : `${english} (${own})`;
  const lines = [
    "## Language",
    `The user's Simeon apps are in ${name}. Write to the user in ${english}: every message, question widget (its question, options and helpText), card, draft and summary you send them, starting with your very first hello. Where your instructions quote wording in English for the user (a greeting, a helpText), say it in ${english} instead.`,
    `If the user writes to you in another language, answer in theirs. What you write to other agents and to tools can stay in English.`,
    "Never translate names: Simeon, SimeonLabs, the agents' names (yours too), and the names of apps, connectors and plans (Gmail, Slack, Link, Shop, Stripe) stay as they are.",
  ];
  const address = ADDRESS[languageCode(tag)];
  if (address !== undefined) {
    const { familiar, formal } = address;
    lines.push(
      `In ${english}, say "${familiar}" to the user: warm and direct, like a capable friend at work, never stiff. If the user asks you to say "${formal}" (or writes to you with "${formal}" and asks for it), switch to "${formal}" and keep it from then on, and save it to the user's shared memory (update_state, target "memory", scope "user", action "write": "Prefers to be addressed as ${formal} in ${english}") so every agent follows it. When the user's memory says they prefer "${formal}", say "${formal}".`,
      address.writing,
    );
  }
  return lines.join("\n");
}

/**
 * The languages with a familiar and a formal "you" (docs/localization.md):
 * the agents say the familiar one, warm and direct, and the formal one once
 * the person asks for it. With how each language is written.
 */
export const ADDRESS: Readonly<Record<string, { readonly familiar: string; readonly formal: string; readonly writing: string }>> = {
  fr: {
    familiar: "tu",
    formal: "vous",
    writing: "French typography: a non-breaking space before : ; ! ?, « » for quotes, the apostrophe ’, and money, dates and times the French way (12,50 €, 20 octobre, 14 h 30).",
  },
  es: {
    familiar: "tú",
    formal: "usted",
    writing: "Spanish punctuation: ¿ and ¡ open every question and exclamation, “ ” for quotes, dates and times the Spanish way (20 de octubre, 14:30) and money as the user's country writes it. Write a neutral Spanish that reads naturally in Latin America and in Spain; if the user writes their own way (vos, vosotros, ordenador), follow theirs.",
  },
};

/**
 * The line put after a first-run cue when the person's language is not
 * English: the hello and the question widget, its helpText included, in
 * their language. The cue itself, unchanged, for English or none.
 */
export function firstRunCueInLanguage(cue: string, raw: string | null | undefined): string {
  const tag = normalizeUserLanguage(raw);
  if (tag == null || isEnglishOrUnset(tag)) return cue;
  const english = languageName(tag);
  const familiar = ADDRESS[languageCode(tag)]?.familiar;
  const address = familiar === undefined ? "" : ` Say "${familiar}" to the user.`;
  return `${cue}\nThe user's apps are in ${english}: write every message of this turn to the user in ${english}, question widgets (question, options and helpText) included, and say any wording quoted above for the user in ${english}, in the same spirit.${address} Names of apps, connectors and agents stay as they are.`;
}

/** `Accept-Language` for the person's language, as the apps send theirs, so Simeon Labs' server answers in it; none for English or none known. */
export function acceptLanguageHeader(raw: string | null | undefined): Record<string, string> {
  const tag = normalizeUserLanguage(raw);
  return tag === undefined || isEnglishOrUnset(tag) ? {} : { "accept-language": tag };
}

/**
 * The person's language for the engine's sentences outside the transcript
 * manager (`say`, `shared/say.ts`): sidebar previews, notifications,
 * approval summaries, connector and channel messages. The host's
 * composition pins the settings' `userLanguage` here once; unpinned (the
 * tests, the retired Electron app) it is none, and every sentence is English.
 */
let pinnedUserLanguage: (() => string | undefined) | null = null;

export function pinUserLanguageReader(read: (() => string | undefined) | null): void {
  pinnedUserLanguage = read;
}

export function currentUserLanguage(): string | undefined {
  try {
    return pinnedUserLanguage?.();
  } catch {
    return undefined;
  }
}
