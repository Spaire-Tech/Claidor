/**
 * The elements of a conversation: one for each speaker's turn, and one that
 * holds the turns together. Each only names an element; what the names mean
 * is for the renderer to say (`render.ts`).
 */
import { Fragment, jsx, type PromptElement, type PromptProps } from "./jsx-runtime.js";

export const System = (props: PromptProps): PromptElement => jsx("System", props);
export const User = (props: PromptProps): PromptElement => jsx("User", props);
export const Assistant = (props: PromptProps): PromptElement => jsx("Assistant", props);
export const Tool = (props: PromptProps): PromptElement => jsx("Tool", props);

/** The turns of a conversation, held together with no name of their own: a Fragment. */
export const Conversation = (props: PromptProps): PromptElement => jsx(Fragment, props);

/** The names a renderer knows before a caller adds its own. */
export const builtinComponents = {
  System,
  User,
  Assistant,
  Tool,
  Conversation,
  Fragment,
};
