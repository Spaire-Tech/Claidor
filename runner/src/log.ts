/** One line per event, tagged, English, no secrets. */

const stamp = (): string => new Date().toISOString();

export const log = {
  info(message: string): void {
    console.log(`${stamp()} [runner] ${message}`);
  },
  warn(message: string): void {
    console.warn(`${stamp()} [runner] ${message}`);
  },
  error(message: string, error?: unknown): void {
    if (error === undefined) {
      console.error(`${stamp()} [runner] ${message}`);
      return;
    }
    console.error(`${stamp()} [runner] ${message}`, error);
  },
};

/** What a caught value says, without a stack and without a secret in it. */
export const reasonOf = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};
