'use client'

// Inbox preview (desktop / mobile). Uses real BlockBody read-only render.

import { schemas } from '@spaire/client'

import { BlockBody } from './blocks'
import { Icon } from './Icon'
import type { Attachment, Block } from './types'

export function EmailPreview({
  organization,
  senderEmail,
  senderName,
  senderAvatarUrl,
  subject,
  blocks,
  attachments,
  webVersion,
  device,
}: {
  organization: schemas['Organization']
  senderEmail: string
  senderName: string
  senderAvatarUrl: string | null | undefined
  subject: string
  blocks: Block[]
  attachments: Attachment[]
  webVersion: boolean
  device: 'desktop' | 'mobile'
}) {
  const displayName = senderName || organization.name
  const initials = displayName
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="preview-stage">
      <div className={'screen ' + device}>
        <div className="screen-inner">
          <div className="pv-mailhead">
            <h1 className="pv-subject">{subject || '(no subject)'}</h1>
            <div className="pv-sender">
              <span className="av">
                {senderAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={senderAvatarUrl} alt={displayName} />
                ) : (
                  initials || 'S'
                )}
              </span>
              <div className="sm">
                <div className="l1">
                  <b>{displayName}</b>
                  <span className="em">
                    &lt;{senderEmail || `noreply@${organization.slug}.com`}&gt;
                  </span>
                </div>
                <div className="to">To: you</div>
              </div>
              <span className="when">10:42 AM</span>
              <div className="pvact">
                <button title="Reply">
                  <Icon name="reply" size={18} />
                </button>
                <button title="Star">
                  <Icon name="star" size={18} />
                </button>
                <button title="More">
                  <Icon name="dots" size={18} />
                </button>
              </div>
            </div>
          </div>
          <div className="pv-mailbody">
            {blocks.map((b) => (
              <BlockBody key={b.id} b={b} readOnly />
            ))}
            <div className="pv-foot">
              You&apos;re receiving this because you subscribed to {organization.name} on Spaire.
              <br />
              <a href="#">Unsubscribe</a>
              {webVersion && (
                <span>
                  {' '}
                  · <a href="#">View in browser</a>
                </span>
              )}{' '}
              · <a href="#">Update preferences</a>
            </div>
          </div>
          {attachments.length > 0 && (
            <div className="pv-att">
              {attachments.map((f, i) => (
                <div className="atile" key={i}>
                  <span className="fi">
                    <Icon name="file" size={20} />
                  </span>
                  <span className="meta">
                    <b>{f.name}</b>
                    <span>{f.size}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
