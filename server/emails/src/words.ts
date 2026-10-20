/**
 * The emails' sentences in the person's language (20 October 2026,
 * docs/localization.md): the sign-in code, sent to people who use the
 * apps. English is the source; each translation has the same keys, in
 * "tu". The server passes the language (`language`, the request's
 * `Accept-Language`); none, or one Simeon is not translated into, reads
 * as English. The other templates are the inherited shop's and stay
 * English.
 */
const ENGLISH = {
  hello: 'Hello,',
  loginCodePreview:
    'Your code to sign in is {code}. It is valid for the next {minutes} minutes.',
  loginCodeIntro:
    'Use the verification code below to sign in to your Simeon account.',
  loginCodeValid: 'This code is only valid for the next {minutes} minutes.',
  loginCodeIgnore:
    'If you did not request this sign-in, you may safely ignore this email.',
  sentToBefore: 'This email was sent to',
  sentToAfter: '.',
}

export type EmailWords = typeof ENGLISH

const FRENCH: EmailWords = {
  hello: 'Bonjour,',
  loginCodePreview:
    'Ton code pour te connecter est {code}. Il est valable pendant {minutes} minutes.',
  loginCodeIntro:
    'Utilise le code de vérification ci-dessous pour te connecter à ton compte Simeon.',
  loginCodeValid: 'Ce code n’est valable que pendant {minutes} minutes.',
  loginCodeIgnore:
    'Si tu n’as pas demandé cette connexion, tu peux ignorer cet e-mail sans risque.',
  sentToBefore: 'Cet e-mail a été envoyé à',
  sentToAfter: '.',
}

const TABLES: Record<string, EmailWords> = { fr: FRENCH }

/** The language an email is written in: one of Simeon's, else English. */
export function emailLanguage(language?: string | null): string {
  const code = (language ?? '').trim().split(/[-_]/)[0].toLowerCase()
  return code in TABLES ? code : 'en'
}

/** The words of an email in `language`. */
export function words(language?: string | null): EmailWords {
  return TABLES[emailLanguage(language)] ?? ENGLISH
}

/** A sentence with each `{name}` filled. */
export function fill(
  sentence: string,
  values: Record<string, string | number>,
): string {
  return sentence.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  )
}
