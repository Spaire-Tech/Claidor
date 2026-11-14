/**
 * What an exec hook is told of the turn it runs in: the conversation, the
 * generation, the model, and the roots of the workspace. Each goes down the
 * context under a key of its own, and reads as undefined in a context where
 * the turn set nothing.
 */
import { createKey } from "../context/core.js";

/** A key for a text that may not have been set. Its symbol carries `name`, which shows where a key is printed. */
const textKey = (name: string) => createKey<string | undefined>(Symbol(name), undefined);

export const execHookConversationIdKey = textKey("execHookConversationId");
export const execHookGenerationIdKey = textKey("execHookGenerationId");
export const execHookModelKey = textKey("execHookModel");
export const execHookWorkspaceRootsKey = createKey<readonly string[] | undefined>(Symbol("execHookWorkspaceRoots"), undefined);
