'use client'

/**
 * Calendar — drawn, and honestly empty. Mail and SharePoint until connected.
 *
 * The design draws all three in full: a mailbox with a draft carrying a
 * tracked change, a week's agenda, a document library with sync status
 * against every file. Two of them are built now — `Mail.tsx` and
 * `SharePoint.tsx` — and both fall back here when nobody has connected an
 * account, because a mailbox screen with no mailbox behind it is
 * furniture. Calendar still needs work that does not exist.
 *
 * **So they say so, and they show nothing.** A mailbox with three invented
 * messages in it, on a product whose entire argument is that the numbers on
 * your screen are real, is worse than a blank panel: it teaches the reader
 * that what they are looking at might be a mock-up, and there is no way to
 * un-teach that on the screen where it matters.
 *
 * What is here instead is the only honest content available — what the
 * screen *will* do, what it needs before it can, and the thing that works
 * today with a way into it. A dead end is a bug; « not yet, and here is
 * where to go meanwhile » is a state.
 *
 * Composed from the empty state the rest of the workspace already uses
 * (`Dense.Nothing`) and the Applications launcher's name-and-description
 * pair, both of which are the design's.
 */

import { colour, size } from '../design'
import type { View } from '../views'

interface Waiting {
  title: string
  /** One line under the heading, in the register the design's own use. */
  line: string
  /** What the screen will be. The design's Applications description. */
  what: string
  /** What it is waiting on, named exactly. */
  needs: string
  /** The thing that does work, and where it is. */
  instead: { text: string; view: View; label: string }
}

export const WAITING: Partial<Record<View, Waiting>> = {
  mail: {
    title: 'Mail',
    line: 'No mailbox connected',
    what: 'Reads the draft you are writing, checks the figures in it against the model, and shows the correction as a tracked change before it is sent.',
    needs:
      'A Microsoft account with a mailbox on it. Connecting one sends you to Microsoft and back; if there is no button here, this server has no Microsoft application configured and only an administrator can add one.',
    instead: {
      text: 'The add-in already runs inside Outlook and reads the deck attached to a draft.',
      view: 'files',
      label: 'Open the data room',
    },
  },
  calendar: {
    title: 'Calendar',
    line: 'No calendar connected',
    what: 'Puts the week beside the deal: when the committee sits, when the deck has to be out, and which of those a drifting figure is about to embarrass.',
    needs:
      'A calendar, through Microsoft Graph. This deal holds no dates of its own — nothing here is being withheld, there is genuinely nothing to draw.',
    instead: {
      text: 'What is dated today is the check: when it last ran, and what it found.',
      view: 'terminal',
      label: 'Open the terminal',
    },
  },
  sharepoint: {
    title: 'SharePoint',
    line: 'No site connected',
    what: 'Watches the deal room where the files actually live, so a model somebody replaces on Tuesday is re-checked without anybody uploading it again.',
    needs:
      'A Microsoft account that can already open the site. Connecting one sends you to Microsoft and back; if there is no button here, this server has no Microsoft application configured and only an administrator can add one.',
    instead: {
      text: 'Files dropped into the data room are read, versioned and checked exactly as a connected one would be.',
      view: 'files',
      label: 'Open the data room',
    },
  },
}

export function Waiting({
  view,
  onGo,
  action,
}: {
  view: View
  onGo: (view: View) => void
  /**
   * The one thing that would end the waiting, when there is one. Today
   * that is « connect Microsoft » on a server that has an application
   * configured: the screen is empty because nobody has connected, which
   * is a different sentence from « this cannot be connected here » and
   * deserves a button rather than a paragraph.
   */
  action?: { label: string; href: string } | null
}) {
  const waiting = WAITING[view]
  if (!waiting) {
    return (
      <div style={{ padding: 26, color: colour.muted, fontSize: size.meta }}>
        Not connected yet.
      </div>
    )
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ flex: '0 0 auto', padding: '24px 26px 18px' }}>
        <div
          style={{
            fontSize: size.title,
            fontWeight: 500,
            color: colour.ink,
            letterSpacing: '-.015em',
          }}
        >
          {waiting.title}
        </div>
        <div style={{ fontSize: 13, color: colour.faint, marginTop: 4 }}>
          {waiting.line}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: '0 26px 26px',
          maxWidth: '62ch',
        }}
      >
        <p
          style={{
            margin: 0,
            paddingTop: 8,
            fontSize: size.meta,
            color: colour.ink,
            lineHeight: 1.7,
          }}
        >
          {waiting.what}
        </p>
        <p
          style={{
            marginTop: 16,
            marginBottom: 0,
            fontSize: size.meta,
            color: colour.muted,
            lineHeight: 1.7,
          }}
        >
          {waiting.needs}
        </p>
        {action && (
          <a
            href={action.href}
            style={{
              display: 'inline-block',
              marginTop: 18,
              padding: '8px 14px',
              borderRadius: 3,
              background: colour.blue,
              color: '#fff',
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            {action.label}
          </a>
        )}
        <div
          style={{
            marginTop: 22,
            paddingTop: 16,
            borderTop: `1px solid ${colour.bandWarm}`,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: size.meta,
              color: colour.muted,
              lineHeight: 1.7,
            }}
          >
            {waiting.instead.text}
          </p>
          <button
            onClick={() => onGo(waiting.instead.view)}
            style={{
              marginTop: 10,
              border: 0,
              background: 'transparent',
              padding: 0,
              font: 'inherit',
              fontSize: 13,
              color: colour.blue,
              cursor: 'pointer',
            }}
          >
            {waiting.instead.label}
          </button>
        </div>
      </div>
    </div>
  )
}
