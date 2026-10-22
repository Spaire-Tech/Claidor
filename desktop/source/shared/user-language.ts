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

/** The region whose translation a language reads when Simeon has only that one: Portuguese is Brazil's. */
const ONE_REGION: Readonly<Record<string, string>> = { pt: "pt-BR" };

/**
 * The translation in `tables` for the person's language: its own ("pt-BR"),
 * its language's ("fr" for "fr-CA"), or the one region's ("pt-BR" for
 * "pt-PT"); undefined for English, none, or one Simeon is not translated into.
 */
export function translationFor<T>(tables: Readonly<Record<string, T>>, language: string | null | undefined): T | undefined {
  const tag = normalizeUserLanguage(language);
  if (tag == null) return undefined;
  const code = languageCode(tag);
  return tables[tag] ?? tables[code] ?? tables[ONE_REGION[code] ?? ""];
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
  sv: { english: "Swedish", own: "svenska" },
  pl: { english: "Polish", own: "polski" },
  tr: { english: "Turkish", own: "Türkçe" },
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
    `The user can open everything their agents write in the apps, so write in ${english} too what you send to other agents (SendMessage to an agent, a group chat, the brief of an agent you create, a task for a cloud agent or a teammate) and the words of what you make for them: the name, title and description of an agent, a routine's name and instructions, a skill, a memory note, a to-do list. The user also reads the description you give a command or a tool call and the task you hand a subagent (on approval cards and the computer view): write those in ${english} too. Only what a program reads stays as the program needs it: code, commands, search queries, URLs, fields of an API. Write to anyone else (an email, a Slack message to a colleague) in their language.`,
    `If the user writes to you in another language, answer in theirs.`,
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
  de: {
    familiar: "du",
    formal: "Sie",
    writing: "German typography: „ “ for quotes, no space before ? ! : ;, and money, dates and times the German way (12,50 €, 20. Oktober, 14:30).",
  },
  nl: {
    familiar: "je",
    formal: "u",
    writing: "Dutch typography: “ ” for quotes, no space before ? ! : ;, and money, dates and times the Dutch way (€ 12,50, 20 oktober, 14:30).",
  },
  it: {
    familiar: "tu",
    formal: "Lei",
    writing: "Italian typography: “ ” for quotes, the apostrophe ’, no space before ? ! : ;, and money, dates and times the Italian way (12,50 €, 20 ottobre, 14:30).",
  },
  pt: {
    familiar: "você",
    formal: "o senhor/a senhora",
    writing: "Write Portuguese as people in Brazil do: “ ” for quotes, and money, dates and times the Brazilian way (R$ 12,50, 20 de outubro, 14h30). If the user writes European Portuguese, follow theirs.",
  },
  sv: {
    familiar: "du",
    formal: "ni",
    writing: "Swedish typography: ” ” for quotes, and money, dates and times the Swedish way (12,50 kr, 20 oktober, 14:30).",
  },
  pl: {
    familiar: "ty",
    formal: "Pan/Pani",
    writing: "Polish typography: „ ” for quotes, and money, dates and times the Polish way (12,50 zł, 20 października, 14:30).",
  },
  tr: {
    familiar: "sen",
    formal: "siz",
    writing: "Turkish typography: “ ” for quotes, the apostrophe ’ before a suffix on a name (Simeon’un), and money, dates and times the Turkish way (12,50 TL, 20 Ekim, 14:30).",
  },
};

/**
 * `## Language` for a subagent (computer use, the browser, a task): it
 * reports to its agent, but the person reads the description it gives a
 * click, a drag or a command on the approval card and the computer view, so
 * those are in their language (22 October 2026). Empty for English or none.
 */
export function renderSubagentLanguageSystemPrompt(raw: string | null | undefined): string {
  const tag = normalizeUserLanguage(raw);
  if (tag == null || isEnglishOrUnset(tag)) return "";
  const english = languageName(tag);
  return [
    "## Language",
    `The user's Simeon apps are in ${english}. They read the description you give a click, a drag, a key press or a command, and any reason you give them, on the approval card and the computer view: write those in ${english}. What you type into a page or an app stays what the task needs; report to your agent as you like.`,
  ].join("\n");
}

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
  return `${cue}\nThe user's apps are in ${english}: write every message of this turn to the user in ${english}, question widgets (question, options and helpText) included, and say any wording quoted above for the user in ${english}, in the same spirit. What you write to an agent (a brief, a message) and the title and description of an agent you create are in ${english} too: the user reads them in the apps.${address} Names of apps, connectors and agents stay as they are.`;
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
