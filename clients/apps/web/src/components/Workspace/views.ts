/**
 * The views the workspace has, and what each one is called on screen.
 *
 * One list, because three things need to agree and drift apart the moment
 * they are written down separately: the dock, the Applications launcher,
 * and the label in the tab chip at the top of the panel.
 */

export type View =
  | 'chat'
  | 'files'
  | 'mail'
  | 'calendar'
  | 'docs'
  | 'sheets'
  | 'deck'
  | 'sharepoint'
  | 'projects'
  | 'checks'
  | 'confirm'
  | 'trace'
  | 'library'
  | 'terminal'
  | 'applications'

/** Which Office file a view is about, for the icon in the tab chip. */
export type Host = 'ppt' | 'xls' | 'doc' | 'mail' | null

export interface ViewMeta {
  /** The pill at the top-left of the panel. */
  tab: string
  /** The quiet line at the top-right. Empty when there is nothing to say. */
  meta?: string
  host?: Host
}

/**
 * The Applications launcher, in the design's own words.
 *
 * Eight, not fourteen: `chat`, `calendar`, `terminal` and the launcher
 * itself are places rather than applications, and the design does not
 * list them here.
 */
export const APPLICATIONS: { view: View; name: string; desc: string }[] = [
  {
    view: 'checks',
    name: 'Checks',
    desc: 'Run and review consistency checks across a deal.',
  },
  {
    view: 'trace',
    name: 'Chain',
    desc: 'Trace a figure from deliverable to source.',
  },
  {
    view: 'confirm',
    name: 'Confirm',
    desc: 'Settle what each figure refers to, once.',
  },
  {
    view: 'deck',
    name: 'Pitchbook',
    desc: 'Reconcile a deck against the model.',
  },
  { view: 'docs', name: 'Docs', desc: 'Drafting and tracked changes in Word.' },
  {
    view: 'sheets',
    name: 'Sheets',
    desc: 'Model audit and cell-level reconciliation.',
  },
  {
    view: 'mail',
    name: 'Mail',
    desc: 'House-style drafting, checked before sending.',
  },
  {
    view: 'sharepoint',
    name: 'SharePoint',
    desc: 'Connected sources and sync status.',
  },
  {
    view: 'library',
    name: 'Library',
    desc: 'Every published figure and its source.',
  },
]
