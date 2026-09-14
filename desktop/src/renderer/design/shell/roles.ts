import type { PresetAgent } from '../../types/agent';

/**
 * The two decisions the roles list makes.
 *
 * Both are here rather than in `Apps.tsx` for the same reason the rest of
 * the shell is split this way: they can be wrong in ways a screenshot
 * does not show, and a test is cheaper than opening the app.
 */

/** Enough of a stored agent to say which roles are already here. */
export interface InstalledAgent {
  id: string;
  source: 'custom' | 'preset';
}

/**
 * Which roles are already agents.
 *
 * An installed role keeps the preset's own id: `presetToCreateRequest`
 * passes `id: preset.id`, and `addPresetAgent` looks the existing one up
 * by that same id before creating anything. So the store answers the
 * question without a second fetch — which is what lets a row say "Added"
 * the instant it is added, rather than after a reload.
 *
 * Agents somebody made by hand are excluded. One of them could be called
 * anything, and an id collision would otherwise mark a role as installed
 * when it is not.
 */
export function installedPresetIds(agents: readonly InstalledAgent[]): ReadonlySet<string> {
  return new Set(agents.filter(one => one.source === 'preset').map(one => one.id));
}

/**
 * The roles a search matches.
 *
 * Name and description, in both languages the preset carries — somebody
 * running the app in Chinese sees Chinese names and would type those.
 * An empty box is not a filter: it shows everybody.
 */
export function matchingRoles(
  roles: readonly PresetAgent[],
  query: string,
): readonly PresetAgent[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return roles;
  return roles.filter(role =>
    role.nameEn.toLowerCase().includes(needle)
    || role.name.toLowerCase().includes(needle)
    || role.descriptionEn.toLowerCase().includes(needle)
    || role.description.toLowerCase().includes(needle));
}
