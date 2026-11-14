/**
 * Turns a prompt tree into the text a model reads.
 *
 * A text or a number alone is written as it is. A list of nodes is written
 * as paragraphs: each block (p, a heading, a list, a section, an x tag,
 * pre) is one, the texts between blocks are gathered into paragraphs of
 * their own, and an empty line sets one paragraph apart from the next.
 * Fragments and components are replaced by what they hold or return before
 * anything of the list is written.
 *
 * System, User, Assistant, Tool and Conversation belong to a conversation.
 * There each message and each bare text is a line, and blocks say nothing.
 */
import { builtinComponents } from "./components.js";
import type { PromptElement, PromptNode, PromptProps } from "./jsx-runtime.js";

type Component = (props: PromptProps) => PromptNode;

interface RenderOptions {
  /** Components of the caller's own, found by the name an element has as its type. */
  readonly components?: Readonly<Record<string, Component>> | undefined;
}

/** The elements that are a paragraph of their own in a list of nodes, the headings aside. */
const BLOCKS: ReadonlySet<string> = new Set(["p", "section", "ul", "ol", "x", "pre"]);
const HEADING = /^h[1-6]$/;
/** The elements whose content is one message of a conversation. */
const SPEAKERS: ReadonlySet<string> = new Set(["System", "User", "Assistant", "Tool"]);
/** The elements that say nothing in a conversation. */
const SILENT: ReadonlySet<string> = new Set(["p", "section", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "x", "pre", "br"]);

/** Whether a node is an element: an object that has a type, its own or inherited. */
function isElement(node: PromptNode): node is PromptElement {
  return typeof node === "object" && node !== null && !Array.isArray(node) && "type" in node;
}

/**
 * Whether an element of this type is a paragraph of its own in a list of
 * nodes. A component never is: it is replaced by what it returns before
 * this is asked.
 */
function isBlock(type: PromptElement["type"]): boolean {
  return typeof type !== "function" && (BLOCKS.has(type) || HEADING.test(type));
}

/**
 * A list of nodes as it stands once its inner lists are opened, its
 * nothings dropped, and every Fragment and component replaced by what it
 * holds or returns, however deep. The components of the list are all called
 * here, in order, before any of it is written.
 *
 * What an inner list, a Fragment or a component gives is handed over in one
 * call, so there is a most it can hold (about 125,000 nodes where this was
 * measured): beyond it the JavaScript engine refuses the call with a
 * RangeError. A list given flat has no such limit.
 */
function settled(nodes: PromptNode[]): PromptNode[] {
  const flat: PromptNode[] = [];
  for (const node of nodes) {
    if (node == null || typeof node === "boolean") continue;
    if (Array.isArray(node)) {
      flat.push(...settled(node));
      continue;
    }
    if (!isElement(node) || (node.type !== "Fragment" && typeof node.type !== "function")) {
      flat.push(node);
      continue;
    }
    // A Fragment gives what it holds, a component what it returns: that stands in its place.
    const inPlace = typeof node.type === "function" ? node.type(node.props) : node.props.children;
    if (inPlace != null) flat.push(...settled(Array.isArray(inPlace) ? inPlace : [inPlace]));
  }
  return flat;
}

/**
 * The children of a list or of an item as one flat list: inner lists are
 * opened, everything else is kept, nothings too. An inner list is handed
 * over in one call, with the same limit as above.
 */
function opened(children: PromptNode): PromptNode[] {
  if (!Array.isArray(children)) return [children];
  const flat: PromptNode[] = [];
  for (const child of children) {
    if (Array.isArray(child)) flat.push(...opened(child));
    else flat.push(child);
  }
  return flat;
}

/** A paragraph of text tidied: runs of spaces become one space, the ends are trimmed, and the newlines it ended with are put back. */
function tidied(text: string): string {
  const ending = /\n+$/.exec(text)?.[0] ?? "";
  return text.replace(/ +/g, " ").trim() + ending;
}

/**
 * Paragraphs put together. An empty line stands between two of them, unless
 * the second is blank (it is then only the spaces and newlines it holds) or
 * the first is a text that already ends its line. Newlines at the very
 * start and the very end are cut.
 */
function joined(paragraphs: readonly string[]): string {
  let text = "";
  let previous: string | undefined;
  for (const paragraph of paragraphs) {
    if (previous === undefined) {
      text = paragraph;
    } else {
      const follows = !paragraph.trim() || (previous.trim() !== "" && previous.endsWith("\n"));
      text += follows ? paragraph : `\n\n${paragraph}`;
    }
    previous = paragraph;
  }
  return text.replace(/^\n+/, "").replace(/\n+$/, "");
}

/** A heading: as many hashes as the level in its name ("h3" has three), then its text. A heading without text is nothing. */
function heading(type: string, content: string): string {
  const title = content.trim();
  if (!title) return "";
  const level = Number.parseInt(type.slice(1), 10);
  return `${"#".repeat(level)} ${title}`;
}

/**
 * What a tag carries after its name, with a space before it, or nothing.
 * A value that is true is written as the bare name; false, null and
 * undefined are not written; anything else is written in quotes.
 */
function attributesOf(attributes: Readonly<Record<string, unknown>>): string {
  const written: string[] = [];
  for (const name of Object.keys(attributes)) {
    const value = attributes[name];
    if (value == null) continue;
    const one = typeof value === "boolean" ? (value ? name : "") : `${name}="${String(value).replace(/"/g, "&quot;")}"`;
    if (one) written.push(one);
  }
  return written.length > 0 ? ` ${written.join(" ")}` : "";
}

/** A tag around its content, `gap` between the two on each side, or a tag closed at once when the content is blank. */
function tagged(name: string, carried: string, content: string, gap: string): string {
  if (!content.trim()) return `<${name}${carried} />`;
  return `<${name}${carried}>${gap}${content}${gap}</${name}>`;
}

/**
 * A numbered item that has no text of its own, only lists: the first line
 * of the lists stands beside the number, and every other line is lined up
 * under it, whatever its own indentation was.
 */
function besideNumber(mark: string, lists: readonly string[], indent: number): string {
  const [first = "", ...others] = lists.join("\n").split("\n");
  const pad = " ".repeat(indent);
  return [`${mark} ${first.trimStart()}`, ...others.map((line) => pad + line.trimStart())].join("\n");
}

/**
 * What stands in pre, letter for letter: texts and numbers as they are, a
 * line break as a newline, and of any other element only what it holds.
 */
function verbatim(node: PromptNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(verbatim).join("");
  if (typeof node.type === "function") return verbatim(node.type(node.props));
  if (node.type === "br") return "\n";
  return verbatim(node.props.children);
}

/** One call to `renderContent`: the names it can resolve, and the writing itself. */
class Rendering {
  private readonly components: Readonly<Record<string, Component>>;

  constructor(options: RenderOptions) {
    // The part's own names first, then the caller's, which win.
    this.components = Object.assign({}, builtinComponents, options.components);
  }

  /** The text of any node. */
  content(node: PromptNode): string {
    if (node == null || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return this.paragraphs(node);
    return this.element(node);
  }

  /** The text of one element, as it is written when it stands alone. */
  private element(element: PromptElement): string {
    if (typeof element.type === "function") return this.content(element.type(element.props));
    switch (element.type) {
      case "p":
      case "Fragment":
        return this.content(element.props.children);
      case "br":
        return "\n";
      case "x":
        return this.xTag(element.props);
      case "section":
        return this.section(element.props);
      case "pre":
        return verbatim(element.props.children);
      case "ul":
        return this.list(element.props.children, false, 0);
      case "ol":
        return this.list(element.props.children, true, 0);
      case "li":
        return `- ${this.content(element.props.children)}`;
    }
    if (HEADING.test(element.type)) return heading(element.type, this.content(element.props.children));
    // Everything else belongs to a conversation, or is a name to look up.
    return this.lines(element).join("\n");
  }

  /** A list of nodes, written as paragraphs. */
  private paragraphs(nodes: PromptNode[]): string {
    const paragraphs: string[] = [];
    // The text gathered since the last block. It becomes a paragraph when a block or the end closes it.
    let text = "";
    const closeText = (): void => {
      if (text.trim()) paragraphs.push(tidied(text));
      // A text of spaces is dropped, but one that holds a newline is kept as it is: a line break between two blocks counts.
      else if (text.includes("\n")) paragraphs.push(text);
      text = "";
    };
    for (const node of settled(nodes)) {
      if (!isElement(node) || !isBlock(node.type)) {
        text += this.content(node);
        continue;
      }
      closeText();
      const block = this.element(node);
      // Pre is kept to the letter, and counts as a paragraph even when empty.
      if (node.type === "pre") paragraphs.push(block);
      else if (block.trim()) paragraphs.push(block.trim());
    }
    closeText();
    return joined(paragraphs);
  }

  /** An x element: a tag named by its `tag` prop, or "x", around its content. */
  private xTag(props: PromptProps): string {
    const { children, key: _key, tag, ...attributes } = props;
    const content = this.content(children);
    const carried = attributesOf(attributes);
    return tagged(String(tag || "x"), carried, content, "");
  }

  /** A section: a tag named after its title, lower case with a dash for each run of white space, its content on lines of its own. */
  private section(props: PromptProps): string {
    const { children, key: _key, title, ...attributes } = props;
    const name = String(title).toLowerCase().replace(/\s+/g, "-");
    const content = this.content(children);
    return tagged(name, attributesOf(attributes), content, "\n");
  }

  /**
   * A list written out, one line to an item, `indent` spaces in. A numbered
   * list counts from one the items that have something to show; a dash
   * list marks each of them with a dash.
   */
  private list(children: PromptNode, numbered: boolean, indent: number): string {
    if (children == null) return "";
    const pad = " ".repeat(indent);
    // A list inside an item starts under the item's text: past "- ", or past "1. ".
    const inner = indent + (numbered ? 3 : 2);
    const lines: string[] = [];
    let count = 0;
    for (const child of opened(children)) {
      if (!isElement(child) || child.type !== "li") {
        // Not an item: a line of its own, with no mark and no number.
        const loose = this.content(child).trim();
        if (loose) lines.push(pad + loose);
        continue;
      }
      const { text, lists } = this.item(child.props.children, inner);
      const own = text.trim();
      if (!own && lists.length === 0) continue;
      count += 1;
      const mark = numbered ? `${pad}${count}.` : `${pad}-`;
      if (!own && numbered) {
        lines.push(besideNumber(mark, lists, inner));
        continue;
      }
      if (own) lines.push(`${mark} ${own}`);
      // The lists of one item are added in one call: an item cannot hold more of them than a call can be passed.
      lines.push(...lists);
    }
    return lines.join("\n");
  }

  /** An item's own text, and the lists inside it, each already written `indent` spaces in. */
  private item(children: PromptNode, indent: number): { text: string; lists: string[] } {
    let text = "";
    const lists: string[] = [];
    if (children == null) return { text, lists };
    for (const child of opened(children)) {
      // A component standing directly in an item is asked here, so that a list it returns is the item's own list.
      const part = isElement(child) && typeof child.type === "function" ? child.type(child.props) : child;
      if (isElement(part) && (part.type === "ul" || part.type === "ol")) {
        const list = this.list(part.props.children, part.type === "ol", indent);
        if (list.trim()) lists.push(list);
      } else {
        text += this.content(part);
      }
    }
    return { text, lists };
  }

  /**
   * What a node says in a conversation: a line for each message and for
   * each bare text or number. Blocks say nothing there.
   */
  private lines(node: PromptNode): string[] {
    if (node == null || typeof node === "boolean") return [];
    if (typeof node === "string" || typeof node === "number") return [String(node)];
    if (Array.isArray(node)) return node.flatMap((child) => this.lines(child));
    if (typeof node.type === "function") return this.lines(node.type(node.props));
    if (typeof node.type !== "string") throw new Error(`Unknown element type: ${String(node.type)}`);
    const name = node.type;
    if (SPEAKERS.has(name)) return [this.content(node.props.children)];
    if (name === "Fragment") return this.lines(node.props.children);
    if (SILENT.has(name)) return [];
    const component = this.components[name];
    if (component === undefined) throw new Error(`Unknown component type: ${name}`);
    return this.lines(component(node.props));
  }
}

export function renderContent(element: PromptNode, options?: RenderOptions): string {
  return new Rendering(options || {}).content(element);
}
