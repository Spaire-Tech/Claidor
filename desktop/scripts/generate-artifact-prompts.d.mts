/** Types for the generator, so the in-sync tests can import it. */
export interface ArtifactPrompts {
  version: string;
  presentation: string;
  report: string;
}
export interface CardPrompt {
  version: string;
  root: string;
  prompt: string;
}
export const CARD_PROMPT_MARKERS: { preamble: string; rules: string };
export function signaturesOf(prompt: string): string;
export const VIEWER_ROOTS: Record<'presentation' | 'report', { from: RegExp; to: string }>;
export function build(): ArtifactPrompts;
export function buildCards(): CardPrompt;
export function render(prompts: ArtifactPrompts): string;
export function renderCards(prompt: CardPrompt): string;
export interface CardsCss {
  version: string;
  tokens: Record<string, string>;
}
export function buildCardsCss(): CardsCss;
export function renderCardsCss(css: CardsCss): string;
