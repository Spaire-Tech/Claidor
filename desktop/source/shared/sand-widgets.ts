import { z } from "zod";

export const widgetActionStyleSchema = z.enum(["default", "primary", "danger"]);

/** A choice's schema, made afresh for each use: a schema object used twice becomes a `$ref` on the wire, which some models refuse. */
function choiceOption() {
  return z.object({
    label: z.string().trim().min(1),
    value: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "Text sent back to you when this option is picked. Defaults to the label. Make it read like something the user would naturally say in reply.",
      ),
    description: z.string().trim().min(1).optional(),
    style: z.enum(["default", "primary", "danger"]).optional(),
  });
}

export const choiceOptionSchema = choiceOption();

/** One question of a card that asks several (`questions`): the same parts as a card's own question. */
export const questionStepSchema = z.object({
  prompt: z.string().trim().min(1),
  helpText: z.string().trim().min(1).optional(),
  options: z.array(choiceOption()).min(1).max(6),
  multiSelect: z.boolean().optional(),
  allowCustom: z.boolean().optional(),
});

/** The most questions one card asks (10 November 2026): more is a form, not a card. */
export const MAX_CARD_QUESTIONS = 4;

export const sandWidgetSchema = z.object({
  prompt: z.string().trim().min(1),
  helpText: z.string().trim().min(1).optional(),
  options: z.array(choiceOptionSchema).min(1).max(6),
  multiSelect: z
    .boolean()
    .optional()
    .describe(
      "When true, the user can pick several options and send them together; their values come back to you one per line.",
    ),
  allowCustom: z
    .boolean()
    .optional()
    .describe(
      "When true, the user can type a custom free-text answer instead of choosing one of the options.",
    ),
  dismissOnMoveOn: z
    .boolean()
    .optional()
    .describe(
      "When true, this widget auto-dismisses (becomes inert, shows a muted Dismissed state) once the user sends a newer message without answering it. Omit/false to keep the question live and answerable indefinitely. Set true only for low-stakes questions that become moot if the user moves on; keep it off for real decisions you still need answered.",
    ),
  questions: z
    .array(questionStepSchema)
    .min(2)
    .max(MAX_CARD_QUESTIONS)
    .optional()
    .describe(
      `Optional: two to ${MAX_CARD_QUESTIONS} questions in one card, the whole set, the first included, most important first; each { prompt, helpText?, options, multiSelect?, allowCustom? }. The user goes through them one at a time (Next, Back, Skip) and sends them together; prompt, options and the rest are then the first question's. Their answers come back as one reply, one line per question: the question, then the answer ("Budget? Under $75 CAD"), "(skipped)" for one they skipped.`,
    ),
});

export type SandWidget = z.infer<typeof sandWidgetSchema>;

/**
 * Several questions in one card (10 November 2026, the founder: "have the
 * thing swipe when there's many questions instead of having the agent send
 * one by one"). `questions` is the whole set; the card's own prompt and
 * options are always its first question's, so an app that reads only those
 * still shows a question, and the agent's reply then answers that one.
 * A model that wrote the first question at the top and the others in
 * `questions` keeps all of them; one question in `questions` is a card's own.
 */
export function normalizeSandWidget(value: unknown): unknown {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return value;
  const widget = value as Record<string, unknown>;
  if (!Array.isArray(widget.questions)) return value;
  const steps = (widget.questions as unknown[]).filter((step): step is Record<string, unknown> => step != null && typeof step === "object" && !Array.isArray(step) && typeof (step as { prompt?: unknown }).prompt === "string" && ((step as { prompt: string }).prompt).trim().length > 0);
  const same = (a: unknown, b: unknown): boolean => typeof a === "string" && typeof b === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();
  const top = typeof widget.prompt === "string" && widget.prompt.trim().length > 0 && Array.isArray(widget.options)
    ? { prompt: widget.prompt, ...(widget.helpText === undefined ? {} : { helpText: widget.helpText }), options: widget.options, ...(widget.multiSelect === undefined ? {} : { multiSelect: widget.multiSelect }), ...(widget.allowCustom === undefined ? {} : { allowCustom: widget.allowCustom }) }
    : undefined;
  const all = top !== undefined && !steps.some((step) => same(step.prompt, top.prompt)) ? [top, ...steps] : steps;
  const { questions: _questions, prompt: _prompt, helpText: _help, options: _options, multiSelect: _multi, allowCustom: _custom, ...rest } = widget;
  const first = all[0];
  if (first === undefined) return rest;
  const own = { prompt: first.prompt, ...(first.helpText === undefined ? {} : { helpText: first.helpText }), options: first.options, ...(first.multiSelect === undefined ? {} : { multiSelect: first.multiSelect }), ...(first.allowCustom === undefined ? {} : { allowCustom: first.allowCustom }) };
  return all.length < 2 ? { ...rest, ...own } : { ...rest, ...own, questions: all };
}

export {
  SKIPPED_ANSWER,
  formatQuestionsReply,
  readQuestionsReply,
  summarizeWidget,
  widgetQuestions,
  widgetReplyPreview,
} from "./sand-widget-replies.js";

interface WidgetLike {
  readonly prompt?: unknown;
  readonly options?: unknown;
}

export function getWidgetAnswerLabel(widget: WidgetLike, answer: string): string {
  const options = Array.isArray(widget.options)
    ? (widget.options as { readonly label?: string; readonly value?: string }[])
    : [];
  const match = options.find((option) => (option.value ?? option.label) === answer);
  return match?.label ?? answer;
}
