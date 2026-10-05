/**
 * Command output is blanked of secret values before the agent reads it
 * (2 October 2026). The box receives the names of its secrets
 * (`CLOUD_AGENT_INJECTED_SECRET_NAMES`, `box-secrets.ts`), but nothing in the
 * box or the host blanked their values: a command that printed one handed it
 * to the model and into the chat. The host keeps the values it applied here,
 * and the shell tool's results pass through `redactSecretValues`.
 */
export const REDACTED_SECRET_TEXT = "[secret]";
/** Shorter values are not blanked: they would match ordinary words. */
export const MIN_REDACTED_SECRET_LENGTH = 8;

let values: readonly string[] = [];

export function setRedactedSecretValues(next: Iterable<string>): void {
  values = [...new Set([...next].filter((value) => typeof value === "string" && value.length >= MIN_REDACTED_SECRET_LENGTH))].sort((a, b) => b.length - a.length);
}

export function redactSecretValues(text: string): string {
  if (values.length === 0 || text.length === 0) return text;
  let out = text;
  for (const value of values) if (out.includes(value)) out = out.split(value).join(REDACTED_SECRET_TEXT);
  return out;
}

/**
 * The environment variable a key asked for in the chat becomes, from what the
 * agent named it for: connector "render", field "api_key" is RENDER_API_KEY;
 * a field that already names the service is kept as it is ("RENDER_API_KEY").
 */
export function agentKeyEnvName(connector: string, field: string): string {
  const part = (text: string): string => text.replace(/([a-z\d])([A-Z])/g, "$1_$2").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
  const service = part(connector);
  const what = part(field) || "API_KEY";
  let name = service.length === 0 || what === service || what.startsWith(`${service}_`) ? what : `${service}_${what}`;
  if (!/^[A-Z_]/.test(name)) name = `KEY_${name}`;
  if (/^(SAND_|LD_|__SIMEON)|SIMEON_SANDBOX/.test(name) || ["PATH", "HOME", "USER", "SHELL", "TERM", "PWD", "DISPLAY", "CLOUD_AGENT_INJECTED_SECRET_NAMES"].includes(name)) name = `USER_${name}`;
  return name.slice(0, 120);
}
