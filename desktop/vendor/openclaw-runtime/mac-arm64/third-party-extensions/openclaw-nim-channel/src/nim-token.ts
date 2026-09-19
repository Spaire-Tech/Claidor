export interface ParsedNimToken {
  appKey: string;
  account: string;
  token: string;
}

/**
 * Parse nimToken shorthand credentials.
 * Prefers the new "|" separator and falls back to legacy "-" for compatibility.
 */
export function parseNimToken(
  nimToken: string | undefined,
): ParsedNimToken | null {
  if (!nimToken) return null;

  const separator = nimToken.includes("|") ? "|" : "-";
  const parts = nimToken.split(separator);
  if (parts.length !== 3) return null;

  const [appKey, account, token] = parts.map((part) => part.trim());
  if (!appKey || !account || !token) return null;

  return { appKey, account, token };
}
