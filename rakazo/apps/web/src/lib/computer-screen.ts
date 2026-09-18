export interface ComputerScreenResult {
  url: string | null;
  error: string | null;
}

/**
 * Whether a screen URL held by the client has just been revoked server-side.
 *
 * A database trigger raises `computers.screenGeneration` on every state change
 * except `booting` → `running`, and on every change of `providerRef`
 * (`20260909000000_screen_generation`). Its comment gives the reason: *"A
 * resumed provider may reuse its address and reference; old URLs must stay
 * revoked."* The fence is right. What was missing is that the client never
 * noticed, so a screen open across an idle pause went black and stayed black,
 * while the proxy rechecked the dead capability once a second and collected
 * 403s nobody could read.
 *
 * A computer paused for idleness and resumed is not something a person should
 * have to understand, so the transition back to `running` refetches instead of
 * asking them to.
 *
 * This watches state rather than the generation itself, because the generation
 * is not in the client's contract and putting it there would widen the merge
 * surface with upstream for no behaviour we do not already get here. The cost
 * is honest: a pause and resume that both land between two observations is not
 * seen, and that screen still needs reopening.
 */
export function screenWasRevoked(
  previous: string | null | undefined,
  next: string | null | undefined,
): boolean {
  if (next !== "running") return false;
  if (previous === null || previous === undefined) return false;
  // The one state change the trigger deliberately ignores, so nothing was revoked.
  if (previous === "booting") return false;
  return previous !== next;
}

/** Only the latest request for the visible computer may replace its screen or error. */
export async function loadComputerScreen(options: {
  load: () => Promise<{ url: string | null }>;
  isCurrent: () => boolean;
  commit: (result: ComputerScreenResult) => void;
  fallbackError: string;
}): Promise<string | null> {
  let result: ComputerScreenResult;
  try {
    const screen = await options.load();
    result = { url: screen.url, error: null };
  } catch (error) {
    result = {
      url: null,
      error: error instanceof Error && error.message ? error.message : options.fallbackError,
    };
  }
  if (!options.isCurrent()) return null;
  options.commit(result);
  return result.url;
}
