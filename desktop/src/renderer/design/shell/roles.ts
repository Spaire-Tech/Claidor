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

/**
 * The five tabs on a role's page, and what each says under its name.
 *
 * The canvas's, verbatim — including the notes, which are the half that
 * makes the rail readable rather than a list of nouns:
 *
 *     ["Instructions", "How this agent works"],
 *     ["Memories",     "Facts it already knows"],
 *     ["Skills",       "Playbooks it can run"],
 *     ["Routines",     "Jobs that run on their own"],
 *     ["Integrations", "Connectors it can use"]
 *
 * I once wrote in the review that these five tabs "do not appear anywhere
 * in the canvas". They do, exactly, with these notes. What I had wrong
 * was where they live: inside Apps, behind a role's card, and not behind
 * the agent's name in the conversation header.
 */
export const AGENT_TABS = [
  { id: 'Instructions', note: 'How this agent works' },
  { id: 'Memories', note: 'Facts it already knows' },
  { id: 'Skills', note: 'Playbooks it can run' },
  { id: 'Routines', note: 'Jobs that run on their own' },
  { id: 'Integrations', note: 'Connectors it can use' },
] as const;

export type AgentTab = typeof AGENT_TABS[number]['id'];

/**
 * The line under a role's name on its own page.
 *
 * The canvas's shape — `"5 skills · Official · by Swens"` — with the
 * product name taken out, because the product has no name yet
 * (`direction.md`) and shipping one in a string is how a placeholder
 * becomes a brand.
 */
export function roleMeta(role: PresetAgent): string {
  const parts: string[] = [];
  if (role.skillIds.length) {
    parts.push(`${role.skillIds.length} ${role.skillIds.length === 1 ? 'skill' : 'skills'}`);
  }
  parts.push('Official');
  return parts.join(' · ');
}

/**
 * What a role's page says on each tab.
 *
 * The canvas's `agentBody`, which writes these from the role's own name
 * and skill count rather than storing five paragraphs per agent. A
 * catalogue page describes what the agent will be; what it actually
 * remembers and runs belongs to the installed agent, not the listing.
 */
export function agentBody(role: PresetAgent, tab: AgentTab): string {
  const name = role.nameEn;
  switch (tab) {
    case 'Memories':
      return `Nothing yet. ${name} keeps what you tell it — team names, where files live, `
        + 'how you like things written — and uses it without being reminded.';
    case 'Skills':
      return `${name} ships with ${role.skillIds.length} `
        + `${role.skillIds.length === 1 ? 'playbook' : 'playbooks'} for this role. Each one is a `
        + 'saved recipe: what to look at, which steps to take, and what finished looks like.';
    case 'Routines':
      return `No routines yet. Give ${name} a standing job — a weekly summary, a morning `
        + 'check — and it runs on its own and reports back here.';
    case 'Integrations':
      return `${name} uses whichever connectors you've linked under Plugins. Where there's `
        + 'no connector it falls back to your computer and browser, with your approval each time.';
    default:
      return role.descriptionEn;
  }
}
