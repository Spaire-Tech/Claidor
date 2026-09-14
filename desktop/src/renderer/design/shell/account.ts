/**
 * What the account row says about credits.
 *
 * Kept apart from the menu that draws it because the interesting cases
 * are arithmetic, not layout: no quota yet, a limit of zero, and the one
 * the plan's audit calls out — a person who has run out, which the canvas
 * never draws because its mock sits at 74%.
 */

/**
 * Where Support goes.
 *
 * One constant, because it is the one thing here nobody has confirmed:
 * the app's server is `api.claidor.com`, so this is the matching mailbox.
 * If the address is wrong it is wrong in exactly one place.
 */
export const SUPPORT_ADDRESS = 'support@claidor.com';

/**
 * The mail draft Support opens.
 *
 * The version and the platform are in the body already, because they are
 * the first two things anybody is asked for and the last two a person
 * thinks to include.
 */
export function supportMailto(
  { version, platform }: { version?: string; platform?: string } = {},
): string {
  const lines = [
    '',
    '',
    '---',
    `Version: ${version || 'unknown'}`,
    `Platform: ${platform || 'unknown'}`,
  ];
  const query = new URLSearchParams({ subject: 'Faiser', body: lines.join('\n') });
  // URLSearchParams writes spaces as `+`, which a mail client shows
  // literally in the body. Percent-escapes are what mailto: wants.
  return `mailto:${SUPPORT_ADDRESS}?${query.toString().replace(/\+/g, '%20')}`;
}

export interface Quota {
  planName?: string;
  creditsLimit?: number;
  creditsUsed?: number;
  creditsRemaining?: number;
}

export interface UsageLine {
  /** "Usage", or the plan's name when the server gave one. */
  title: string;
  /** "74%", or empty while there is nothing to show. */
  value: string;
  /** 0–1, for the bar. Undefined when there is nothing to draw. */
  fraction?: number;
  /** True once there is nothing left. */
  spent: boolean;
}

/**
 * A percentage only when one can honestly be computed.
 *
 * A missing quota is not zero percent — it is not knowing, and drawing an
 * empty bar for it would tell somebody their account is fine when nobody
 * has asked the server yet.
 */
export function usageLine(quota: Quota | null | undefined): UsageLine {
  const title = quota?.planName?.trim() || 'Usage';
  const limit = quota?.creditsLimit;
  const used = quota?.creditsUsed;

  if (typeof limit !== 'number' || typeof used !== 'number' || limit <= 0) {
    return { title, value: '', spent: false };
  }

  const fraction = Math.min(1, Math.max(0, used / limit));
  const spent = used >= limit;
  return {
    title,
    // Rounded, but never rounded up to 100% while something is left, and
    // never down to 99% once it is gone.
    value: spent ? 'All used' : `${Math.min(99, Math.floor(fraction * 100))}%`,
    fraction,
    spent,
  };
}
