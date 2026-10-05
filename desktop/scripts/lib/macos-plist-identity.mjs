// Info.plist values that still name the shell's maker after packaging
// (29 September 2026). The 0.18.0 shell's main and helper plists can carry a
// copyright line, permission prompts and helper bundle ids in the maker's
// name; the packager sets the keys it knows (package-macos.mjs) and runs this
// over every plist so no string macOS shows a person keeps the old names.
// Only keys a person reads are rewritten; any other key that still names the
// maker is reported, not touched, because it may be a working value (a URL,
// a class name) that a rewrite would break.

// Proper nouns only, case-sensitive, for rewriting: a prompt about "the
// cursor" must not become "the Simeon". Any case, for reporting.
export const PREVIOUS_IDENTITY = /\b(Grok Bot|Grok|Cursor|Anysphere|SpaceXAI|SpaceX|xAI)\b/;
const PREVIOUS_IDENTITY_ANY_CASE = /grok|cursor\.(com|sh)|anysphere|spacex|\bxai\b/i;

const READ_BY_PEOPLE = new Set(["CFBundleName", "CFBundleDisplayName", "CFBundleGetInfoString"]);

/**
 * `{ rewrites, reported }` for one plist: `rewrites` maps each key to its new
 * value; `reported` lists other keys whose value still names the maker.
 * `entries` is the plist's top-level string values; `role` is "main" or
 * "helper".
 */
export function plistIdentityRewrites(entries, { bundleId, name, year = 2026, role = "main" }) {
  const rewrites = {};
  const reported = [];
  const renamed = (value) => value.replace(new RegExp(PREVIOUS_IDENTITY.source, "g"), name);
  for (const [key, value] of Object.entries(entries)) {
    if (typeof value !== "string") continue;
    if (key === "CFBundleIdentifier") {
      if (role !== "helper" || value.startsWith(`${bundleId}.`)) continue;
      const helperAt = value.indexOf(".helper");
      rewrites[key] = `${bundleId}${helperAt >= 0 ? value.slice(helperAt) : ".helper"}`;
      continue;
    }
    const human = key === "NSHumanReadableCopyright" || key.endsWith("UsageDescription") || READ_BY_PEOPLE.has(key);
    if (human && PREVIOUS_IDENTITY.test(value)) {
      rewrites[key] = key === "NSHumanReadableCopyright" ? `Copyright © ${year} SimeonLabs, Inc. All rights reserved.` : renamed(value);
    } else if (PREVIOUS_IDENTITY.test(value) || PREVIOUS_IDENTITY_ANY_CASE.test(value)) {
      reported.push(key);
    }
  }
  return { rewrites, reported };
}
