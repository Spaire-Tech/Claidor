/**
 * A question to the person that was answered without them. The reason
 * given starts with a marker and a kind, so that it can be told from a
 * reason the person gave, and goes on with words for the model.
 */

export const ASK_QUESTION_AUTO_ANSWER_MARKER = "ask_question_auto_answer";
export const ASK_QUESTION_AUTO_ANSWER_REASON_PREFIX = "No response was received within the time limit";
export const ASK_QUESTION_AUTO_ANSWER_REASON_BODY = `${ASK_QUESTION_AUTO_ANSWER_REASON_PREFIX}. Proceed with the recommended option(s) you offered for each question, or your best judgment based on the information already available.`;

export type AskQuestionAutoAnswerIdentity = { marker: typeof ASK_QUESTION_AUTO_ANSWER_MARKER; kind: "timeout" | "other" };

/** How a reason starts when it carries an identity: the marker, a colon, one of the two kinds, a bar. */
const WRITTEN_IDENTITY = new RegExp(`^${ASK_QUESTION_AUTO_ANSWER_MARKER}:(timeout|other)\\|`);

/** A reason without the spaces around it; a missing one is empty. */
function trimmed(reason: string | null | undefined): string {
  return (reason ?? "").trim();
}

export function createAskQuestionAutoAnswerIdentity(kind: AskQuestionAutoAnswerIdentity["kind"] = "timeout"): AskQuestionAutoAnswerIdentity {
  return { marker: ASK_QUESTION_AUTO_ANSWER_MARKER, kind };
}

/** The reason in full: the identity, a bar, then the words for the model. */
export function formatAskQuestionAutoAnswerReason(identity = createAskQuestionAutoAnswerIdentity()): string {
  return `${identity.marker}:${identity.kind}|${ASK_QUESTION_AUTO_ANSWER_REASON_BODY}`;
}

/** The identity a reason starts with, if it starts with one. What follows the bar is not looked at. */
export function parseAskQuestionAutoAnswerIdentity(reason: string | null | undefined): AskQuestionAutoAnswerIdentity | undefined {
  const kind = WRITTEN_IDENTITY.exec(trimmed(reason))?.[1];
  return kind === undefined ? undefined : createAskQuestionAutoAnswerIdentity(kind as AskQuestionAutoAnswerIdentity["kind"]);
}

/** Whether a reason is one of these: it carries an identity or, spaces aside, starts with the opening words. */
export function isAskQuestionAutoAnswerReason(reason: string | null | undefined): boolean {
  return parseAskQuestionAutoAnswerIdentity(reason) !== undefined || trimmed(reason).startsWith(ASK_QUESTION_AUTO_ANSWER_REASON_PREFIX);
}

export const ASK_QUESTION_AUTO_ANSWER_REASON = formatAskQuestionAutoAnswerReason();
