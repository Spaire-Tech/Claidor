import { Code, ConnectError } from "@connectrpc/connect";

export function isAbsentCloudAutomationService(error: unknown): boolean {
  if (error instanceof ConnectError) {
    return error.code === Code.Unimplemented || error.code === Code.NotFound || error.code === Code.Unavailable;
  }
  if (typeof error !== "object" || error == null) return /unimplemented|not found|\b404\b|\b501\b/i.test(String(error));
  const record = error as { code?: unknown; status?: unknown; message?: unknown };
  const code = record.code;
  const status = record.status;
  const message = error instanceof Error ? error.message : String(record.message ?? error);
  return code === 12 || code === 5 || code === 14 || code === "unimplemented" || code === "not_found"
    || status === 404 || status === 501
    || /unimplemented|not found|\b404\b|\b501\b/i.test(message);
}
