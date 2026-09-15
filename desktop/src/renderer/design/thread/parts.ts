/**
 * A message's text, taken apart the way the design draws it.
 *
 * The canvas has no attachment card and no artifact panel in the thread.
 * It has one mechanism, and it is inline: a file named inside a sentence
 * is set in a small monospace chip, and the sentence carries on around it.
 * The canvas's own line, from `docs/product/design/canvas.html`:
 *
 *     String(m.text).split(/\[\[(.+?)\]\]/g).map((chunk, k) => ({
 *       text: chunk,
 *       style: k % 2 ? "font-family:'SF Mono', …; background:rgba(16,22,35,.11)…" : ""
 *     }))
 *
 * and its one example message:
 *
 *     "A first glance found [[Mango 3y IS.xlsx]] on your Desktop — looks
 *      like it may be open, there's a lock file."
 *
 * A real engine does not write `[[…]]`. It writes markdown — `[Gym
 * Routine.docx](file:///Users/…/Gym%20Routine.docx)` — and the first
 * build rendered that verbatim, brackets, percent-escapes and all. That
 * is what the founder saw and called "artifacts do not render": nothing
 * was lost, it simply arrived as punctuation.
 *
 * So this recognises four things and turns them all into the canvas's one
 * chip, or into a link:
 *
 *   `[[name]]`            the canvas's own marker
 *   `[label](target)`     a markdown link — a chip if the target is a file
 *   `file:///…`, `/a/b.x` a file named in passing
 *   `https://…`           a link, blue, as the canvas's stylesheet sets
 *
 * Plus `` `code` `` and `**bold**`, because a model writes those in every
 * other sentence and raw asterisks in a text bubble are just wrong.
 *
 * `files` is the bridge to what the conversation actually produced —
 * `services/artifactDetection.ts` already collects it. Given that list a
 * chip knows where its file really is, so it can be opened; and a file
 * mentioned by name alone ("saved it as Gym Routine.docx") becomes a chip
 * too, which is the only way a produced document is reachable at all.
 */

import { type AppLink, AppLinkKind, isSettingsAnchor, parseAppLink } from '../../../shared/thread/links';

export const PartKind = {
  /** Prose. */
  Text: 'text',
  /** A file, in the chip. Clickable when `target` is known. */
  File: 'file',
  /** A URL, in the accent colour. */
  Link: 'link',
  /** An inline code span. The same chip, because it is the same idea. */
  Code: 'code',
  /**
   * A pill that opens a row in Settings.
   *
   * Only produced when the row actually exists in this build. A pill that
   * goes nowhere is the fabrication problem wearing better clothes.
   */
  Setting: 'setting',
  /** A chip that jumps back to an earlier message in this conversation. */
  Ref: 'ref',
} as const;
export type PartKind = typeof PartKind[keyof typeof PartKind];

export interface MessagePart {
  kind: PartKind;
  /** What is shown. Never a percent-escaped path. */
  text: string;
  /** A `File` part's path on this computer, or a `Link` part's href. */
  target?: string;
  /** `Text` parts only. */
  strong?: boolean;
  /** `Setting` and `Ref` parts: which row, or which message. */
  app?: AppLink;
}

/** A file this conversation has actually produced or touched. */
export interface KnownFile {
  /** The base name, as a person would read it. */
  name: string;
  /** Where it is, absolute. */
  path: string;
}

/**
 * One pass, ordered. The alternatives are tried left to right at each
 * position, so `[[…]]` beats `[…](…)`, and a `file://` URL inside a
 * markdown target is never also matched as a bare URL.
 */
const MARKERS = new RegExp(
  [
    '\\[\\[(?<chip>[^[\\]\\n]+?)\\]\\]',
    // A space is allowed in the target: a model writing a link to
    // `/Users/bass/Gym Routine.docx` does not always escape it, and the
    // detector (`artifactParser.ts`) accepts the same, so the chip and
    // the artifact it opens agree on what the link was.
    '\\[(?<label>[^\\]\\n]*)\\]\\((?<href>[^)\\n]+)\\)',
    '`(?<code>[^`\\n]+)`',
    '\\*\\*(?<strong>[^*\\n]+?)\\*\\*',
    '(?<url>(?:https?|file):\\/\\/[^\\s<>"\'`]+)',
    '(?<path>(?:\\/|[A-Za-z]:\\\\)[^\\s<>"\'`]*\\.[A-Za-z0-9]{1,8})',
  ].join('|'),
  'g',
);

/** Punctuation a sentence puts after a path, which is not part of it. */
const TRAILING = /[.,;:!?)\]}>"']+$/;

/** A shortest plausible file name: something, a dot, an extension. */
const FILE_NAME = /^.+\.[A-Za-z0-9]{1,8}$/;

/**
 * The readable form of a target.
 *
 * `file:///Users/bass/Desktop/Gym%20Routine.docx` is a path with a scheme
 * and percent-escapes bolted on. Nobody reads it that way and nothing on
 * this computer opens it that way either.
 */
export function filePathFromTarget(target: string): string {
  const withoutScheme = target.replace(/^file:\/\/(localhost)?/i, '');
  if (!withoutScheme) return target;
  try {
    return decodeURIComponent(withoutScheme);
  } catch {
    // A stray `%` that is not an escape. Better the raw path than nothing.
    return withoutScheme;
  }
}

/** The last segment of a path, on either kind of computer. */
export function basename(path: string): string {
  const segments = path.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

/** Whether a link target names a file rather than a page. */
export function targetIsFile(target: string): boolean {
  if (/^file:\/\//i.test(target)) return true;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) return false;
  return FILE_NAME.test(basename(target));
}

/** Where a chip's file really is, if this conversation knows. */
function resolve(name: string, files: readonly KnownFile[]): string | undefined {
  const wanted = basename(name).toLowerCase();
  return files.find(file => file.name.toLowerCase() === wanted)?.path;
}

const text = (value: string, strong?: boolean): MessagePart =>
  strong ? { kind: PartKind.Text, text: value, strong: true } : { kind: PartKind.Text, text: value };

const file = (label: string, target?: string): MessagePart =>
  target ? { kind: PartKind.File, text: label, target } : { kind: PartKind.File, text: label };

/**
 * One marker pass. `splitMessageParts` runs this, then looks through what
 * is left for files the conversation already knows about by name.
 */
function markerParts(source: string, files: readonly KnownFile[]): MessagePart[] {
  const parts: MessagePart[] = [];
  let at = 0;

  const plain = (value: string): void => {
    if (value) parts.push(text(value));
  };

  MARKERS.lastIndex = 0;
  let match = MARKERS.exec(source);
  while (match) {
    plain(source.slice(at, match.index));
    at = match.index + match[0].length;
    const groups = match.groups ?? {};

    if (groups.chip !== undefined) {
      const label = groups.chip.trim();
      parts.push(file(label, resolve(label, files)));
    } else if (groups.href !== undefined) {
      const href = groups.href;
      const label = (groups.label ?? '').trim();
      const app = parseAppLink(href);
      if (app) {
        // A pill to a row this build does not have is worse than no pill:
        // somebody clicks it, nothing happens, and they stop trusting the
        // next one. So it degrades to the label, as prose.
        if (app.kind === AppLinkKind.Settings && !isSettingsAnchor(app.id)) {
          plain(label || app.id);
        } else {
          parts.push({
            kind: app.kind === AppLinkKind.Settings ? PartKind.Setting : PartKind.Ref,
            text: label || app.id,
            app,
          });
        }
      } else if (targetIsFile(href)) {
        const path = filePathFromTarget(href);
        parts.push(file(label || basename(path), path));
      } else {
        parts.push({ kind: PartKind.Link, text: label || href, target: href });
      }
    } else if (groups.code !== undefined) {
      parts.push({ kind: PartKind.Code, text: groups.code });
    } else if (groups.strong !== undefined) {
      parts.push(text(groups.strong, true));
    } else if (groups.url !== undefined || groups.path !== undefined) {
      // A sentence's full stop is not part of the path it follows.
      const raw = (groups.url ?? groups.path) as string;
      const trimmed = raw.replace(TRAILING, '');
      const tail = raw.slice(trimmed.length);
      if (targetIsFile(trimmed)) {
        const path = filePathFromTarget(trimmed);
        parts.push(file(basename(path), path));
      } else {
        parts.push({ kind: PartKind.Link, text: trimmed, target: trimmed });
      }
      plain(tail);
    }

    match = MARKERS.exec(source);
  }

  plain(source.slice(at));
  return parts;
}

/**
 * The files this conversation produced, found by name in ordinary prose.
 *
 * Longest name first, so "Q4 board deck.pptx" is not shattered by a
 * shorter name that happens to sit inside it.
 */
function chipKnownNames(part: MessagePart, files: readonly KnownFile[]): MessagePart[] {
  if (part.kind !== PartKind.Text || !files.length) return [part];

  const named = [...files]
    .filter(one => one.name.length >= 5 && FILE_NAME.test(one.name))
    .sort((a, b) => b.name.length - a.name.length);
  if (!named.length) return [part];

  let rest: MessagePart[] = [part];
  for (const one of named) {
    const next: MessagePart[] = [];
    for (const piece of rest) {
      if (piece.kind !== PartKind.Text) { next.push(piece); continue; }
      let from = 0;
      const haystack = piece.text.toLowerCase();
      const needle = one.name.toLowerCase();
      for (;;) {
        const found = haystack.indexOf(needle, from);
        if (found === -1) break;
        if (found > from) next.push(text(piece.text.slice(from, found), piece.strong));
        next.push(file(piece.text.slice(found, found + one.name.length), one.path));
        from = found + one.name.length;
      }
      if (from === 0) next.push(piece);
      else if (from < piece.text.length) next.push(text(piece.text.slice(from), piece.strong));
    }
    rest = next;
  }
  return rest;
}

/**
 * A message's text as the runs a bubble draws.
 *
 * Empty runs are dropped, exactly as the canvas drops them, so a message
 * that is nothing but a file name is one chip and no stray spans.
 */
export function splitMessageParts(
  source: string,
  files: readonly KnownFile[] = [],
): MessagePart[] {
  return markerParts(source, files)
    .flatMap(part => chipKnownNames(part, files))
    .filter(part => part.text !== '');
}
