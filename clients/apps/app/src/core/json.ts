// JSON as the shared core reads it (ios/SimeonCore/Sources/SimeonCore/JSON.swift):
// plain values, and accessors that answer undefined for the wrong kind.

export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [key: string]: JSONValue }

export type JSONObject = { [key: string]: JSONValue }

/** The value parsed, or undefined when it is not JSON. */
export function parseJSON(text: string): JSONValue | undefined {
  if (text.trim() === '') return undefined
  try {
    return JSON.parse(text) as JSONValue
  } catch {
    return undefined
  }
}

export function isObject(value: unknown): value is JSONObject {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

/** One field of an object; undefined for anything else (`json["key"]`). */
export function field(value: unknown, key: string): JSONValue | undefined {
  return isObject(value) ? value[key] : undefined
}

/** A string (`.string`). */
export function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** A string that is not empty (`.text`). */
export function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** A number (`.double`). */
export function num(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

/** A whole number, a finite number rounded (`.int`). */
export function int(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value)
    : undefined
}

/** A boolean (`.bool`). */
export function bool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

/** An array (`.array`). */
export function arr(value: unknown): JSONValue[] | undefined {
  return Array.isArray(value) ? (value as JSONValue[]) : undefined
}
