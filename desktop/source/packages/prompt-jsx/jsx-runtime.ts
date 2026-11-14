/**
 * The elements a prompt is written with. A prompt is a tree: an element has
 * a type (a name such as "p" or "section", or a function that returns more
 * of the tree), its props, and its children. This file only makes elements;
 * `render.ts` turns a tree into the text a model reads.
 */
export interface PromptElement {
  readonly type: string | ((props: PromptProps) => PromptNode);
  readonly props: PromptProps;
  readonly children?: PromptNode[] | undefined;
}

export interface PromptProps {
  readonly children?: PromptNode | PromptNode[] | undefined;
  readonly [key: string]: unknown;
}

/** Anything that can stand in a tree. Null, undefined, true and false stand for nothing. */
export type PromptNode = PromptElement | PromptNode[] | string | number | boolean | null | undefined;

/** A child that says nothing and is left out of an element's children. Zero is not one of them. */
function saysNothing(child: PromptNode): boolean {
  return child == null || typeof child === "boolean" || child === "";
}

/**
 * Makes an element. Its children are the ones in the props when there are
 * any, otherwise the arguments after the props. They are kept as one list
 * without its nothings, the same list in the props and on the element, or
 * as undefined when nothing is left.
 */
export function jsx(type: PromptElement["type"], props: PromptProps | null | undefined, ...children: PromptNode[]): PromptElement {
  const given = props || {};
  const own = given.children;
  // Children in the props that are an empty text, a zero or a false count as
  // none there: the arguments after the props are read instead.
  const candidates = own ? (Array.isArray(own) ? own : [own]) : children;
  const kept = candidates.filter((child) => !saysNothing(child));
  const list = kept.length > 0 ? kept : undefined;
  return { type, props: Object.assign({}, given, { children: list }), children: list };
}

/** An element that only holds its children together: they are read as if they stood where it stands. */
export function Fragment(props: PromptProps): PromptElement {
  return jsx("Fragment", props);
}

/** `jsx` for an element written with several children. It reads no argument after the props. */
export function jsxs(type: PromptElement["type"], props: PromptProps): PromptElement {
  return jsx(type, props);
}
