// Files waiting to go with the next message (mac/Simeon/Attachments.swift):
// what the composer takes (SimeonCore's `AttachmentLimits`, core/
// attachmentLimits.ts), Attach and its menu, the files over the words, and
// files dropped on the chat.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  admit,
  maxStaged,
  noticeSeconds,
  type Refusal,
  refusal,
  refusedNotice,
} from '../core/attachmentLimits'
import { fileSize } from '../core/fileLine'
import { fileExtension } from '../core/filePreview'
import { t } from '../l10n'
import { fileIcon } from './Files'

/** A file waiting to go with the next message (the window's staged attachment): its name and bytes. */
export interface StagedFile {
  id: string
  name: string
  data: Uint8Array
}

/** The window's picture kinds (`kft`): shown as a picture, not a file. */
const pictureExtensions = new Set([
  'avif',
  'bmp',
  'gif',
  'ico',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'webp',
])

function isPicture(name: string): boolean {
  return pictureExtensions.has(fileExtension(name) ?? '')
}

type ReadFile =
  | { name: string; data: Uint8Array }
  | { name: string; reason: Refusal }

/** One file's bytes, its size checked before it is read; a nameless picture is "image.png" (`D9n`). */
async function read(file: File): Promise<ReadFile> {
  const name = file.name === '' ? 'image.png' : file.name
  const refused = refusal(name, file.size)
  if (refused) return { name, reason: refused }
  try {
    const data = new Uint8Array(await file.arrayBuffer())
    const late = refusal(name, data.length)
    return late ? { name, reason: late } : { name, data }
  } catch {
    return { name, reason: 'failed' }
  }
}

let made = 0

export interface Staging {
  files: StagedFile[]
  /** The line over the words when files were left out, five seconds. */
  notice?: string
  stage: (files: File[]) => void
  unstage: (id: string) => void
  /** The files, handed to a send; none wait after. */
  take: () => StagedFile[]
  /** A canceled message's files, back. */
  restore: (files: { name: string; data: Uint8Array }[]) => void
}

/**
 * The chat's files waiting to go (`ChatControl.stage`): as many as fit
 * beside those waiting (six in all, files still being read counted, so two
 * drops close together keep to six), none empty and none over 25 MB (200 MB
 * for a video); what was left out said over the words for five seconds, the
 * latest line kept.
 */
export function useStaging(): Staging {
  const [files, setFiles] = useState<StagedFile[]>([])
  const [notice, setNotice] = useState<string>()
  const held = useRef<StagedFile[]>([])
  const reading = useRef(0)
  const notices = useRef(0)
  const put = useCallback((next: StagedFile[]) => {
    held.current = next
    setFiles(next)
  }, [])

  const show = useCallback((line: string) => {
    notices.current += 1
    const number = notices.current
    setNotice(line)
    setTimeout(() => {
      if (notices.current === number) setNotice(undefined)
    }, noticeSeconds * 1000)
  }, [])

  const stage = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return
      const admitted = admit(
        incoming.length,
        held.current.length + reading.current,
      )
      if (admitted.accepted === 0) {
        if (admitted.notice) show(admitted.notice)
        return
      }
      const taken = incoming.slice(0, admitted.accepted)
      reading.current += taken.length
      void Promise.all(taken.map(read)).then((answers) => {
        reading.current -= taken.length
        const refused: { name: string; reason: Refusal }[] = []
        const ready: StagedFile[] = []
        for (const answer of answers) {
          if ('data' in answer) {
            made += 1
            ready.push({ id: `staged-${made}`, ...answer })
          } else refused.push(answer)
        }
        if (ready.length > 0)
          put([...held.current, ...ready].slice(0, maxStaged))
        const line = refusedNotice(refused) ?? admitted.notice
        if (line) show(line)
      })
    },
    [put, show],
  )

  const unstage = useCallback(
    (id: string) => put(held.current.filter((file) => file.id !== id)),
    [put],
  )

  const take = useCallback(() => {
    const taken = held.current
    put([])
    return taken
  }, [put])

  const restore = useCallback(
    (back: { name: string; data: Uint8Array }[]) =>
      put(
        back.slice(0, maxStaged).map((file) => {
          made += 1
          return { id: `staged-${made}`, name: file.name, data: file.data }
        }),
      ),
    [put],
  )

  return { files, notice, stage, unstage, take, restore }
}

/**
 * Attach file (`sand-prompt-attach`): the iPhone's 40-point glass disc with
 * a plus beside the field; off once six wait. It opens the computer's file
 * chooser at once, several files of any kind (the founder, 9 November
 * 2026: Photo or Video "leave that to iphone. on mac/window its
 * confusing"; it had a menu of the two since 29 October).
 */
export function AttachButton({
  full,
  stage,
}: {
  full: boolean
  stage: (files: File[]) => void
}) {
  const any = useRef<HTMLInputElement>(null)
  return (
    <div className="attach">
      <button
        type="button"
        className="attach-button glass-disc"
        title={t('Attach file')}
        aria-label={t('Attach file')}
        disabled={full}
        onClick={() => any.current?.click()}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path
            d="M9 3v12M3 9h12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <input
        ref={any}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const input = event.currentTarget
          const chosen = [...(input.files ?? [])]
          // The same file can be chosen again.
          input.value = ''
          stage(chosen)
        }}
      />
    </div>
  )
}

/** `photo.on.rectangle`: a picture the browser can't draw. */
function PhotoGlyph() {
  return (
    <svg width="15" height="14" viewBox="0 0 15 14" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      >
        <rect x="3.5" y="1.5" width="10" height="8" rx="1.5" />
        <path d="M1.5 4.5v6.5a1.5 1.5 0 0 0 1.5 1.5h8.5" />
        <path d="m4 9 3-3 2.5 2.5 1.5-1.5 2.5 2.5" />
      </g>
      <circle cx="10.5" cy="4.3" r="0.9" fill="currentColor" />
    </svg>
  )
}

/**
 * The files waiting to go, over the words (`sand-prompt-attachments`, 8
 * apart, scrolling sideways when they don't fit): a picture as a 52-point
 * square of it (12 round, a hairline at 15%), Remove at its top right, 2 in;
 * any other file as a chip like the chat's (220 by 54, padded 8, its kind's
 * icon 36, its name 13 at 500 over its size 12 at 60%, Remove at the right).
 */
export function AttachmentStrip({
  files,
  remove,
}: {
  files: StagedFile[]
  remove: (id: string) => void
}) {
  return (
    <div
      className="attachment-strip"
      role="group"
      aria-label={t('Attachments')}
    >
      {files.map((file) =>
        isPicture(file.name) ? (
          <PictureTile key={file.id} file={file} remove={remove} />
        ) : (
          <FileChip key={file.id} file={file} remove={remove} />
        ),
      )}
    </div>
  )
}

function PictureTile({
  file,
  remove,
}: {
  file: StagedFile
  remove: (id: string) => void
}) {
  const address = useMemo(
    () =>
      URL.createObjectURL(
        new Blob([file.data as BlobPart], {
          type: fileExtension(file.name) === 'svg' ? 'image/svg+xml' : '',
        }),
      ),
    [file],
  )
  useEffect(() => () => URL.revokeObjectURL(address), [address])
  // A picture the browser can't draw (HEIC in most browsers) keeps the tile's symbol.
  const [drawn, setDrawn] = useState(true)
  return (
    <div className="picture-tile" role="group" aria-label={file.name}>
      {drawn ? (
        <img src={address} alt="" onError={() => setDrawn(false)} />
      ) : (
        <PhotoGlyph />
      )}
      <RemoveButton name={file.name} remove={() => remove(file.id)} />
    </div>
  )
}

function FileChip({
  file,
  remove,
}: {
  file: StagedFile
  remove: (id: string) => void
}) {
  const ext = fileExtension(file.name)
  const base = ext ? file.name.slice(0, -(ext.length + 1)) : file.name
  const kind = fileIcon(file.name)
  return (
    <div className="file-chip" role="group" aria-label={file.name}>
      {kind ? (
        <img className="file-icon kind" src={kind} alt="" aria-hidden="true" />
      ) : (
        <span className="file-icon" aria-hidden="true" />
      )}
      <span className="file-words">
        <span className="chip-name" title={file.name}>
          <span className="chip-base">{base}</span>
          {ext && (
            <span className="chip-ext">{`.${file.name.slice(-ext.length)}`}</span>
          )}
        </span>
        <span className="file-meta">{fileSize(file.data.length)}</span>
      </span>
      <RemoveButton name={file.name} remove={() => remove(file.id)} />
    </div>
  )
}

/** Remove: 20, round, the text colour with the ground's X (near black on light, near white on dark). */
function RemoveButton({ name, remove }: { name: string; remove: () => void }) {
  return (
    <button
      type="button"
      className="remove-staged"
      tabIndex={-1}
      title={t`Remove ${name}`}
      aria-label={t`Remove ${name}`}
      onClick={(event) => {
        event.stopPropagation()
        remove()
      }}
    >
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
        <path
          d="M1 1l6 6M7 1 1 7"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  )
}

/** Files coming with a drag (not words or a link dragged from the page). */
function holdsFiles(event: React.DragEvent): boolean {
  return [...event.dataTransfer.types].includes('Files')
}

/**
 * Files dropped anywhere on the chat wait to go with the next message
 * (`dragBindings` on `main.sand-chat`); while they are over it the chat
 * shows `DropOverlay`. Words dragged into the field are the field's.
 */
export function useFileDrop(stage: (files: File[]) => void) {
  const [dropping, setDropping] = useState(false)
  const depth = useRef(0)
  const handlers = {
    onDragEnter: (event: React.DragEvent) => {
      if (!holdsFiles(event)) return
      event.preventDefault()
      depth.current += 1
      setDropping(true)
    },
    onDragOver: (event: React.DragEvent) => {
      if (!holdsFiles(event)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!holdsFiles(event)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDropping(false)
    },
    onDrop: (event: React.DragEvent) => {
      if (!holdsFiles(event)) return
      event.preventDefault()
      depth.current = 0
      setDropping(false)
      stage([...event.dataTransfer.files])
    },
  }
  return { dropping, handlers }
}

/**
 * Files dragged over the chat (`sand-chat-drop-overlay`): the window's blue
 * at 17% (32% on dark) over all of it, fading in over 0.12 s, and in its
 * middle "Drop files to add to chat" on a blue pill (padded 6 12, white).
 */
export function DropOverlay() {
  return (
    <div className="drop-overlay" aria-hidden="true">
      <span>{t('Drop files to add to chat')}</span>
    </div>
  )
}

/**
 * What a paste holds for the files waiting to go (`FieldTextView.files`):
 * its files; but Office, iWork and web pages put a picture of copied words
 * beside the words themselves (as rich text), and then the words win. A
 * screenshot or a copied picture has no words.
 */
export function pastedFiles(data: DataTransfer): File[] {
  const files = [...data.files]
  if (files.length === 0) return []
  const words = data.getData('text/plain')
  if (words.trim() !== '' && data.types.includes('text/html')) return []
  return files
}
