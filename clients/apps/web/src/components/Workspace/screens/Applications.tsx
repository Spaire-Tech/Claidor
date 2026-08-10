'use client'

/**
 * The launcher. Eight cards, four columns, nothing else on the screen.
 */

import { colour, size } from '../design'
import { APPLICATIONS, type View } from '../views'

export function Applications({ onGo }: { onGo: (view: View) => void }) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 26 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
          gap: 12,
        }}
      >
        {APPLICATIONS.map((app) => (
          <button
            key={app.view}
            onClick={() => onGo(app.view)}
            style={{
              textAlign: 'left',
              border: '1px solid rgba(255,255,255,.6)',
              background: 'rgba(255,255,255,.55)',
              borderRadius: 16,
              padding: 16,
              font: 'inherit',
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(18,24,40,.06)',
            }}
          >
            <span style={{ display: 'block', fontWeight: 500 }}>{app.name}</span>
            <span
              style={{
                display: 'block',
                fontSize: 13,
                color: colour.muted,
                marginTop: 4,
                lineHeight: 1.5,
              }}
            >
              {app.desc}
            </span>
          </button>
        ))}
      </div>
      <div style={{ fontSize: size.small, color: colour.fainter, marginTop: 26 }} />
    </div>
  )
}
