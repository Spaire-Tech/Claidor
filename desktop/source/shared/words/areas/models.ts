/**
 * The engine's sentences about the person's own AI plan, one part of
 * `../en.ts` and its translations (`say`): the one line a chat gets when
 * Claude Code can't run an agent's turn and Simeon's models answer instead
 * (9 November 2026, docs/your-own-models.md, section 6, step C4). In the
 * familiar "you" (docs/localization.md).
 */
export const EN = {
  "claudeCode.limited": "Your Claude plan's limit is reached, so Simeon's models answer until it resets.",
  "claudeCode.signedOut": "Claude isn't signed in on your computer any more, so Simeon's models answer. Connect Claude again in Settings › AI Models.",
  "claudeCode.unavailable": "Claude Code couldn't run on your computer, so Simeon's models answered this time.",
} as const;

export const FR: Readonly<Record<keyof typeof EN, string>> = {
  "claudeCode.limited": "La limite de ton forfait Claude est atteinte, donc les modèles de Simeon répondent jusqu’à sa réinitialisation.",
  "claudeCode.signedOut": "Claude n’est plus connecté sur ton ordinateur, donc les modèles de Simeon répondent. Reconnecte Claude dans Réglages › Modèles d’IA.",
  "claudeCode.unavailable": "Claude Code n’a pas pu tourner sur ton ordinateur, donc les modèles de Simeon ont répondu cette fois.",
};

export const ES: Readonly<Record<keyof typeof EN, string>> = {
  "claudeCode.limited": "Alcanzaste el límite de tu plan de Claude, así que los modelos de Simeon responden hasta que se restablezca.",
  "claudeCode.signedOut": "Claude ya no tiene la sesión iniciada en tu computadora, así que responden los modelos de Simeon. Vuelve a conectar Claude en Ajustes › Modelos de IA.",
  "claudeCode.unavailable": "Claude Code no pudo ejecutarse en tu computadora, así que esta vez respondieron los modelos de Simeon.",
};

export const DE: Readonly<Record<keyof typeof EN, string>> = {
  "claudeCode.limited": "Das Limit deines Claude-Tarifs ist erreicht, deshalb antworten Simeons Modelle, bis es zurückgesetzt wird.",
  "claudeCode.signedOut": "Claude ist auf deinem Computer nicht mehr angemeldet, deshalb antworten Simeons Modelle. Verbinde Claude erneut unter Einstellungen › KI-Modelle.",
  "claudeCode.unavailable": "Claude Code konnte auf deinem Computer nicht laufen, deshalb haben diesmal Simeons Modelle geantwortet.",
};

export const NL: Readonly<Record<keyof typeof EN, string>> = {
  "claudeCode.limited": "De limiet van je Claude-abonnement is bereikt, dus de modellen van Simeon antwoorden tot die wordt gereset.",
  "claudeCode.signedOut": "Claude is niet meer ingelogd op je computer, dus de modellen van Simeon antwoorden. Koppel Claude opnieuw in Instellingen › AI-modellen.",
  "claudeCode.unavailable": "Claude Code kon niet draaien op je computer, dus deze keer antwoordden de modellen van Simeon.",
};

export const IT: Readonly<Record<keyof typeof EN, string>> = {
  "claudeCode.limited": "Hai raggiunto il limite del tuo piano Claude, quindi rispondono i modelli di Simeon finché non si azzera.",
  "claudeCode.signedOut": "Claude non è più connesso sul tuo computer, quindi rispondono i modelli di Simeon. Ricollega Claude in Impostazioni › Modelli IA.",
  "claudeCode.unavailable": "Claude Code non è riuscito a funzionare sul tuo computer, quindi questa volta hanno risposto i modelli di Simeon.",
};

export const PT_BR: Readonly<Record<keyof typeof EN, string>> = {
  "claudeCode.limited": "O limite do seu plano do Claude acabou, então os modelos do Simeon respondem até ele ser renovado.",
  "claudeCode.signedOut": "O Claude não está mais conectado no seu computador, então os modelos do Simeon respondem. Conecte o Claude de novo em Ajustes › Modelos de IA.",
  "claudeCode.unavailable": "O Claude Code não conseguiu rodar no seu computador, então desta vez os modelos do Simeon responderam.",
};

export const SV: Readonly<Record<keyof typeof EN, string>> = {
  "claudeCode.limited": "Gränsen för ditt Claude-abonnemang är nådd, så Simeons modeller svarar tills den återställs.",
  "claudeCode.signedOut": "Claude är inte längre inloggat på din dator, så Simeons modeller svarar. Anslut Claude igen under Inställningar › AI-modeller.",
  "claudeCode.unavailable": "Claude Code kunde inte köras på din dator, så Simeons modeller svarade den här gången.",
};

export const PL: Readonly<Record<keyof typeof EN, string>> = {
  "claudeCode.limited": "Limit twojego planu Claude został wyczerpany, więc odpowiadają modele Simeona, dopóki się nie odnowi.",
  "claudeCode.signedOut": "Claude nie jest już zalogowany na twoim komputerze, więc odpowiadają modele Simeona. Połącz Claude ponownie w Ustawienia › Modele AI.",
  "claudeCode.unavailable": "Claude Code nie mógł działać na twoim komputerze, więc tym razem odpowiedziały modele Simeona.",
};

export const TR: Readonly<Record<keyof typeof EN, string>> = {
  "claudeCode.limited": "Claude planının limiti doldu, bu yüzden limit yenilenene kadar Simeon’un modelleri yanıt veriyor.",
  "claudeCode.signedOut": "Claude artık bilgisayarında oturum açmış değil, bu yüzden Simeon’un modelleri yanıt veriyor. Claude’u Ayarlar › Yapay zekâ modelleri bölümünden yeniden bağla.",
  "claudeCode.unavailable": "Claude Code bilgisayarında çalışamadı, bu yüzden bu sefer Simeon’un modelleri yanıt verdi.",
};
