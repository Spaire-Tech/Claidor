export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const trimmed = error.message.trim();
    if (trimmed.length > 0 && trimmed !== "[object Object]") return trimmed;
    if (error.cause !== undefined) return errorMessage(error.cause);
  }
  return unknownErrorText(error);
}

export function asError(error: unknown): Error {
  if (error instanceof Error && error.message.trim() !== "[object Object]") return error;
  const text = errorMessage(error);
  if (error instanceof Error) {
    if (error.message.trim() === text) return error;
    const wrapped = new Error(text);
    wrapped.cause = error;
    return wrapped;
  }
  return new Error(text);
}

function usableText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== "[object Object]" ? trimmed : undefined;
}

function parsedJsonText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
  try {
    const inner = unknownErrorText(JSON.parse(trimmed));
    return inner === "Unknown error" || inner === "[object Object]" ? undefined : inner;
  } catch {
    return undefined;
  }
}

function unknownErrorText(error: unknown): string {
  if (error == null) return "Unknown error";
  if (typeof error === "string") return usableText(error) ?? "Unknown error";
  if (typeof error !== "object") return String(error);
  const record = error as Record<string, unknown>;
  const fromMessage = usableText(record.message);
  if (fromMessage !== undefined) return fromMessage;
  const fromNestedString = usableText(record.error);
  if (fromNestedString !== undefined) return fromNestedString;
  if (record.error != null && typeof record.error === "object") {
    const inner = unknownErrorText(record.error);
    if (inner !== "Unknown error" && inner !== "[object Object]") return inner;
  }
  const fromData = record.data != null && typeof record.data === "object" ? unknownErrorText(record.data) : undefined;
  if (fromData !== undefined && fromData !== "Unknown error" && fromData !== "[object Object]") return fromData;
  const fromBody = parsedJsonText(record.responseBody) ?? usableText(record.responseBody) ?? parsedJsonText(record.text) ?? usableText(record.text);
  if (fromBody !== undefined) return fromBody;
  try {
    const json = JSON.stringify(error);
    if (json != null && json !== "{}" && json !== "[]" && json !== "null") return json;
  } catch { /* circular */ }
  return "Unknown error";
}

export function errorLogTag(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  const code = (error as Error & { readonly code?: unknown }).code;
  return typeof code === "string" && code.length > 0 ? `${error.name} (${code})` : error.name;
}
