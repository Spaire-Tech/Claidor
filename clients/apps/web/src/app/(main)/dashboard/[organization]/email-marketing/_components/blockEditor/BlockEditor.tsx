import { CSSProperties, useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { EditableText } from './EditableText'
import {
  BadgeBlock,
  Block,
  BlockId,
  BlockType,
  ButtonBlock,
  ChecklistBlock,
  ChecklistBlockItem,
  ColumnsBlock,
  ColumnsBlockColumn,
  ContentDoc,
  DigestItemBlock,
  EventCardBlock,
  EyebrowBlock,
  HeadingBlock,
  ImageBlock,
  ListBlock,
  ListItem,
  ParagraphBlock,
  QuoteBlock,
  ReceiptBlock,
  ReceiptBlockItem,
  SubheadingBlock,
  VideoBlock,
  blankBlock,
  blockLibrary,
  newId,
} from './types'

export type ImageUploader = (file: File) => Promise<string>

type DropPosition = 'above' | 'below'

/**
 * Type-safe per-block patcher. Generic preserves the discriminant: a patch
 * for a HeadingBlock cannot accidentally land on a ParagraphBlock.
 */
type BlockPatcher = <T extends Block>(id: BlockId, patch: Partial<T>) => void

/**
 * Deep clone via structuredClone (stable in modern browsers). Falls back to
 * JSON for environments without it (older test runners). Avoids the prior
 * bug where duplicating a block aliased nested arrays back to the original.
 */
function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as T
}

export const BlockEditor = ({
  doc,
  setDoc,
  uploadImage,
  showInspector = true,
  accent: accentOverride,
}: {
  doc: ContentDoc
  setDoc: (next: ContentDoc) => void
  uploadImage?: ImageUploader
  showInspector?: boolean
  accent?: string
}) => {
  const [selectedId, setSelectedId] = useState<BlockId | null>(null)
  const [dragOverId, setDragOverId] = useState<BlockId | null>(null)
  const [dropPosition, setDropPosition] = useState<DropPosition>('below')
  const dragId = useRef<BlockId | null>(null)
  const dragLeaveCounter = useRef(0)

  const accent = accentOverride ?? doc.accent ?? 'var(--ink)'

  const updateBlocks = (next: Block[]) => setDoc({ ...doc, blocks: next })

  const insertBlock = (type: BlockType) => {
    const block = blankBlock(type)
    const idx =
      selectedId != null ? doc.blocks.findIndex((b) => b.id === selectedId) : -1
    if (idx < 0) {
      updateBlocks([...doc.blocks, block])
    } else {
      const next = [...doc.blocks]
      next.splice(idx + 1, 0, block)
      updateBlocks(next)
    }
    setSelectedId(block.id)
  }

  const replaceBlock = (id: BlockId, next: Block) => {
    updateBlocks(doc.blocks.map((b) => (b.id === id ? next : b)))
  }

  // Type-safe per-block patch. The patch is narrowed by the block's
  // discriminant at the call site, so a Partial<HeadingBlock> can't land on
  // a ParagraphBlock without an explicit, deliberate cast.
  const patchBlock: BlockPatcher = (id, patch) => {
    updateBlocks(
      doc.blocks.map((b) =>
        b.id === id ? ({ ...b, ...patch } as Block) : b,
      ),
    )
  }

  const removeBlock = (id: BlockId) => {
    updateBlocks(doc.blocks.filter((b) => b.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const duplicateBlock = (id: BlockId) => {
    const idx = doc.blocks.findIndex((b) => b.id === id)
    if (idx < 0) return
    // Deep clone so duplicated blocks don't share nested arrays
    // (list.items, columns.cols, etc.) with the original.
    const cloned = deepClone(doc.blocks[idx])
    cloned.id = newId()
    // Re-id every nested item so the duplicate has fully independent
    // identities — keeps reorder/delete on either copy from disturbing
    // the other.
    if (cloned.type === 'list') {
      cloned.items = cloned.items.map((it) => ({ ...it, id: newId() }))
    } else if (cloned.type === 'columns') {
      cloned.cols = cloned.cols.map((c) => ({ ...c, id: newId() }))
    } else if (cloned.type === 'checklist') {
      cloned.items = cloned.items.map((it) => ({ ...it, id: newId() }))
    } else if (cloned.type === 'receipt') {
      cloned.items = cloned.items.map((it) => ({ ...it, id: newId() }))
    }
    const next = [...doc.blocks]
    next.splice(idx + 1, 0, cloned)
    updateBlocks(next)
    setSelectedId(cloned.id)
  }

  const dropAt = (fromId: BlockId, toId: BlockId, position: DropPosition) => {
    const from = doc.blocks.findIndex((b) => b.id === fromId)
    const to = doc.blocks.findIndex((b) => b.id === toId)
    if (from < 0 || to < 0) return
    const next = [...doc.blocks]
    const [moved] = next.splice(from, 1)
    const adjustedTo = to > from ? to - 1 : to
    const insertAt = position === 'below' ? adjustedTo + 1 : adjustedTo
    next.splice(insertAt, 0, moved)
    updateBlocks(next)
  }

  const selectedBlock =
    selectedId != null
      ? (doc.blocks.find((b) => b.id === selectedId) ?? null)
      : null

  const gridTemplate = showInspector
    ? '200px 1fr 280px'
    : '200px 1fr'

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: gridTemplate,
        gap: 24,
        alignItems: 'flex-start',
      }}
    >
      <BlockLibrary onPick={insertBlock} />
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-soft)',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            620px · branded template · {doc.blocks.length} block
            {doc.blocks.length === 1 ? '' : 's'}
          </div>
        </div>
        <div
          style={{ padding: 40, background: 'var(--bg-soft)' }}
          onClick={() => setSelectedId(null)}
        >
          <div
            style={{
              background: '#fff',
              maxWidth: 540,
              margin: '0 auto',
              padding: 36,
              borderRadius: 12,
              border: '1px solid var(--line)',
              minHeight: 200,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {doc.blocks.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: 40,
                  color: 'var(--ink-4)',
                  fontSize: 13,
                }}
              >
                Click a block on the left to start.
              </div>
            )}
            {doc.blocks.map((block) => {
              const isDragOver = dragOverId === block.id
              return (
                <EditableBlock
                  key={block.id}
                  block={block}
                  accent={accent}
                  selected={selectedId === block.id}
                  isDragOver={isDragOver}
                  dropPosition={isDragOver ? dropPosition : null}
                  uploadImage={uploadImage}
                  patchBlock={patchBlock}
                  onSelect={() => setSelectedId(block.id)}
                  onChange={(next) => replaceBlock(block.id, next)}
                  onRemove={() => removeBlock(block.id)}
                  onDuplicate={() => duplicateBlock(block.id)}
                  onDragStart={() => {
                    dragId.current = block.id
                  }}
                  onDragEnter={() => {
                    if (!dragId.current || dragId.current === block.id) return
                    dragLeaveCounter.current += 1
                    setDragOverId(block.id)
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (!dragId.current || dragId.current === block.id) return
                    const rect = e.currentTarget.getBoundingClientRect()
                    const above =
                      e.clientY - rect.top < rect.height / 2 ? 'above' : 'below'
                    setDragOverId(block.id)
                    setDropPosition(above)
                  }}
                  onDragLeave={() => {
                    // Counter-based: dragleave fires when entering child
                    // elements (the contentEditable inside), so we count
                    // enter/leave pairs and only clear when fully outside.
                    dragLeaveCounter.current = Math.max(
                      0,
                      dragLeaveCounter.current - 1,
                    )
                    if (
                      dragLeaveCounter.current === 0 &&
                      dragOverId === block.id
                    ) {
                      setDragOverId(null)
                    }
                  }}
                  onDrop={() => {
                    const fromId = dragId.current
                    if (fromId && fromId !== block.id) {
                      dropAt(fromId, block.id, dropPosition)
                    }
                    dragId.current = null
                    dragLeaveCounter.current = 0
                    setDragOverId(null)
                  }}
                />
              )
            })}
          </div>
        </div>
      </div>
      {showInspector && (
        // The block id forms the React key so the Inspector remounts when the
        // selection changes — defaultValue inputs inside therefore reset to
        // the newly-selected block's data instead of the previous one's.
        <Inspector
          key={selectedBlock?.id ?? '__none__'}
          block={selectedBlock}
          patch={patchBlock}
        />
      )}
    </div>
  )
}

const BlockLibrary = ({ onPick }: { onPick: (type: BlockType) => void }) => (
  <div style={{ position: 'sticky', top: 24 }}>
    <div
      style={{
        fontSize: 11,
        color: 'var(--ink-3)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 12,
      }}
    >
      Blocks
    </div>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
      }}
    >
      {blockLibrary.map((b) => (
        <button
          key={b.type}
          type="button"
          className="card"
          style={{
            padding: '14px 8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            transition: 'all 0.15s',
            background: '#fff',
            border: '1px solid var(--line)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--ink-3)'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--line)'
            e.currentTarget.style.transform = 'none'
          }}
          onClick={() => onPick(b.type)}
        >
          <Icon name={b.icon} size={16} style={{ color: 'var(--ink-2)' }} />
          <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
            {b.label}
          </span>
        </button>
      ))}
    </div>
    <div
      style={{
        marginTop: 16,
        padding: 12,
        background: 'var(--bg-soft)',
        borderRadius: 10,
        fontSize: 11.5,
        color: 'var(--ink-3)',
        lineHeight: 1.5,
      }}
    >
      Tip: click the canvas to deselect. Hover any block for actions.
    </div>
  </div>
)

const EditableBlock = ({
  block,
  accent,
  selected,
  isDragOver,
  dropPosition,
  uploadImage,
  patchBlock,
  onSelect,
  onChange,
  onRemove,
  onDuplicate,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  block: Block
  accent: string
  selected: boolean
  isDragOver: boolean
  dropPosition: DropPosition | null
  uploadImage: ImageUploader | undefined
  patchBlock: BlockPatcher
  onSelect: () => void
  onChange: (next: Block) => void
  onRemove: () => void
  onDuplicate: () => void
  onDragStart: () => void
  onDragEnter: () => void
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void
  onDragLeave: () => void
  onDrop: () => void
}) => {
  const [hover, setHover] = useState(false)
  const showChrome = hover || selected
  const wrap: CSSProperties = {
    padding: '8px 0',
    position: 'relative',
    borderRadius: 6,
    transition: 'background 0.12s, box-shadow 0.12s',
    background: selected
      ? 'rgba(79,70,229,0.04)'
      : hover
        ? 'rgba(0,0,0,0.02)'
        : 'transparent',
    boxShadow: selected ? 'inset 0 0 0 1.5px var(--indigo)' : 'none',
    cursor: 'pointer',
  }

  return (
    <div
      style={wrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragOver && (
        <div
          style={{
            position: 'absolute',
            left: -4,
            right: -4,
            top: dropPosition === 'above' ? -2 : undefined,
            bottom: dropPosition === 'below' ? -2 : undefined,
            height: 3,
            borderRadius: 2,
            background: 'var(--indigo)',
            boxShadow: '0 0 0 4px rgba(79,70,229,0.18)',
            pointerEvents: 'none',
            zIndex: 3,
          }}
        />
      )}
      <BlockBody
        block={block}
        accent={accent}
        selected={selected}
        uploadImage={uploadImage}
        patchBlock={patchBlock}
        onChange={onChange}
      />

      {showChrome && (
        <div
          style={{
            position: 'absolute',
            right: -10,
            top: 4,
            transform: 'translateX(100%)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            zIndex: 2,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="btn-icon"
            draggable
            onDragStart={(e) => {
              onDragStart()
              e.stopPropagation()
            }}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              cursor: 'grab',
            }}
            title="Drag to reorder"
            aria-label="Drag to reorder"
          >
            <Icon name="drag" size={13} />
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={onDuplicate}
            style={{ width: 28, height: 28, borderRadius: 7 }}
            title="Duplicate"
            aria-label="Duplicate block"
          >
            <Icon name="copy" size={13} />
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={onRemove}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              color: 'var(--red)',
            }}
            title="Delete"
            aria-label="Delete block"
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Block bodies ─────────────────────────────────────────────────────────

type BodyProps<T extends Block> = {
  block: T
  accent: string
  selected: boolean
  uploadImage: ImageUploader | undefined
  patchBlock: BlockPatcher
  onChange: (next: Block) => void
}

const BlockBody = ({
  block,
  accent,
  selected,
  uploadImage,
  patchBlock,
  onChange,
}: BodyProps<Block>) => {
  switch (block.type) {
    case 'eyebrow':
      return <EyebrowBody block={block} accent={accent} patch={patchBlock} />
    case 'heading':
      return <HeadingBody block={block} patch={patchBlock} />
    case 'subheading':
      return <SubheadingBody block={block} patch={patchBlock} />
    case 'paragraph':
      return <ParagraphBody block={block} patch={patchBlock} />
    case 'badge':
      return <BadgeBody block={block} patch={patchBlock} />
    case 'image':
      return (
        <ImageBody
          block={block}
          selected={selected}
          uploadImage={uploadImage}
          patch={patchBlock}
        />
      )
    case 'video':
      return (
        <VideoBody block={block} selected={selected} patch={patchBlock} />
      )
    case 'button':
      return <ButtonBody block={block} accent={accent} patch={patchBlock} />
    case 'divider':
      return (
        <hr
          style={{
            border: 'none',
            borderTop: '1px solid var(--line)',
            margin: '20px 0',
          }}
        />
      )
    case 'list':
      return <ListBody block={block} onChange={onChange} patch={patchBlock} />
    case 'quote':
      return <QuoteBody block={block} accent={accent} patch={patchBlock} />
    case 'columns':
      return <ColumnsBody block={block} onChange={onChange} />
    case 'checklist':
      return (
        <ChecklistBody block={block} accent={accent} onChange={onChange} />
      )
    case 'event-card':
      return <EventCardBody block={block} accent={accent} patch={patchBlock} />
    case 'receipt':
      return <ReceiptBody block={block} onChange={onChange} patch={patchBlock} />
    case 'digest-item':
      return (
        <DigestItemBody block={block} accent={accent} patch={patchBlock} />
      )
  }
}

const EyebrowBody = ({
  block,
  accent,
  patch,
}: {
  block: EyebrowBlock
  accent: string
  patch: BlockPatcher
}) => (
  <EditableText
    value={block.text}
    onChange={(text) => patch<EyebrowBlock>(block.id, { text })}
    placeholder="Eyebrow label"
    style={{
      fontSize: 11,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color: accent,
      fontWeight: 600,
      margin: '0 0 8px',
    }}
  />
)

const HeadingBody = ({
  block,
  patch,
}: {
  block: HeadingBlock
  patch: BlockPatcher
}) => {
  const fontSize = block.huge
    ? 32
    : block.level === 1
      ? 28
      : block.level === 2
        ? 22
        : 17
  const Tag =
    block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3'
  return (
    <EditableText
      as={Tag}
      value={block.text}
      onChange={(text) => patch<HeadingBlock>(block.id, { text })}
      placeholder="Heading"
      style={{
        fontSize,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        margin: 0,
        color: 'var(--ink)',
        lineHeight: 1.2,
      }}
    />
  )
}

const SubheadingBody = ({
  block,
  patch,
}: {
  block: SubheadingBlock
  patch: BlockPatcher
}) => (
  <EditableText
    as="h3"
    value={block.text}
    onChange={(text) => patch<SubheadingBlock>(block.id, { text })}
    placeholder="Subheading"
    style={{
      fontSize: 17,
      fontWeight: 600,
      letterSpacing: '-0.01em',
      lineHeight: 1.3,
      color: 'var(--ink)',
      margin: '20px 0 8px',
    }}
  />
)

const ParagraphBody = ({
  block,
  patch,
}: {
  block: ParagraphBlock
  patch: BlockPatcher
}) => (
  <EditableText
    as="p"
    multiline
    value={block.text}
    onChange={(text) => patch<ParagraphBlock>(block.id, { text })}
    placeholder="Write your paragraph here…"
    style={{
      fontSize: 14,
      lineHeight: 1.65,
      color: 'var(--ink-2)',
      margin: 0,
    }}
  />
)

const BadgeBody = ({
  block,
  patch,
}: {
  block: BadgeBlock
  patch: BlockPatcher
}) => (
  <EditableText
    as="span"
    value={block.text}
    onChange={(text) => patch<BadgeBlock>(block.id, { text })}
    placeholder="Badge"
    style={{
      display: 'inline-block',
      fontSize: 12,
      padding: '5px 11px',
      background: 'var(--ink)',
      color: '#fff',
      borderRadius: 999,
      fontWeight: 500,
      margin: '0 0 14px',
    }}
  />
)

const ButtonBody = ({
  block,
  accent,
  patch,
}: {
  block: ButtonBlock
  accent: string
  patch: BlockPatcher
}) => {
  const [editingUrl, setEditingUrl] = useState(false)
  const padding =
    block.size === 'lg' ? '13px 28px' : block.size === 'sm' ? '8px 16px' : '10px 20px'
  const fontSize = block.size === 'lg' ? 14 : 13
  return (
    <div style={{ margin: '8px 0' }}>
      <EditableText
        as="a"
        value={block.text}
        onChange={(text) => patch<ButtonBlock>(block.id, { text })}
        placeholder="Button label"
        ariaLabel="Button label"
        style={{
          display: 'inline-block',
          background: accent,
          color: '#fff',
          padding,
          borderRadius: 8,
          fontSize,
          fontWeight: 500,
          textDecoration: 'none',
        }}
      />
      <div style={{ marginTop: 6 }}>
        {editingUrl ? (
          <input
            autoFocus
            className="input"
            value={block.url}
            placeholder="https://…"
            onChange={(e) =>
              patch<ButtonBlock>(block.id, { url: e.target.value })
            }
            onBlur={() => setEditingUrl(false)}
            style={{ fontSize: 12, padding: '6px 10px' }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setEditingUrl(true)
            }}
            style={{
              fontSize: 11.5,
              color: 'var(--ink-4)',
              cursor: 'pointer',
            }}
          >
            {block.url ? `→ ${block.url}` : 'Set link'}
          </button>
        )}
      </div>
    </div>
  )
}

const ImageBody = ({
  block,
  selected,
  uploadImage,
  patch,
}: {
  block: ImageBlock
  selected: boolean
  uploadImage: ImageUploader | undefined
  patch: BlockPatcher
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (!uploadImage) {
      setError('Image upload not configured')
      return
    }
    if (!file.type.startsWith('image/')) {
      setError('Not a recognised image format')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image is over 10MB')
      return
    }
    setUploading(true)
    try {
      const url = await uploadImage(file)
      patch<ImageBlock>(block.id, { src: url, alt: file.name })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }
  return (
    <div style={{ margin: '12px 0' }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {block.src ? (
        <div style={{ position: 'relative' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.src}
            alt={block.alt}
            style={{
              width: '100%',
              display: 'block',
              borderRadius: 8,
              border: '1px solid var(--line)',
              opacity: uploading ? 0.5 : 1,
            }}
          />
          {selected && !uploading && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={(e) => {
                e.stopPropagation()
                inputRef.current?.click()
              }}
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                fontSize: 11.5,
              }}
            >
              Replace
            </button>
          )}
          {uploading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                color: 'var(--ink-2)',
                background: 'rgba(255,255,255,0.65)',
                borderRadius: 8,
              }}
            >
              Uploading…
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={(e) => {
            e.stopPropagation()
            inputRef.current?.click()
          }}
          style={{
            width: '100%',
            height: 180,
            border: '1.5px dashed var(--line-2)',
            borderRadius: 8,
            background: 'var(--bg-soft)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            cursor: uploading ? 'wait' : 'pointer',
            transition: 'all 0.15s',
            color: 'var(--ink-3)',
            opacity: uploading ? 0.7 : 1,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--ink-3)'
            e.currentTarget.style.color = 'var(--ink-2)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--line-2)'
            e.currentTarget.style.color = 'var(--ink-3)'
          }}
        >
          <Icon name="upload" size={18} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>
            {uploading ? 'Uploading…' : 'Upload an image'}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>
            PNG, JPG, GIF · up to 10MB
          </span>
        </button>
      )}
      {error && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red)' }}>
          {error}
        </div>
      )}
    </div>
  )
}

const toEmbedSrc = (url: string): string => {
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/,
  )
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`
  const loom = url.match(/loom\.com\/share\/([\w-]+)/)
  if (loom) return `https://www.loom.com/embed/${loom[1]}`
  return url
}

const VideoBody = ({
  block,
  selected,
  patch,
}: {
  block: VideoBlock
  selected: boolean
  patch: BlockPatcher
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<'upload' | 'embed'>(
    block.embed_url ? 'embed' : 'upload',
  )
  const [url, setUrl] = useState(block.embed_url ?? '')
  const [error, setError] = useState<string | null>(null)

  // Track the blob URL we created locally so we can revoke it when the
  // block changes or unmounts (prevents the blob lingering forever and
  // avoids storing an ephemeral URL in `src` that won't survive reload).
  const blobUrlRef = useRef<string | null>(null)
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  const onFile = (file: File | undefined) => {
    setError(null)
    if (!file) return
    if (!file.type.startsWith('video/')) {
      setError('Not a recognised video format')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('Video is over 50MB — embed instead, or compress.')
      return
    }
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    const u = URL.createObjectURL(file)
    blobUrlRef.current = u
    patch<VideoBlock>(block.id, { src: u, embed_url: undefined })
  }
  const submitEmbed = () => {
    const trimmed = url.trim()
    if (!trimmed) return
    if (!/^https?:\/\//i.test(trimmed)) {
      setError('Embed URL must start with http(s)://')
      return
    }
    setError(null)
    patch<VideoBlock>(block.id, { embed_url: trimmed, src: undefined })
  }
  const reset = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    patch<VideoBlock>(block.id, { src: undefined, embed_url: undefined })
    setUrl('')
    setError(null)
  }

  const hasMedia = !!(block.src || block.embed_url)

  if (hasMedia) {
    return (
      <div style={{ margin: '12px 0', position: 'relative' }}>
        {block.src && (
          <video
            src={block.src}
            controls
            style={{
              width: '100%',
              display: 'block',
              borderRadius: 8,
              border: '1px solid var(--line)',
              background: '#000',
            }}
          />
        )}
        {block.embed_url && (
          <div
            style={{
              position: 'relative',
              paddingBottom: '56.25%',
              height: 0,
              borderRadius: 8,
              overflow: 'hidden',
              border: '1px solid var(--line)',
              background: '#000',
            }}
          >
            <iframe
              title="Video preview"
              src={toEmbedSrc(block.embed_url)}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                border: 0,
              }}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
        {selected && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={(e) => {
              e.stopPropagation()
              reset()
            }}
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              fontSize: 11.5,
            }}
          >
            Replace
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        margin: '12px 0',
        border: '1.5px dashed var(--line-2)',
        borderRadius: 8,
        background: 'var(--bg-soft)',
        padding: 16,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <div className="tabs" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className={`tab ${tab === 'upload' ? 'tab-active' : ''}`}
          onClick={() => setTab('upload')}
        >
          Upload
        </button>
        <button
          type="button"
          className={`tab ${tab === 'embed' ? 'tab-active' : ''}`}
          onClick={() => setTab('embed')}
        >
          Embed link
        </button>
      </div>
      {tab === 'upload' ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{
            width: '100%',
            height: 120,
            border: '1px dashed var(--line-2)',
            borderRadius: 8,
            background: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            cursor: 'pointer',
            color: 'var(--ink-3)',
          }}
        >
          <Icon name="upload" size={18} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>Upload a video</span>
          <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>
            MP4, MOV, WebM
          </span>
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            placeholder="https://youtube.com/watch?v=… or vimeo.com/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitEmbed()
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={submitEmbed}
            disabled={!url.trim()}
            style={{ opacity: !url.trim() ? 0.5 : 1 }}
          >
            Embed
          </button>
        </div>
      )}
      {error && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red)' }}>
          {error}
        </div>
      )}
    </div>
  )
}

const ListBody = ({
  block,
  onChange,
  patch,
}: {
  block: ListBlock
  onChange: (next: Block) => void
  patch: BlockPatcher
}) => {
  const Tag = block.ordered ? 'ol' : 'ul'
  const setItemText = (id: string, text: string) => {
    const items = block.items.map((it) => (it.id === id ? { ...it, text } : it))
    patch<ListBlock>(block.id, { items })
  }
  const addItem = () => {
    const items = [...block.items, { id: newId(), text: '' }]
    onChange({ ...block, items })
  }
  const removeItem = (id: string) => {
    if (block.items.length <= 1) return
    const items = block.items.filter((it) => it.id !== id)
    onChange({ ...block, items })
  }
  return (
    <Tag
      style={{
        margin: '0 0 14px',
        paddingLeft: 20,
        color: 'var(--ink-2)',
        fontSize: 14,
        lineHeight: 1.7,
      }}
    >
      {block.items.map((it) => (
        <li key={it.id} style={{ marginBottom: 4 }}>
          <EditableText
            as="span"
            value={it.text}
            onChange={(text) => setItemText(it.id, text)}
            placeholder="List item"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addItem()
              } else if (e.key === 'Backspace' && !it.text) {
                e.preventDefault()
                removeItem(it.id)
              }
            }}
          />
        </li>
      ))}
    </Tag>
  )
}

const QuoteBody = ({
  block,
  accent,
  patch,
}: {
  block: QuoteBlock
  accent: string
  patch: BlockPatcher
}) => (
  <div
    style={{
      margin: '20px 0',
      padding: '18px 22px',
      background: '#fafafa',
      borderLeft: `3px solid ${accent}`,
      borderRadius: '0 8px 8px 0',
    }}
  >
    <EditableText
      multiline
      value={block.text}
      onChange={(text) => patch<QuoteBlock>(block.id, { text })}
      placeholder="A short, punchy testimonial"
      style={{
        fontSize: 15,
        color: 'var(--ink)',
        lineHeight: 1.55,
        fontStyle: 'italic',
        letterSpacing: '-0.01em',
      }}
    />
    <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'baseline' }}>
      <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>—</span>
      <EditableText
        value={block.cite ?? ''}
        onChange={(cite) => patch<QuoteBlock>(block.id, { cite })}
        placeholder="Attribution"
        style={{ fontSize: 11.5, color: 'var(--ink-4)' }}
      />
    </div>
  </div>
)

const ColumnsBody = ({
  block,
  onChange,
}: {
  block: ColumnsBlock
  onChange: (next: Block) => void
}) => {
  const setCol = (id: string, patch: Partial<ColumnsBlockColumn>) => {
    const cols = block.cols.map((c) => (c.id === id ? { ...c, ...patch } : c))
    onChange({ ...block, cols })
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${block.cols.length || 1}, 1fr)`,
        gap: 12,
        margin: '18px 0',
      }}
    >
      {block.cols.map((c) => (
        <div
          key={c.id}
          style={{
            background: '#fafafa',
            padding: 14,
            borderRadius: 8,
            border: '1px solid #efefef',
          }}
        >
          {c.label !== undefined && (
            <EditableText
              value={c.label}
              onChange={(label) => setCol(c.id, { label })}
              placeholder="LABEL"
              style={{
                fontSize: 10.5,
                color: 'var(--ink-4)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontWeight: 500,
                marginBottom: 4,
              }}
            />
          )}
          <EditableText
            value={c.title ?? ''}
            onChange={(title) => setCol(c.id, { title })}
            placeholder="Title"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--ink)',
              marginBottom: 4,
              letterSpacing: '-0.005em',
            }}
          />
          {c.value !== undefined && (
            <EditableText
              value={c.value}
              onChange={(value) => setCol(c.id, { value })}
              placeholder="Value"
              style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}
            />
          )}
          {c.body !== undefined && (
            <EditableText
              multiline
              value={c.body}
              onChange={(body) => setCol(c.id, { body })}
              placeholder="Body copy"
              style={{
                fontSize: 11.5,
                lineHeight: 1.5,
                color: 'var(--ink-3)',
              }}
            />
          )}
        </div>
      ))}
    </div>
  )
}

const ChecklistBody = ({
  block,
  accent,
  onChange,
}: {
  block: ChecklistBlock
  accent: string
  onChange: (next: Block) => void
}) => {
  const setItem = (id: string, patch: Partial<ChecklistBlockItem>) => {
    const items = block.items.map((it) =>
      it.id === id ? { ...it, ...patch } : it,
    )
    onChange({ ...block, items })
  }
  return (
    <div
      style={{
        margin: '16px 0',
        background: '#fafafa',
        border: '1px solid #efefef',
        borderRadius: 8,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {block.items.map((it, i) => (
        <div key={it.id} style={{ display: 'flex', gap: 12 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 22,
              background: accent,
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {i + 1}
          </div>
          <div style={{ flex: 1 }}>
            <EditableText
              value={it.title}
              onChange={(title) => setItem(it.id, { title })}
              placeholder="Step title"
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: 'var(--ink)',
                marginBottom: 2,
              }}
            />
            {it.body !== undefined && (
              <EditableText
                multiline
                value={it.body}
                onChange={(body) => setItem(it.id, { body })}
                placeholder="Step description"
                style={{
                  fontSize: 12,
                  color: 'var(--ink-3)',
                  lineHeight: 1.5,
                }}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

const EventCardBody = ({
  block,
  accent,
  patch,
}: {
  block: EventCardBlock
  accent: string
  patch: BlockPatcher
}) => (
  <div
    style={{
      margin: '8px 0 18px',
      background: accent,
      color: '#fff',
      borderRadius: 10,
      padding: 20,
      display: 'flex',
      gap: 18,
    }}
  >
    <div
      style={{
        background: 'rgba(255,255,255,0.15)',
        borderRadius: 8,
        padding: 10,
        textAlign: 'center',
        minWidth: 80,
      }}
    >
      <EditableText
        value={block.day}
        onChange={(day) => patch<EventCardBlock>(block.id, { day })}
        placeholder="THU"
        style={{
          fontSize: 10,
          letterSpacing: '0.1em',
          opacity: 0.8,
        }}
      />
      <EditableText
        value={block.date}
        onChange={(date) => patch<EventCardBlock>(block.id, { date })}
        placeholder="MAY 22"
        style={{
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          marginTop: 2,
        }}
      />
    </div>
    <div style={{ flex: 1 }}>
      <div
        style={{
          fontSize: 11,
          opacity: 0.7,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: 6,
        }}
      >
        You&apos;re invited
      </div>
      <EditableText
        value={block.title}
        onChange={(title) => patch<EventCardBlock>(block.id, { title })}
        placeholder="Event title"
        style={{
          fontSize: 17,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          marginBottom: 6,
          lineHeight: 1.25,
        }}
      />
      <EditableText
        value={block.meta}
        onChange={(meta) => patch<EventCardBlock>(block.id, { meta })}
        placeholder="Time · place · seats"
        style={{ fontSize: 12, opacity: 0.85 }}
      />
    </div>
  </div>
)

const ReceiptBody = ({
  block,
  onChange,
  patch,
}: {
  block: ReceiptBlock
  onChange: (next: Block) => void
  patch: BlockPatcher
}) => {
  const setItem = (id: string, p: Partial<ReceiptBlockItem>) => {
    const items = block.items.map((it) =>
      it.id === id ? { ...it, ...p } : it,
    )
    onChange({ ...block, items })
  }
  return (
    <div
      style={{
        margin: '16px 0',
        background: '#fafafa',
        border: '1px solid #efefef',
        borderRadius: 10,
        padding: 20,
      }}
    >
      {block.items.map((it) => (
        <div
          key={it.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            padding: '10px 0',
            borderBottom: '1px solid #efefef',
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <EditableText
              value={it.name}
              onChange={(name) => setItem(it.id, { name })}
              placeholder="Item"
              style={{
                fontSize: 13.5,
                fontWeight: 500,
                color: 'var(--ink)',
              }}
            />
            {it.sub !== undefined && (
              <EditableText
                value={it.sub}
                onChange={(sub) => setItem(it.id, { sub })}
                placeholder="Detail"
                style={{
                  fontSize: 11.5,
                  color: 'var(--ink-4)',
                  marginTop: 2,
                }}
              />
            )}
          </div>
          <EditableText
            value={it.price}
            onChange={(price) => setItem(it.id, { price })}
            placeholder="$0.00"
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              fontFamily: 'monospace',
              color: 'var(--ink)',
            }}
          />
        </div>
      ))}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          paddingTop: 12,
          borderTop: '2px solid var(--ink)',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>Total</span>
        <EditableText
          value={block.total}
          onChange={(total) => patch<ReceiptBlock>(block.id, { total })}
          placeholder="$0.00"
          style={{
            fontSize: 15,
            fontWeight: 700,
            fontFamily: 'monospace',
          }}
        />
      </div>
    </div>
  )
}

const DigestItemBody = ({
  block,
  accent,
  patch,
}: {
  block: DigestItemBlock
  accent: string
  patch: BlockPatcher
}) => (
  <div style={{ margin: '14px 0', display: 'flex', gap: 14 }}>
    <EditableText
      value={block.num}
      onChange={(num) => patch<DigestItemBlock>(block.id, { num })}
      placeholder="01"
      style={{
        fontSize: 20,
        fontWeight: 700,
        color: accent,
        fontFamily: 'monospace',
        lineHeight: 1,
        minWidth: 48,
      }}
    />
    <div style={{ flex: 1 }}>
      <EditableText
        value={block.title}
        onChange={(title) => patch<DigestItemBlock>(block.id, { title })}
        placeholder="Story title"
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--ink)',
          letterSpacing: '-0.01em',
          marginBottom: 3,
          lineHeight: 1.3,
        }}
      />
      <EditableText
        value={block.meta}
        onChange={(meta) => patch<DigestItemBlock>(block.id, { meta })}
        placeholder="Read time · Source"
        style={{
          fontSize: 11,
          color: 'var(--ink-4)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 5,
        }}
      />
      <EditableText
        multiline
        value={block.body}
        onChange={(body) => patch<DigestItemBlock>(block.id, { body })}
        placeholder="One-line summary"
        style={{
          fontSize: 13,
          color: 'var(--ink-2)',
          lineHeight: 1.55,
        }}
      />
    </div>
  </div>
)

// ── Inspector right rail ─────────────────────────────────────────────────

const Inspector = ({
  block,
  patch,
}: {
  block: Block | null
  patch: BlockPatcher
}) => {
  if (!block) {
    return (
      <div
        style={{
          padding: 16,
          fontSize: 12,
          color: 'var(--ink-4)',
          background: 'var(--bg-soft)',
          borderRadius: 10,
        }}
      >
        Select a block to inspect.
      </div>
    )
  }
  return (
    <div
      style={{
        padding: 16,
        background: '#fff',
        border: '1px solid var(--line)',
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        position: 'sticky',
        top: 24,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: 'var(--ink-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {block.type}
      </div>
      <InspectorFields block={block} patch={patch} />
    </div>
  )
}

const InspectorFields = ({
  block,
  patch,
}: {
  block: Block
  patch: BlockPatcher
}) => {
  switch (block.type) {
    case 'heading':
      return (
        <>
          <Field label="Level">
            <select
              className="input"
              value={String(block.level)}
              onChange={(e) =>
                patch<HeadingBlock>(block.id, {
                  level: Number(e.target.value) as 1 | 2 | 3,
                })
              }
            >
              <option value="1">H1</option>
              <option value="2">H2</option>
              <option value="3">H3</option>
            </select>
          </Field>
          <Field label="Huge variant">
            <input
              type="checkbox"
              checked={!!block.huge}
              onChange={(e) =>
                patch<HeadingBlock>(block.id, { huge: e.target.checked })
              }
            />
          </Field>
        </>
      )
    case 'button':
      return (
        <>
          <Field label="URL">
            <input
              className="input"
              value={block.url}
              placeholder="https://…"
              onChange={(e) =>
                patch<ButtonBlock>(block.id, { url: e.target.value })
              }
            />
          </Field>
          <Field label="Size">
            <select
              className="input"
              value={block.size ?? 'md'}
              onChange={(e) =>
                patch<ButtonBlock>(block.id, {
                  size: e.target.value as 'sm' | 'md' | 'lg',
                })
              }
            >
              <option value="sm">Small</option>
              <option value="md">Medium</option>
              <option value="lg">Large</option>
            </select>
          </Field>
        </>
      )
    case 'image':
      return (
        <>
          <Field label="Alt text">
            <input
              className="input"
              value={block.alt}
              placeholder="Describe the image"
              onChange={(e) =>
                patch<ImageBlock>(block.id, { alt: e.target.value })
              }
            />
          </Field>
          <Field label="Link URL">
            <input
              className="input"
              value={block.href ?? ''}
              placeholder="https://…"
              onChange={(e) =>
                patch<ImageBlock>(block.id, { href: e.target.value })
              }
            />
          </Field>
        </>
      )
    case 'video':
      return (
        <Field label="Embed URL">
          <input
            className="input"
            value={block.embed_url ?? ''}
            placeholder="YouTube, Vimeo, or Loom"
            onChange={(e) =>
              patch<VideoBlock>(block.id, { embed_url: e.target.value })
            }
          />
        </Field>
      )
    case 'list':
      return (
        <Field label="Ordered list">
          <input
            type="checkbox"
            checked={!!block.ordered}
            onChange={(e) =>
              patch<ListBlock>(block.id, { ordered: e.target.checked })
            }
          />
        </Field>
      )
    default:
      return (
        <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>
          No options for this block.
        </div>
      )
  }
}

const Field = ({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) => (
  <label
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      fontSize: 11.5,
      color: 'var(--ink-3)',
    }}
  >
    {label}
    {children}
  </label>
)

// Re-export ListItem so consumers can construct items without re-importing
// from types.ts.
export type { ListItem }
