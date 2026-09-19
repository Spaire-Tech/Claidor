import { errorMessage } from "./errors.js";

export function isProviderRateLimitError(error: unknown): boolean {
  return /rate limit|tokens per minute|\btpm\b|too many requests|\b429\b|please try again in/i.test(errorMessage(error));
}
