/**
 * The emails' sentences in the person's language (20 October 2026,
 * docs/localization.md): the sign-in code, sent to people who use the
 * apps. English is the source; each translation has the same keys, in
 * "tu" and "tú". The server passes the language (`language`, the request's
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

const SPANISH: EmailWords = {
  hello: 'Hola:',
  loginCodePreview:
    'Tu código para iniciar sesión es {code}. Es válido durante los próximos {minutes}\u00a0minutos.',
  loginCodeIntro:
    'Usa el código de verificación de abajo para iniciar sesión en tu cuenta de Simeon.',
  loginCodeValid:
    'Este código solo es válido durante los próximos {minutes}\u00a0minutos.',
  loginCodeIgnore:
    'Si no pediste este inicio de sesión, puedes ignorar este correo sin problema.',
  sentToBefore: 'Este correo se envió a',
  sentToAfter: '.',
}

const GERMAN: EmailWords = {
  hello: 'Hallo,',
  loginCodePreview:
    'Dein Code zum Anmelden lautet {code}. Er gilt für die nächsten {minutes} Minuten.',
  loginCodeIntro:
    'Gib den Bestätigungscode unten ein, um dich bei deinem Simeon-Account anzumelden.',
  loginCodeValid: 'Dieser Code gilt nur für die nächsten {minutes} Minuten.',
  loginCodeIgnore:
    'Wenn du diese Anmeldung nicht angefordert hast, kannst du diese E-Mail einfach ignorieren.',
  sentToBefore: 'Diese E-Mail wurde an',
  sentToAfter: ' gesendet.',
}

const DUTCH: EmailWords = {
  hello: 'Hallo,',
  loginCodePreview:
    'Je code om in te loggen is {code}. Hij is de komende {minutes} minuten geldig.',
  loginCodeIntro:
    'Gebruik de verificatiecode hieronder om in te loggen bij je Simeon-account.',
  loginCodeValid: 'Deze code is maar {minutes} minuten geldig.',
  loginCodeIgnore:
    'Heb je niet om deze inlogpoging gevraagd? Dan kun je deze e-mail gerust negeren.',
  sentToBefore: 'Deze e-mail is gestuurd naar',
  sentToAfter: '.',
}

const ITALIAN: EmailWords = {
  hello: 'Ciao,',
  loginCodePreview:
    'Il tuo codice per accedere è {code}. È valido per i prossimi {minutes} minuti.',
  loginCodeIntro:
    'Usa il codice di verifica qui sotto per accedere al tuo account Simeon.',
  loginCodeValid:
    'Questo codice è valido solo per i prossimi {minutes} minuti.',
  loginCodeIgnore:
    'Se non hai richiesto questo accesso, puoi tranquillamente ignorare questa email.',
  sentToBefore: 'Questa email è stata inviata a',
  sentToAfter: '.',
}

const PORTUGUESE: EmailWords = {
  hello: 'Olá,',
  loginCodePreview:
    'Seu código para entrar é {code}. Ele vale pelos próximos {minutes} minutos.',
  loginCodeIntro:
    'Use o código de verificação abaixo para entrar na sua conta Simeon.',
  loginCodeValid: 'Este código só vale pelos próximos {minutes} minutos.',
  loginCodeIgnore:
    'Se você não pediu para entrar, pode ignorar este e-mail com segurança.',
  sentToBefore: 'Este e-mail foi enviado para',
  sentToAfter: '.',
}

const SWEDISH: EmailWords = {
  hello: 'Hej,',
  loginCodePreview:
    'Din kod för att logga in är {code}. Den gäller i {minutes} minuter.',
  loginCodeIntro:
    'Använd verifieringskoden nedan för att logga in på ditt Simeon-konto.',
  loginCodeValid: 'Koden gäller bara i {minutes} minuter.',
  loginCodeIgnore:
    'Om du inte har bett om den här inloggningen kan du lugnt ignorera det här mejlet.',
  sentToBefore: 'Det här mejlet skickades till',
  sentToAfter: '.',
}

const POLISH: EmailWords = {
  hello: 'Cześć,',
  loginCodePreview:
    'Twój kod logowania to {code}. Jest ważny przez następne {minutes} min.',
  loginCodeIntro:
    'Użyj poniższego kodu weryfikacyjnego, aby zalogować się do konta Simeon.',
  loginCodeValid: 'Ten kod jest ważny tylko przez następne {minutes} min.',
  loginCodeIgnore:
    'Jeśli to nie ty chcesz się zalogować, możesz spokojnie zignorować ten e-mail.',
  sentToBefore: 'Ten e-mail został wysłany na adres',
  sentToAfter: '.',
}

const TURKISH: EmailWords = {
  hello: 'Merhaba,',
  loginCodePreview:
    'Giriş kodun: {code}. Önümüzdeki {minutes} dakika boyunca geçerli.',
  loginCodeIntro:
    'Simeon hesabına giriş yapmak için aşağıdaki doğrulama kodunu kullan.',
  loginCodeValid:
    'Bu kod yalnızca önümüzdeki {minutes} dakika boyunca geçerli.',
  loginCodeIgnore:
    'Bu girişi sen istemediysen bu e-postayı güvenle yok sayabilirsin.',
  sentToBefore: 'Bu e-posta şu adrese gönderildi:',
  sentToAfter: '.',
}

const TABLES: Record<string, EmailWords> = {
  fr: FRENCH,
  es: SPANISH,
  de: GERMAN,
  nl: DUTCH,
  it: ITALIAN,
  pt: PORTUGUESE,
  sv: SWEDISH,
  pl: POLISH,
  tr: TURKISH,
}

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
