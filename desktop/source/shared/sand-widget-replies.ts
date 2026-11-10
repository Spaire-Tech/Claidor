/**
 * A question card's words without its schema (no zod, so the chat list's
 * preview and the transcript can read them; `sand-widgets.ts` re-exports
 * them): its questions, what it asked in a line, and the reply a card of
 * several questions sends, a line each, read back the same.
 */

export interface WidgetLike {
  readonly prompt?: unknown;
  readonly options?: unknown;
  readonly questions?: unknown;
}

interface QuestionLike {
  readonly prompt?: unknown;
  readonly options?: unknown;
}

/** A card's questions: its `questions` when it asks several, else its own one. */
export function widgetQuestions(widget: WidgetLike): readonly QuestionLike[] {
  const steps = Array.isArray(widget.questions) ? (widget.questions as QuestionLike[]).filter((step) => step != null && typeof step === "object") : [];
  return steps.length >= 2 ? steps : [widget];
}

function summarizeQuestion(question: QuestionLike): string {
  const prompt = typeof question.prompt === "string" ? question.prompt : "Question";
  const options = Array.isArray(question.options)
    ? (question.options as { readonly label?: unknown; readonly value?: unknown }[])
    : [];
  const labels = options.map((option) => option.label).join(" / ");
  return labels.length > 0 ? `${prompt} — ${labels}` : prompt;
}

export function summarizeWidget(widget: WidgetLike): string {
  return widgetQuestions(widget).map(summarizeQuestion).join("\n");
}

/** What a skipped question of a several-question card says in the reply. */
export const SKIPPED_ANSWER = "(skipped)";

function promptWithAnswer(prompt: string, answer: string): string {
  const head = prompt.trim();
  return /[?:？：]$/.test(head) ? `${head} ${answer}` : `${head}: ${answer}`;
}

/**
 * The reply a several-question card sends: one line per question, the
 * question then its answer, `(skipped)` for one skipped (Chat.swift's
 * `QuestionCard.reply` and the web app's `questionsReply` write the same).
 */
export function formatQuestionsReply(prompts: readonly string[], answers: readonly (string | null | undefined)[]): string {
  return prompts
    .map((prompt, index) => {
      const answer = (answers[index] ?? "").replace(/\s*\n\s*/g, ", ").trim();
      return promptWithAnswer(prompt, answer.length > 0 ? answer : SKIPPED_ANSWER);
    })
    .join("\n");
}

/** Each question's answer read back from that reply (null when skipped or not there: an older app answers the first only). */
export function readQuestionsReply(prompts: readonly string[], reply: string): (string | null)[] {
  const lines = reply.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  return prompts.map((prompt, index) => {
    const line = lines[index];
    if (line === undefined) return null;
    const head = prompt.trim();
    const answer = line.startsWith(head) ? line.slice(head.length).replace(/^\s*[:：]?\s*/, "") : line;
    return answer.length === 0 || answer === SKIPPED_ANSWER ? null : answer;
  });
}

/** A card's answer in a line (the chat list's preview): a several-question card's answers, skipped ones left out. */
export function widgetReplyPreview(widget: WidgetLike, reply: string): string {
  const questions = widgetQuestions(widget);
  if (questions.length < 2) return reply;
  const prompts = questions.map((question) => (typeof question.prompt === "string" ? question.prompt : ""));
  return readQuestionsReply(prompts, reply).filter((answer): answer is string => answer !== null).join(" · ");
}

