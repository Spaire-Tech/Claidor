import { SETTINGS_TABS, settingsFor, type SettingsInput } from '../settings/rows';

/**
 * The two links the agent can write that point back into this app.
 *
 * Everything else in a message points outward — a file on the disk, a page
 * on the web. These two point inward: *this setting*, and *what you said
 * earlier*. Both come from `grok-bot-chat.md` §9, where they are
 * `grokbot://app/v1/settings?id=…` and `sand-msg:…`.
 *
 * They are ordinary markdown links with our own scheme, so the message
 * parser needs no new syntax and a build that does not understand them
 * still shows the label rather than punctuation.
 *
 * **A pill only renders when the thing exists.** A settings pill naming a
 * row this build does not have would be the fabrication problem with a
 * nicer shape — a person clicks it, nothing happens, and they no longer
 * trust the next one. `isSettingsAnchor` is checked against the same
 * `settingsFor()` that draws the screen and writes
 * `reference/app-ui.md`, so the three cannot disagree.
 */

export const APP_LINK_SCHEME = 'faiser:';

export const AppLinkKind = {
  /** A row in Settings, by its anchor id. */
  Settings: 'settings',
  /** An earlier message in this conversation, by its id. */
  Message: 'message',
} as const;
export type AppLinkKind = typeof AppLinkKind[keyof typeof AppLinkKind];

export interface AppLink {
  kind: AppLinkKind;
  /** A settings row id, or a message id. */
  id: string;
}

/** `faiser://settings/exec-policy` → `{ kind: 'settings', id: 'exec-policy' }`. */
export function parseAppLink(target: string): AppLink | undefined {
  const match = /^faiser:\/\/(settings|message)\/([A-Za-z0-9_-]+)$/.exec(target.trim());
  if (!match) return undefined;
  return { kind: match[1] as AppLinkKind, id: match[2] };
}

export function appLink(kind: AppLinkKind, id: string): string {
  return `${APP_LINK_SCHEME}//${kind}/${id}`;
}

/** Every settings row id this build can draw, whether or not it is showing. */
export function settingsAnchors(): readonly string[] {
  const seen = new Set<string>();
  for (const tab of SETTINGS_TABS) {
    for (const group of settingsFor(tab, ANCHOR_PROBE)) {
      for (const row of group.rows) seen.add(row.id);
    }
  }
  return [...seen];
}

export function isSettingsAnchor(id: string): boolean {
  return settingsAnchors().includes(id);
}

const noop = (): void => { /* nothing is pressed while listing anchors */ };

/**
 * A person with every conditional row switched on, so the anchor list is
 * every row the app *can* draw rather than every row it happens to be
 * drawing. A pill for the working folder should still resolve on a
 * machine that has not opened a conversation yet.
 */
const ANCHOR_PROBE: SettingsInput = {
  accountName: '-',
  computerName: '-',
  workingDirectory: '-',
  execPolicy: 'ask',
  memoryEnabled: true,
  modelChoice: 'openai',
  modelApiKey: '',
  usage: { fraction: 0, value: '-', desc: '-' },
  version: '-',
  onSignOut: noop,
  onAddAccount: noop,
  onExecPolicy: noop,
  onMemory: noop,
  onModelChoice: noop,
  onModelApiKey: noop,
  onWorkingDirectory: noop,
  onRefreshUsage: noop,
  onCheckUpdates: noop,
};
