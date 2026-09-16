/** Types for the generator, so the in-sync test can import it. */
export interface ArtifactPrompts {
  version: string;
  presentation: string;
  report: string;
}
export function signaturesOf(prompt: string): string;
export const VIEWER_ROOTS: Record<'presentation' | 'report', { from: RegExp; to: string }>;
export function build(): ArtifactPrompts;
export function render(prompts: ArtifactPrompts): string;
