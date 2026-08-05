import { CSSProperties } from 'react'
import { BlockEditor, ImageUploader } from './BlockEditor'
import { ContentDoc } from './types'
import { useDocHistory } from './useDocHistory'

const ACCENT_SWATCHES = [
  '#1d1d1f',
  '#2997ff',
  '#0066CC',
  '#1A7A3E',
  '#D6336C',
  '#FF6B35',
]

type Sender = { name: string; email: string }

/**
 * Broadcast workflow shell around the block-canvas.
 *
 * Drop-in replacement for the legacy `Composer`: same prop API, same
 * embedded-mode behaviour. Owns the subject / preview / from chrome and the
 * accent swatches; delegates the canvas to BlockEditor.
 */
export const BroadcastEditor = ({
  doc,
  setDoc,
  uploadImage,
  sender,
  embedded,
  subject,
  onSubjectChange,
  previewText,
  onPreviewTextChange,
  saveStatus,
}: {
  doc: ContentDoc
  setDoc: (next: ContentDoc) => void
  uploadImage?: ImageUploader
  sender?: Sender
  embedded?: boolean
  subject?: string
  onSubjectChange?: (next: string) => void
  previewText?: string
  onPreviewTextChange?: (next: string) => void
  /** Visible save indicator wired to the editor's autosave hook. */
  saveStatus?: 'saved' | 'saving' | 'error' | 'idle'
}) => {
  // Wrap setDoc with undo/redo. Cmd+Z anywhere on the page navigates the
  // history; coalescing in the hook means rapid keystrokes collapse to one
  // step rather than 30.
  const history = useDocHistory(doc, setDoc)
  const setDocWithHistory = history.set

  const accent = doc.accent ?? '#1d1d1f'
  const setAccent = (c: string) =>
    setDocWithHistory({ ...doc, accent: c })

  const showHeader = !embedded
  const showSubjectStrip =
    onSubjectChange !== undefined || onPreviewTextChange !== undefined

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      {showHeader && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 18,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {sender && (
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                From <strong style={{ color: 'var(--ink)' }}>{sender.name}</strong>
                {sender.email ? ` · ${sender.email}` : ''}
              </div>
            )}
            {saveStatus && saveStatus !== 'idle' && (
              <SaveIndicator status={saveStatus} />
            )}
          </div>
          <AccentPicker accent={accent} setAccent={setAccent} />
        </div>
      )}

      {showSubjectStrip && (
        <div
          style={{
            background: '#fff',
            border: '1px solid var(--line)',
            borderRadius: 10,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {onSubjectChange !== undefined && (
            <SubjectInput
              value={subject ?? ''}
              onChange={onSubjectChange}
              placeholder="Subject line…"
              fontSize={16}
              fontWeight={600}
            />
          )}
          {onPreviewTextChange !== undefined && (
            <SubjectInput
              value={previewText ?? ''}
              onChange={onPreviewTextChange}
              placeholder="Preview text — appears in the inbox after the subject."
              fontSize={13}
              fontWeight={400}
              color="var(--ink-3)"
            />
          )}
        </div>
      )}

      <BlockEditor
        doc={doc}
        setDoc={setDocWithHistory}
        uploadImage={uploadImage}
      />

      {showHeader && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            fontSize: 11,
            color: 'var(--ink-4)',
          }}
        >
          <span>
            {history.canUndo
              ? '⌘Z to undo · ⇧⌘Z to redo'
              : 'Make any change to start history'}
          </span>
        </div>
      )}
    </div>
  )
}

const SubjectInput = ({
  value,
  onChange,
  placeholder,
  fontSize,
  fontWeight,
  color,
}: {
  value: string
  onChange: (next: string) => void
  placeholder: string
  fontSize: number
  fontWeight: number
  color?: string
}) => (
  <input
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    style={{
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontSize,
      fontWeight,
      color: color ?? 'var(--ink)',
      padding: 0,
    }}
  />
)

const AccentPicker = ({
  accent,
  setAccent,
}: {
  accent: string
  setAccent: (c: string) => void
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 11,
      color: 'var(--ink-3)',
    }}
  >
    <span>Accent</span>
    {ACCENT_SWATCHES.map((c) => {
      const swatchStyle: CSSProperties = {
        width: 18,
        height: 18,
        borderRadius: 18,
        background: c,
        cursor: 'pointer',
        border: c === accent ? '2px solid var(--ink)' : '1px solid var(--line-2)',
      }
      return (
        <button
          key={c}
          type="button"
          onClick={() => setAccent(c)}
          aria-label={`Use accent ${c}`}
          aria-pressed={c === accent}
          style={swatchStyle}
        />
      )
    })}
  </div>
)

const SaveIndicator = ({
  status,
}: {
  status: 'saved' | 'saving' | 'error' | 'idle'
}) => {
  const text =
    status === 'saving'
      ? 'Saving…'
      : status === 'saved'
        ? 'Saved'
        : status === 'error'
          ? 'Save failed — retrying'
          : ''
  const color =
    status === 'error'
      ? 'var(--red)'
      : status === 'saving'
        ? 'var(--ink-4)'
        : 'var(--green)'
  return (
    <span style={{ fontSize: 11.5, color, fontWeight: 500 }}>{text}</span>
  )
}
