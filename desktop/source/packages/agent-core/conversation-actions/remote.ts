/**
 * Where a turn looks for actions that arrive for its conversation while it
 * runs (`receiver-contract.ts` says what such a place can do). The receiver
 * here is the one that never holds any.
 */
import type { Context } from "../../context/core.js";
import { createLogger } from "../../context/logger.js";

// A logger is made when this file is loaded, as it always was. Nothing here writes to it.
createLogger("RemoteConversationActionManager");

/** A receiver with nothing in it: looking finds nothing, and taking takes nothing. */
export class NoopConversationActionReceiver {
  async pop(_context: Context): Promise<undefined> {
    return undefined;
  }

  async peek(_context: Context): Promise<undefined> {
    return undefined;
  }
}
