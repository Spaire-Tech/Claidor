import { Code, ConnectError } from "@connectrpc/connect";

const ABSENT_CONNECT_CODES = new Set<Code>([
  Code.Unknown,
  Code.NotFound,
  Code.PermissionDenied,
  Code.Unimplemented,
  Code.Internal,
  Code.Unavailable,
  Code.Unauthenticated,
]);
const ABSENT_NUMERIC_CODES = new Set([2, 5, 7, 12, 13, 14, 16]);
const ABSENT_HTTP_STATUSES = new Set([401, 403, 404, 501, 502, 503]);

export function isAbsentCloudAutomationService(error: unknown): boolean {
  if (error instanceof ConnectError) return ABSENT_CONNECT_CODES.has(error.code);
  if (typeof error !== "object" || error == null) {
    return /unimplemented|not found|unauthenticated|unauthorized|permission denied|\b401\b|\b403\b|\b404\b|\b501\b|\b502\b/i.test(String(error));
  }
  const record = error as { code?: unknown; status?: unknown; message?: unknown };
  const code = record.code;
  const status = record.status;
  const message = error instanceof Error ? error.message : String(record.message ?? error);
  return ABSENT_NUMERIC_CODES.has(Number(code))
    || code === "unimplemented" || code === "not_found" || code === "unauthenticated" || code === "permission_denied"
    || (typeof status === "number" && ABSENT_HTTP_STATUSES.has(status))
    || /unimplemented|not found|unauthenticated|unauthorized|permission denied|\b401\b|\b403\b|\b404\b|\b501\b|\b502\b/i.test(message);
}
