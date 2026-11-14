/**
 * The two wrappers that keep a value together with its privacy labels: the
 * kind of data it is, the field it sits in, and the mode or context it was
 * made under. The value comes out through `unwrap`, which asks what it is
 * wanted for. Written out without being unwrapped, a redacted string shows
 * its value, or the field's placeholder when redaction is enforced.
 */
import {
  allowedPurpose,
  type DataClassification,
  type PrivacyCapability,
} from "./classification.js";
import {
  resolveEnforceRedaction,
  toPrivacyContext,
  type PrivacyContext,
} from "./privacy-context.js";
import type { PrivacyMode } from "./privacy-mode.js";
import { formatRedacted, getRedactionAwareDisplayValue, shouldRedact } from "./shouldRedact.js";

/**
 * A developer's own run, decided once when this file is loaded: NODE_ENV is
 * "development" and the run is not under VITEST. Where there is no process
 * at all, it is not one.
 */
const DEVELOPERS_RUN =
  typeof process !== "undefined" &&
  process.env.NODE_ENV === "development" &&
  process.env.VITEST !== "true";

/**
 * What the console is told when an unwrap that was not allowed goes through
 * because nothing enforces redaction. Nothing in the engine sets a logger,
 * so this line is all such an unwrap leaves behind.
 */
const LET_THROUGH_LINE =
  "[PRIVACY REDACTION] logger not initialized — call setRedactionLogger() at process startup";

/**
 * What a developer's run is told when text is made from a field that would
 * be hidden. The field, its kind and the way the text was asked for follow.
 */
const IMPLICIT_TEXT_REFUSAL =
  "[PRIVACY REDACTION] ERROR: Redaction via implicit serialization caught in test, please call unwrap() explicitly";

export interface RedactedUnwrapOptions {
  /** Enforce redaction for this unwrap, whatever the context says. */
  readonly enforcing?: boolean | undefined;
  /** Where the unwrap would be refused, hand out the placeholder instead. */
  readonly redactUnallowedFieldsInsteadOfThrowing?: boolean | undefined;
}

/** The labels both wrappers carry in the open. They are read each time they are used. */
interface Labelled {
  readonly __classification: DataClassification;
  readonly __fieldName: string;
  readonly __privacyMode: PrivacyMode;
}

/** A context as callers may have it: the mode and, when one was made, the enforcement choice. */
function copyOf(context: PrivacyContext): PrivacyContext {
  if (context.enforceRedaction === undefined) return { privacyMode: context.privacyMode };
  return { privacyMode: context.privacyMode, enforceRedaction: context.enforceRedaction };
}

/**
 * Decides one unwrap. True: the real value is handed out. False: the
 * placeholder is. A refusal is thrown when the purpose is not allowed,
 * redaction is enforced, and the caller did not ask for the placeholder.
 *
 * The purpose is judged against the mode the wrapper was made under; whether
 * redaction is enforced is asked of its context as it is now. An unwrap that
 * is not allowed but not enforced goes through, with a line on the console
 * outside a developer's run.
 */
function revealsValue(
  held: Labelled,
  context: PrivacyContext,
  purpose: PrivacyCapability,
  options: RedactedUnwrapOptions | undefined,
): boolean {
  if (allowedPurpose(held.__privacyMode, purpose, held.__classification)) return true;
  const enforced = options?.enforcing || resolveEnforceRedaction(context, held.__classification);
  if (!enforced) {
    if (!DEVELOPERS_RUN) console.error(LET_THROUGH_LINE);
    return true;
  }
  if (options?.redactUnallowedFieldsInsteadOfThrowing) return false;
  throw new Error(
    `Unwrap not allowed for purpose ${purpose} with classification ${held.__classification} and privacy mode ${held.__privacyMode}`,
  );
}

export class RedactedString {
  readonly __classification: DataClassification;
  readonly __fieldName: string;
  /** The mode it was made under. It stays, even if the context changes later. */
  readonly __privacyMode: PrivacyMode;
  /** Whether that mode hides this kind of data, worked out once. */
  readonly __isRedacted: boolean;
  readonly #value: string;
  /** The very context it was given, when it was given one: what is shown and enforced follows it. */
  readonly #context: PrivacyContext;

  constructor(
    value: string,
    classification: DataClassification,
    fieldName: string,
    modeOrContext: PrivacyMode | PrivacyContext,
  ) {
    const context = toPrivacyContext(modeOrContext);
    this.__classification = classification;
    this.__fieldName = fieldName;
    this.__privacyMode = context.privacyMode;
    this.__isRedacted = shouldRedact(context.privacyMode, classification);
    this.#value = value;
    this.#context = context;
  }

  get length(): number {
    return this.#value.length;
  }

  get empty(): boolean {
    return this.#value.length === 0;
  }

  getPrivacyContext(): PrivacyContext {
    return copyOf(this.#context);
  }

  /** The value for a purpose, the field's placeholder, or a refusal: `revealsValue` decides. */
  unwrap(purpose: PrivacyCapability, options?: RedactedUnwrapOptions): string {
    return revealsValue(this, this.#context, purpose, options)
      ? this.#value
      : formatRedacted(this.__fieldName);
  }

  /** Another value under the same labels, its field name marked as a clone's. */
  __clone(newValue: string): RedactedString {
    return new RedactedString(
      newValue,
      this.__classification,
      `${this.__fieldName}.clone`,
      this.#context,
    );
  }

  /** Works on the real value without letting it out: the result is wrapped under the same labels. */
  safeTransform(transform: (value: string) => string): RedactedString {
    return this.#relabel(transform(this.#value));
  }

  /** Another value under exactly the same labels and the same context. */
  #relabel(newValue: string): RedactedString {
    return new RedactedString(newValue, this.__classification, this.__fieldName, this.#context);
  }

  /**
   * What the string shows when it is used as text without being unwrapped:
   * its value, or its placeholder when redaction is enforced and the mode
   * hides it. A developer's run refuses instead of quietly showing a value
   * that would be hidden, and names the way the text was asked for.
   */
  #shown(way: string): string {
    if (this.__isRedacted && !resolveEnforceRedaction(this.#context, this.__classification) && DEVELOPERS_RUN) {
      throw new Error(
        `${IMPLICIT_TEXT_REFUSAL} (field=${this.__fieldName}, classification=${this.__classification}, path=${way})`,
      );
    }
    return getRedactionAwareDisplayValue({
      privacyMode: this.#context.privacyMode,
      classification: this.__classification,
      fieldName: this.__fieldName,
      unredactedValue: this.#value,
      enforceRedaction: this.#context.enforceRedaction,
    });
  }

  toString(): string {
    return this.#shown("toString");
  }

  toJSON(): string {
    return this.#shown("toJSON");
  }

  valueOf(): string {
    return this.#shown("valueOf");
  }

  /** As text when text is wanted or nothing in particular is; never a number. */
  [Symbol.toPrimitive](hint: string): string | number {
    return hint === "string" || hint === "default" ? this.#shown("toPrimitive") : Number.NaN;
  }

  get [Symbol.toStringTag](): string {
    return "RedactedString";
  }

  // Questions about the text. They are answered from the real value, as plain answers.

  startsWith(searchString: string, position?: number): boolean {
    return this.#value.startsWith(searchString, position);
  }

  endsWith(searchString: string, endPosition?: number): boolean {
    return this.#value.endsWith(searchString, endPosition);
  }

  includes(searchString: string, position?: number): boolean {
    return this.#value.includes(searchString, position);
  }

  indexOf(searchString: string, position?: number): number {
    return this.#value.indexOf(searchString, position);
  }

  lastIndexOf(searchString: string, position?: number): number {
    return this.#value.lastIndexOf(searchString, position);
  }

  search(regexp: string | RegExp): number {
    return this.#value.search(regexp);
  }

  localeCompare(that: string, locales?: Intl.LocalesArgument, options?: Intl.CollatorOptions): number {
    return this.#value.localeCompare(that, locales, options);
  }

  // What text can do. Each gives its result as a redacted string under the same labels.

  trim(): RedactedString {
    return this.#relabel(this.#value.trim());
  }

  trimStart(): RedactedString {
    return this.#relabel(this.#value.trimStart());
  }

  trimLeft(): RedactedString {
    return this.#relabel(this.#value.trimStart());
  }

  trimEnd(): RedactedString {
    return this.#relabel(this.#value.trimEnd());
  }

  trimRight(): RedactedString {
    return this.#relabel(this.#value.trimEnd());
  }

  slice(start?: number, end?: number): RedactedString {
    return this.#relabel(this.#value.slice(start, end));
  }

  substring(start: number, end?: number): RedactedString {
    return this.#relabel(this.#value.substring(start, end));
  }

  substr(start: number, length?: number): RedactedString {
    return this.#relabel(this.#value.substr(start, length));
  }

  toLowerCase(): RedactedString {
    return this.#relabel(this.#value.toLowerCase());
  }

  toUpperCase(): RedactedString {
    return this.#relabel(this.#value.toUpperCase());
  }

  toLocaleLowerCase(locales?: Intl.LocalesArgument): RedactedString {
    return this.#relabel(this.#value.toLocaleLowerCase(locales));
  }

  toLocaleUpperCase(locales?: Intl.LocalesArgument): RedactedString {
    return this.#relabel(this.#value.toLocaleUpperCase(locales));
  }

  replace(searchValue: string | RegExp, replaceValue: string): RedactedString {
    return this.#relabel(this.#value.replace(searchValue, replaceValue));
  }

  replaceAll(searchValue: string | RegExp, replaceValue: string): RedactedString {
    return this.#relabel(this.#value.replaceAll(searchValue, replaceValue));
  }

  padStart(maxLength: number, fillString?: string): RedactedString {
    return this.#relabel(this.#value.padStart(maxLength, fillString));
  }

  padEnd(maxLength: number, fillString?: string): RedactedString {
    return this.#relabel(this.#value.padEnd(maxLength, fillString));
  }

  repeat(count: number): RedactedString {
    return this.#relabel(this.#value.repeat(count));
  }

  normalize(form?: "NFC" | "NFD" | "NFKC" | "NFKD"): RedactedString {
    return this.#relabel(this.#value.normalize(form));
  }

  concat(...strings: string[]): RedactedString {
    return this.#relabel(this.#value.concat(...strings));
  }

  charAt(position: number): RedactedString {
    return this.#relabel(this.#value.charAt(position));
  }

  /**
   * The character at a place, counted from the end when the place is
   * negative. Nothing when the place is outside the text or is not a whole
   * number.
   */
  at(index: number): RedactedString | undefined {
    const text = this.#value;
    const place = index < 0 ? text.length + index : index;
    const character = place < 0 || place >= text.length ? undefined : text[place];
    return character === undefined ? undefined : this.#relabel(character);
  }

  split(separator: string | RegExp, limit?: number): RedactedString[] {
    return this.#value.split(separator, limit).map((piece) => this.#relabel(piece));
  }
}

export class RedactedBytes {
  readonly __classification: DataClassification;
  readonly __fieldName: string;
  /** The mode they were made under. It stays, even if the context changes later. */
  readonly __privacyMode: PrivacyMode;
  /** Whether that mode hides this kind of data, worked out once. */
  readonly __isRedacted: boolean;
  readonly #value: Uint8Array;
  /** The very context they were given, when they were given one. */
  readonly #context: PrivacyContext;

  constructor(
    value: Uint8Array,
    classification: DataClassification,
    fieldName: string,
    modeOrContext: PrivacyMode | PrivacyContext,
  ) {
    const context = toPrivacyContext(modeOrContext);
    this.__classification = classification;
    this.__fieldName = fieldName;
    this.__privacyMode = context.privacyMode;
    this.__isRedacted = shouldRedact(context.privacyMode, classification);
    this.#value = value;
    this.#context = context;
  }

  get length(): number {
    return this.#value.length;
  }

  get empty(): boolean {
    return this.#value.length === 0;
  }

  getPrivacyContext(): PrivacyContext {
    return copyOf(this.#context);
  }

  /** The bytes for a purpose, no bytes at all in place of hidden ones, or a refusal: `revealsValue` decides. */
  unwrap(purpose: PrivacyCapability, options?: RedactedUnwrapOptions): Uint8Array {
    return revealsValue(this, this.#context, purpose, options) ? this.#value : new Uint8Array(0);
  }

  /** Other bytes under exactly the same labels: unlike a string's clone, the field name is not marked. */
  __clone(newValue: Uint8Array): RedactedBytes {
    return this.#relabel(newValue);
  }

  /** Works on the real bytes without letting them out: the result is wrapped under the same labels. */
  safeTransform(transform: (value: Uint8Array) => Uint8Array): RedactedBytes {
    return this.#relabel(transform(this.#value));
  }

  #relabel(newValue: Uint8Array): RedactedBytes {
    return new RedactedBytes(newValue, this.__classification, this.__fieldName, this.#context);
  }
}

export function isRedactedString(value: unknown): value is RedactedString {
  return value instanceof RedactedString;
}
