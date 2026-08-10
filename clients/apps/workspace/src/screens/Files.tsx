/**
 * Data room — the files in the deal.
 *
 * A row is an icon, a name and a date. Nothing else: the count lives in
 * the line under the heading, and a file that failed to read says so where
 * its date would be, because that is the one thing a person has to act on.
 */

import type { Artifact } from '../api'
import { colour, size } from '../design'

const ICON: Record<string, string> = {
  '.pptx': '/icons/powerpoint.webp',
  '.pptm': '/icons/powerpoint.webp',
  '.xlsx': '/icons/excel.webp',
  '.xlsm': '/icons/excel.webp',
  '.xls': '/icons/excel.webp',
  '.docx': '/icons/word.webp',
  '.doc': '/icons/word.webp',
  '.msg': '/icons/outlook.webp',
  '.pdf': '/icons/word.webp',
}

function iconFor(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return ICON[filename.slice(dot).toLowerCase()] ?? '/icons/word.webp'
}

const MONTH = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')

function shortDate(iso: string): string {
  const at = new Date(iso)
  return `${at.getDate()} ${MONTH[at.getMonth()]}`
}

export function Files({
  artifacts,
  deal,
  onOpen,
}: {
  artifacts: Artifact[]
  deal: string
  onOpen: (artifact: Artifact) => void
}) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: '0 0 auto', padding: '24px 26px 18px' }}>
        <div
          style={{
            fontSize: size.title,
            fontWeight: 500,
            color: colour.ink,
            letterSpacing: '-.015em',
          }}
        >
          Data room
        </div>
        <div style={{ fontSize: 13, color: colour.faint, marginTop: 4 }}>
          {deal} · {artifacts.length} {artifacts.length === 1 ? 'file' : 'files'}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 12px 20px' }}>
        {artifacts.length === 0 && (
          <div style={{ fontSize: size.meta, color: colour.faint, padding: '0 14px' }}>
            Nothing here yet. Drop in a model and a deck and the checks can run.
          </div>
        )}

        {artifacts.map((artifact) => (
          <button
            key={artifact.id}
            onClick={() => onOpen(artifact)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              width: '100%',
              border: 0,
              background: 'transparent',
              borderRadius: 8,
              padding: '12px 14px',
              font: 'inherit',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <img
              src={iconFor(artifact.filename)}
              alt=""
              style={{ width: 18, height: 18, objectFit: 'contain', flex: '0 0 18px' }}
            />
            <span
              style={{
                flex: '1 1 auto',
                minWidth: 60,
                fontSize: 14,
                color: colour.ink,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {artifact.filename}
            </span>
            <span
              style={{
                flex: '0 0 auto',
                fontSize: size.small,
                color: artifact.status === 'failed' ? colour.critical : colour.fainter,
              }}
            >
              {artifact.status === 'failed'
                ? 'could not be read'
                : artifact.status === 'processing'
                  ? 'reading…'
                  : shortDate(artifact.uploaded_at)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
