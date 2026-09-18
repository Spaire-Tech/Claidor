/**
 * OpenAI chat-completions `tools[].function.parameters` must be a JSON Schema
 * object. Hosted proxies (OpenRouter) are lenient; local OpenAI-compatible
 * servers (LM Studio, etc.) reject missing `type: "object"` and often reject
 * zero-argument schemas that omit `properties`.
 *
 * Some providers (including the production token's upstream) also reject
 * top-level `oneOf` / `anyOf` / `allOf` / `enum` / `const` / `not`. Flatten
 * those combinators into one object so the model still sees every field;
 * exclusivity such as credential XOR connectionId is enforced by the executor.
 *
 * Normalize at the adapter boundary so every openai-completions path benefits.
 * Does not invent parameter names — only ensures the required envelope.
 */

export const PROVIDER_FORBIDDEN_TOP_LEVEL_KEYS = [
  "oneOf",
  "anyOf",
  "allOf",
  "enum",
  "const",
  "not",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function topLevelCombinator(schema: Record<string, unknown>) {
  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    return { kind: "allOf" as const, variants: schema.allOf };
  }
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return { kind: "oneOf" as const, variants: schema.oneOf };
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return { kind: "anyOf" as const, variants: schema.anyOf };
  }
  return undefined;
}

/** Merge top-level unions into a single object the provider will accept. */
export function flattenTopLevelToolParameters(parameters: unknown): Record<string, unknown> {
  const schema = isRecord(parameters) ? { ...parameters } : {};
  const combinator = topLevelCombinator(schema);
  if (combinator) {
    const properties: Record<string, unknown> = isRecord(schema.properties)
      ? { ...schema.properties }
      : {};
    let required: string[] | undefined = Array.isArray(schema.required)
      ? schema.required.map(String)
      : undefined;
    let requiredInitialized = required !== undefined;
    let closed = true;
    for (const variant of combinator.variants) {
      const branch = flattenTopLevelToolParameters(variant);
      if (isRecord(branch.properties)) {
        for (const [key, spec] of Object.entries(branch.properties)) {
          properties[key] ??= spec;
        }
      }
      const branchRequired = Array.isArray(branch.required) ? branch.required.map(String) : [];
      if (combinator.kind === "allOf") {
        required = [...new Set([...(required ?? []), ...branchRequired])];
        requiredInitialized = true;
      } else if (!requiredInitialized) {
        required = branchRequired;
        requiredInitialized = true;
      } else {
        required = (required ?? []).filter((key) => branchRequired.includes(key));
      }
      if (branch.additionalProperties !== false) closed = false;
    }
    const flattened: Record<string, unknown> = { type: "object", properties };
    if (required && required.length > 0) flattened.required = required;
    if (closed) flattened.additionalProperties = false;
    if (typeof schema.description === "string") flattened.description = schema.description;
    return flattened;
  }

  const flattened: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if ((PROVIDER_FORBIDDEN_TOP_LEVEL_KEYS as readonly string[]).includes(key)) continue;
    flattened[key] = value;
  }
  return flattened;
}

export function normalizeOpenAiToolParameters(parameters: unknown): Record<string, unknown> {
  const schema = flattenTopLevelToolParameters(parameters);
  const properties =
    schema.properties != null &&
    typeof schema.properties === "object" &&
    !Array.isArray(schema.properties)
      ? schema.properties
      : {};
  return { ...schema, type: "object", properties };
}

/** True when a schema would fail stricter OpenAI-compatible tool validators. */
export function openAiToolParametersNeedNormalization(parameters: unknown): boolean {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return true;
  const schema = parameters as Record<string, unknown>;
  if (schema.type !== "object") return true;
  if (PROVIDER_FORBIDDEN_TOP_LEVEL_KEYS.some((key) => key in schema)) return true;
  return (
    schema.properties == null ||
    typeof schema.properties !== "object" ||
    Array.isArray(schema.properties)
  );
}
