'use client'

// Right-side panel: SendOptions by default, or per-block ContextPanel
// (image, button, divider) when something selected.

import { schemas } from '@spaire/client'

import { ColorPicker } from './ColorPicker'
import { Icon, type IconName } from './Icon'
import { CROP_LABEL, CROP_SEQ, type Block, type SendOptionsState } from './types'


function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      className={'c-toggle' + (on ? ' on' : '')}
      onClick={onClick}
      aria-pressed={on}
    ></button>
  )
}

// ---------------------------------------------------------------------------
// Send Options
// ---------------------------------------------------------------------------

export function SendOptions({
  organization,
  senderEmail,
  senderName,
  senderAvatarUrl,
  so,
  setSo,
  onTouch,
  onTest,
  sequence,
}: {
  organization: schemas['Organization']
  senderEmail: string
  senderName: string
  senderAvatarUrl: string | null | undefined
  so: SendOptionsState
  setSo: (next: SendOptionsState) => void
  onTouch?: () => void
  onTest: () => void
  /** Automation-sequence email: no Schedule send (the sequence's timing
      controls when it goes out) and no "Send a test" (no broadcast). */
  sequence?: boolean
}) {
  const set = (patch: Partial<SendOptionsState>) => {
    setSo({ ...so, ...patch })
    onTouch?.()
  }

  // Initials are a fallback when there's no avatar; based on the
  // sender's name so it matches who's actually sending.
  const initials = (senderName || organization.name)
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="sopts">
      <h2>{sequence ? 'Email settings' : 'Broadcast settings'}</h2>

      <div className="st-group">
        <h3>Sender</h3>
        <div className="acct">
          <span className="av">
            {senderAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={senderAvatarUrl} alt={senderName} />
            ) : (
              initials || 'S'
            )}
          </span>
          <span className="who">
            <b>{senderName || organization.name}</b>
            <span>{senderEmail || 'org default sender'}</span>
          </span>
        </div>
        <label className="mini-label">Replies go to</label>
        <select
          className="mini-select tight"
          value={so.replyTo}
          onChange={(e) =>
            set({ replyTo: e.target.value as SendOptionsState['replyTo'] })
          }
        >
          <option value="self">{senderEmail || 'org default sender'}</option>
          <option value="support">support@{organization.slug}.com</option>
          <option value="noreply">Don&apos;t accept replies</option>
        </select>
      </div>

      <div className="st-divider"></div>

      {!sequence && (
        <>
          <div className="opt-row" style={{ borderTop: 'none' }}>
            <span className="oic">
              <Icon name="clock" size={21} />
            </span>
            <span className="ot">
              <b>Schedule send</b>
              <p>Pick the day and time it goes out</p>
            </span>
            <Toggle
              on={so.schedule}
              onClick={() => set({ schedule: !so.schedule })}
            />
          </div>
          {so.schedule && (
            <div className="opt-expand">
              <div className="sched" style={{ marginTop: 0 }}>
                <div className="sched-f">
                  <label>Date</label>
                  <input
                    type="date"
                    value={so.date}
                    onChange={(e) => set({ date: e.target.value })}
                  />
                </div>
                <div className="sched-f">
                  <label>Time</label>
                  <input
                    type="time"
                    value={so.time}
                    onChange={(e) => set({ time: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="opt-row" style={sequence ? { borderTop: 'none' } : undefined}>
        <span className="oic">
          <Icon name="shield" size={21} />
        </span>
        <span className="ot">
          <b>Track opens &amp; clicks</b>
          <p>Measure your open and click-through rates</p>
        </span>
        <Toggle on={so.tracking} onClick={() => set({ tracking: !so.tracking })} />
      </div>

      <div className="opt-row">
        <span className="oic">
          <Icon name="globe" size={21} />
        </span>
        <span className="ot">
          <b>Add &quot;View in browser&quot;</b>
          <p>Let readers open a web version of this email</p>
        </span>
        <Toggle
          on={so.webVersion}
          onClick={() => set({ webVersion: !so.webVersion })}
        />
      </div>

      {!sequence && (
        <>
          <div className="st-divider"></div>
          <button className="test-btn" onClick={onTest}>
            <Icon name="flask" size={19} /> Send a test to myself
          </button>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Block context panels
// ---------------------------------------------------------------------------

function PanelHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="ctx-head">
      <button className="ctx-back" onClick={onClose}>
        <Icon name="back" size={20} />
      </button>
      <h3>{title}</h3>
    </div>
  )
}

function AlignSeg({
  value,
  set,
  opts,
}: {
  value: string | undefined
  set: (k: string) => void
  opts: { k: string; ic: IconName }[]
}) {
  return (
    <div className="seg">
      {opts.map((o) => (
        <button
          key={o.k}
          className={(value || opts[0].k) === o.k ? 'on' : ''}
          onClick={() => set(o.k)}
        >
          <Icon name={o.ic} size={18} />
        </button>
      ))}
    </div>
  )
}

function ImagePanel({
  b,
  update,
  onDelete,
  onClose,
  pickImage,
  toast,
}: {
  b: Extract<Block, { type: 'image' }>
  update: (id: string, patch: Partial<Block>) => void
  onDelete: (id: string) => void
  onClose: () => void
  pickImage: () => void
  toast: (msg: string) => void
}) {
  const cropNext = () => {
    const i = CROP_SEQ.indexOf(b.crop || 'orig')
    const next = CROP_SEQ[(i + 1) % CROP_SEQ.length]
    update(b.id, { crop: next } as Partial<Block>)
    toast('Crop: ' + CROP_LABEL[next])
  }
  return (
    <div className="ctx">
      <PanelHead title="Edit image" onClose={onClose} />
      <div className="ctx-field">
        <label>Alignment</label>
        <AlignSeg
          value={b.align}
          set={(k) => update(b.id, { align: k as 'left' | 'center' | 'full' } as Partial<Block>)}
          opts={[
            { k: 'left', ic: 'alignLeft' },
            { k: 'center', ic: 'alignCenter' },
            { k: 'full', ic: 'alignFull' },
          ]}
        />
      </div>
      <div className="ctx-divider"></div>
      <div className="ctx-field">
        <label>Caption</label>
        <div className="ctx-input">
          <input
            maxLength={140}
            value={b.caption || ''}
            placeholder="Write a caption…"
            onChange={(e) =>
              update(b.id, { caption: e.target.value } as Partial<Block>)
            }
          />
          <span className="ctx-count">{(b.caption || '').length} / 140</span>
        </div>
      </div>
      <div className="ctx-field">
        <label>Alt text</label>
        <div className="ctx-input">
          <textarea
            rows={2}
            maxLength={2000}
            value={b.alt || ''}
            placeholder="Describe this image…"
            onChange={(e) =>
              update(b.id, { alt: e.target.value } as Partial<Block>)
            }
          />
        </div>
        <div className="ctx-hint">
          Alt text helps recipients using screen readers.
        </div>
      </div>
      {b.linkEdit && (
        <div className="ctx-field">
          <label>Image link</label>
          <div className="ctx-input">
            <input
              autoFocus
              value={b.link || ''}
              placeholder="https://…"
              onChange={(e) =>
                update(b.id, { link: e.target.value } as Partial<Block>)
              }
            />
          </div>
        </div>
      )}
      <div className="ctx-divider"></div>
      <div className="ctx-actions">
        <button className="ctx-act" onClick={cropNext}>
          <Icon name="crop" size={18} /> Crop
          {b.crop && b.crop !== 'orig' ? ' · ' + CROP_LABEL[b.crop] : ''}
        </button>
        <button
          className={'ctx-act' + (b.linkEdit ? ' on' : '')}
          onClick={() => update(b.id, { linkEdit: !b.linkEdit } as Partial<Block>)}
        >
          <Icon name="link" size={18} /> {b.link ? 'Edit link' : 'Add link'}
        </button>
        <button className="ctx-act" onClick={pickImage}>
          <Icon name="replace" size={18} /> Replace
        </button>
        <button className="ctx-act danger" onClick={() => onDelete(b.id)}>
          <Icon name="trash" size={18} /> Delete
        </button>
      </div>
    </div>
  )
}

function ButtonPanel({
  b,
  update,
  onDelete,
  onClose,
}: {
  b: Extract<Block, { type: 'button' }>
  update: (id: string, patch: Partial<Block>) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  return (
    <div className="ctx">
      <PanelHead title="Edit button" onClose={onClose} />
      <div className="ctx-field">
        <label>Button text</label>
        <div className="ctx-input">
          <input
            value={b.text || ''}
            placeholder="View the doc"
            onChange={(e) =>
              update(b.id, { text: e.target.value } as Partial<Block>)
            }
          />
        </div>
      </div>
      <div className="ctx-field">
        <label>Button link</label>
        <div className="ctx-input">
          <input
            value={b.link || ''}
            placeholder="https://…"
            onChange={(e) =>
              update(b.id, { link: e.target.value } as Partial<Block>)
            }
          />
        </div>
      </div>
      <div className="ctx-field">
        <label>Alignment</label>
        <AlignSeg
          value={b.align}
          set={(k) => update(b.id, { align: k as 'left' | 'center' | 'right' } as Partial<Block>)}
          opts={[
            { k: 'left', ic: 'alignLeft' },
            { k: 'center', ic: 'alignCenter' },
            { k: 'right', ic: 'alignRight' },
          ]}
        />
      </div>
      <div className="ctx-divider"></div>
      <div className="ctx-field">
        <label>Button colour</label>
        <ColorPicker
          value={b.bg || '#000000'}
          onChange={(c) => update(b.id, { bg: c } as Partial<Block>)}
        />
      </div>
      <div className="ctx-field">
        <label>Text colour</label>
        <ColorPicker
          value={b.color || '#ffffff'}
          onChange={(c) => update(b.id, { color: c } as Partial<Block>)}
        />
      </div>
      <div className="ctx-divider"></div>
      <div className="ctx-actions">
        <button className="ctx-act danger" onClick={() => onDelete(b.id)}>
          <Icon name="trash" size={18} /> Delete
        </button>
      </div>
    </div>
  )
}

function GenericPanel({
  b,
  onDelete,
  onClose,
  title,
}: {
  b: Block
  onDelete: (id: string) => void
  onClose: () => void
  title?: string
}) {
  return (
    <div className="ctx">
      <PanelHead title={title || 'Edit block'} onClose={onClose} />
      <div className="ctx-actions">
        <button className="ctx-act danger" onClick={() => onDelete(b.id)}>
          <Icon name="trash" size={18} /> Delete
        </button>
      </div>
    </div>
  )
}

export function ContextPanel(props: {
  b: Block
  update: (id: string, patch: Partial<Block>) => void
  onDelete: (id: string) => void
  onClose: () => void
  pickImage: () => void
  toast: (msg: string) => void
}) {
  const t = props.b.type
  if (t === 'image')
    return (
      <ImagePanel
        {...props}
        b={props.b as Extract<Block, { type: 'image' }>}
      />
    )
  if (t === 'button')
    return (
      <ButtonPanel
        {...props}
        b={props.b as Extract<Block, { type: 'button' }>}
      />
    )
  if (t === 'divider')
    return <GenericPanel {...props} title="Edit divider" />
  return <GenericPanel {...props} />
}
