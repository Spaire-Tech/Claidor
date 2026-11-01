// Files, pictures and links in a chat (mac/Simeon/ChatPane.swift's
// `FileCard` and `FileIcon`, Cards.swift's `ChatPicture` and
// `LinkCardView`, Viewers.swift's `saveFile`): a file's card with its kind's
// icon, its size and Save, its name opening its preview (Viewers.tsx); a
// picture read from the agent's computer; a message that is one link drawn
// as a card.

import { type ReactNode, useEffect, useMemo, useState } from 'react'
import type { ChatImage } from '../core/chat'
import {
  downloadName,
  fileExtension,
  fileKind,
  opensPreview,
} from '../core/filePreview'
import { siteOf } from '../core/linkIcons'
import { fileTitle } from '../core/models'
import type { AppStore, FileFacts } from '../core/store'
import { t } from '../l10n'
import { useSiteIcon } from './MessageText'
import { previewShown, useOpenFile } from './Viewers'

/** The window's icons for Word, Excel, PowerPoint, PDF and Markdown (desktop/brand/file-icons, and the founder's Markdown page). Each written in full, so the build keeps it as a file. */
const fileIcons = {
  word: new URL(
    '../../../../../desktop/brand/file-icons/word.webp',
    import.meta.url,
  ).href,
  excel: new URL(
    '../../../../../desktop/brand/file-icons/excel.webp',
    import.meta.url,
  ).href,
  powerpoint: new URL(
    '../../../../../desktop/brand/file-icons/powerpoint.webp',
    import.meta.url,
  ).href,
  pdf: new URL(
    '../../../../../desktop/brand/file-icons/pdf.svg',
    import.meta.url,
  ).href,
  markdown: new URL(
    '../../../../../mac/Simeon/Assets.xcassets/FileIcons/markdown.imageset/markdown.svg',
    import.meta.url,
  ).href,
}

/** A file's kind as the window draws it (`FileIcon.asset`): none for any other file, drawn as a page. */
export function fileIcon(name: string): string | undefined {
  switch (fileExtension(name)) {
    case 'doc':
    case 'docx':
    case 'rtf':
      return fileIcons.word
    case 'xls':
    case 'xlsx':
    case 'csv':
      return fileIcons.excel
    case 'ppt':
    case 'pptx':
      return fileIcons.powerpoint
    case 'pdf':
      return fileIcons.pdf
    case 'md':
    case 'markdown':
    case 'mdx':
      return fileIcons.markdown
    default:
      return undefined
  }
}

/**
 * Save (`downloadAttachment`): the file read from the computer first
 * ("Couldn't save this file" when it can't be), then handed to the browser
 * as a download, named as the Electron app names it.
 */
export async function saveFile(
  store: AppStore,
  name: string,
  url: string,
  agentId: string,
): Promise<void> {
  const data = await store.readFile(url, agentId)
  if (!data) {
    window.alert(t("Couldn't save this file"))
    return
  }
  const address = URL.createObjectURL(new Blob([data as BlobPart]))
  const link = document.createElement('a')
  link.href = address
  link.download = downloadName(name, url)
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(address), 60_000)
}

/**
 * A file (`sand-file-card`): 220 to 340 wide (at most 76% of the chat, 460,
 * or the chat less 82), grey and 12 round like an agent's message, padded 8;
 * its kind's icon (36, 6 round), its name as a title (13, medium) over its
 * size (12, at 60%), and Save at the right. The size is read without waking
 * a computer that rests; Save wakes it.
 */
export function FileCard({
  name,
  url,
  agentId,
  store,
  column,
  startsGroup,
}: {
  name: string
  url: string
  agentId: string
  store: AppStore
  /** The messages' column. */
  column: number
  startsGroup: boolean
}) {
  const [meta, setMeta] = useState<{ url: string; facts: FileFacts }>()
  const openFile = useOpenFile()
  useEffect(() => {
    let live = true
    void store.fileFacts(url, false).then((facts) => {
      if (live) setMeta({ url, facts })
    })
    return () => {
      live = false
    }
  }, [store, url])
  const facts = meta?.url === url ? meta.facts : undefined
  const line = facts?.line ?? ''
  // The name opens the preview when the window would: never for a kind it can't show, and text, Markdown or JSON only once read as text.
  const opens =
    openFile != null &&
    previewShown(name) &&
    opensPreview(fileKind(name), facts?.readsAsText)
  const title = fileTitle(name)
  const limit = Math.max(0, Math.min(column * 0.76, 460, column - 82))
  const kind = fileIcon(name)
  return (
    <div
      className={startsGroup ? 'file-card starts-group' : 'file-card'}
      style={{ minWidth: Math.min(220, limit), maxWidth: Math.min(340, limit) }}
    >
      {kind ? (
        <img className="file-icon kind" src={kind} alt="" aria-hidden="true" />
      ) : (
        <span className="file-icon" aria-hidden="true" />
      )}
      <span className="file-words">
        {opens ? (
          <button
            type="button"
            className="file-title opens"
            title={name}
            aria-label={t`Open ${name}`}
            onClick={() => openFile({ name, url, agentId })}
          >
            {title}
          </button>
        ) : (
          <span className="file-title" title={name}>
            {title}
          </span>
        )}
        {line !== '' && <span className="file-meta">{line}</span>}
      </span>
      <button
        type="button"
        className="file-save"
        title={t`Save ${name}`}
        aria-label={t`Save ${name}`}
        onClick={() => void saveFile(store, name, url, agentId)}
      >
        <svg width="12" height="13" viewBox="0 0 12 13" aria-hidden="true">
          <path
            d="M6 1v7.5M2.8 5.5 6 8.7l3.2-3.2M1.5 11.5h9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  )
}

/** The picture's kind for the browser: an SVG is drawn only when named as one. */
function pictureType(url: string): string {
  return fileExtension(url) === 'svg' ? 'image/svg+xml' : ''
}

/**
 * A picture's address on screen (`ChatPicture`): the web's own; one the
 * person sent from this tab; or one read from the agent's computer, which a
 * computer that rests is waited for, not woken. None until it is read.
 */
export function useShownPicture(
  image: ChatImage,
  store: AppStore,
  agentId: string,
): string | undefined {
  const web = image.url.startsWith('https://')
  const sent = store.sentFile(image.url)
  const sentAddress = useMemo(
    () =>
      sent
        ? URL.createObjectURL(
            new Blob([sent.data as BlobPart], { type: pictureType(image.url) }),
          )
        : undefined,
    [sent, image.url],
  )
  useEffect(
    () => () => (sentAddress ? URL.revokeObjectURL(sentAddress) : undefined),
    [sentAddress],
  )
  const [read, setRead] = useState<{ url: string; address: string }>()
  useEffect(() => {
    if (web || sent) return
    let live = true
    let made: string | undefined
    void store.readFile(image.url, agentId, { wakes: false }).then((data) => {
      if (!live || !data) return
      made = URL.createObjectURL(
        new Blob([data as BlobPart], { type: pictureType(image.url) }),
      )
      setRead({ url: image.url, address: made })
    })
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [web, sent, store, image.url, agentId])
  if (web) return image.url
  if (sentAddress) return sentAddress
  return read?.url === image.url ? read.address : undefined
}

/**
 * A message that is one link, drawn as a card (`sand-link-card-wrap`, at
 * most 88% of the chat, 480, or the chat less 82): the ground, a 10% edge,
 * 18 round; the site's icon (20, 4 round; a globe until it comes, and for a
 * site without one) in a 60-point square, the site's name (13 on 18, 600)
 * and the address under it (12, 60%). It opens in a new tab. The page's own
 * title, which the Mac reads from the page, is not read: a browser can't
 * read another site, and asking Simeon's server would hand it the person's
 * links (docs/web-app/PROGRESS.md).
 */
export function LinkCard({
  link,
  column,
  bubbleId,
  children,
}: {
  link: string
  column: number
  bubbleId: string
  /** The hover bar, beside the card. */
  children?: ReactNode
}) {
  let host = link
  try {
    host = new URL(link).hostname || link
  } catch {
    // Not an address the browser reads: the link as written.
  }
  const width = Math.max(0, Math.min(column * 0.88, 480, column - 82))
  return (
    <div className="link-card-wrap" style={{ width }} data-bubble-id={bubbleId}>
      <a
        className="link-card"
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        title={link}
      >
        <span className="link-card-icon">
          <LinkIcon site={siteOf(link)} />
        </span>
        <span className="link-card-words">
          <span className="link-card-title">{host}</span>
          <span className="link-card-address">{link}</span>
        </span>
      </a>
      {children}
    </div>
  )
}

function LinkIcon({ site }: { site?: string }) {
  return site ? <SiteGlyph site={site} /> : <Globe />
}

/** The site's own icon once it has come; the globe meanwhile, and for a site without one. */
function SiteGlyph({ site }: { site: string }) {
  const [state, settle] = useSiteIcon(site)
  return (
    <>
      {state !== 'shown' && <Globe />}
      {state !== 'none' && (
        <img
          className={state === 'shown' ? 'link-site' : 'link-site coming'}
          src={`https://${site}/favicon.ico`}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          onLoad={(event) => settle(event.currentTarget.naturalWidth > 0)}
          onError={() => settle(false)}
        />
      )}
    </>
  )
}

function Globe() {
  return (
    <svg
      className="link-globe"
      width="15"
      height="15"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.1">
        <circle cx="8" cy="8" r="6.5" />
        <ellipse cx="8" cy="8" rx="2.8" ry="6.5" />
        <path d="M1.5 8h13M2.6 4.6h10.8M2.6 11.4h10.8" />
      </g>
    </svg>
  )
}
