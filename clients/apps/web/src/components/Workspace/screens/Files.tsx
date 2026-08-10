'use client'

/**
 * Data room — the files in the deal, and the way to add one.
 *
 * A row is an icon, a name and a date. Nothing else: the count lives in
 * the line under the heading, and a file that failed to read says so
 * where its date would be, because that is the one thing a person has to
 * act on.
 *
 * The whole panel is the drop target, not a dashed rectangle. A banker
 * dragging a model at the screen should not have to aim, and a dashed box
 * sitting there permanently is a piece of furniture that says « empty »
 * on a screen that is usually full. The border appears while something is
 * over it and goes away again.
 *
 * **One row per document, not per version**, and the server folds them:
 * re-uploading the deck six times is one deck, not six files. The version
 * number on a row means « there are this many », which is the only place
 * that history is worth a glance.
 *
 * **It pages, and it searches on the server.** A real data room is
 * thousands of files. Folding versions in the browser meant holding every
 * artifact in the deal — 1.07 MB at three thousand — and then drawing a
 * hundred of them; and a client that pages *and* folds cannot say how many
 * documents there really are. Both now come back with the page.
 */

import { useEffect, useRef, useState } from 'react'

import type { Artifact } from '../api'
import { Nothing, Search } from '../Dense'
import { colour, size } from '../design'

const ICON: Record<string, string> = {
  '.pptx': '/icons/powerpoint.webp',
  '.pptm': '/icons/powerpoint.webp',
  '.xlsx': '/icons/excel.webp',
  '.xlsm': '/icons/excel.webp',
  '.xls': '/icons/excel.webp',
  '.xlt': '/icons/excel.webp',
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

/**
 * What the right-hand column says.
 *
 * A failed file is the interesting case: it keeps its place in the list
 * and says so, because the server's sentence is the only thing that tells
 * the person what to do — « this .xls is password protected », not
 * « upload failed ».
 */
function status(artifact: Artifact): { text: string; ink: string } {
  if (artifact.status === 'failed')
    return { text: 'could not be read', ink: colour.critical }
  if (artifact.status === 'processing')
    return { text: 'reading…', ink: colour.faint }
  if (artifact.status === 'uploading')
    return { text: 'uploading…', ink: colour.faint }
  return { text: shortDate(artifact.uploaded_at), ink: colour.fainter }
}

/** One page, and one more each time the reader reaches the end of it. */
const PAGE = 100

/** How long a keystroke waits before it becomes a request. */
const SETTLE = 220

export function Files({
  fetch: fetchPage,
  reloadOn,
  deal,
  onOpen,
  onUpload,
  uploading,
  problem,
}: {
  /** One page of the room. The screen never holds the whole of it. */
  fetch: (options: {
    q: string
    limit: number
    offset: number
  }) => Promise<{ items: Artifact[]; total: number }>
  /** Changes when an upload lands, so the list refetches from the top. */
  reloadOn: unknown
  deal: string
  onOpen: (artifact: Artifact) => void
  onUpload: (files: FileList) => void
  /** Names of files currently being read, shown as rows before they exist. */
  uploading: string[]
  /** A file this cannot read at all — a .txt. Not a state of the deal. */
  problem: string | null
}) {
  const [over, setOver] = useState(false)
  const [query, setQuery] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const [shown, setShown] = useState<Artifact[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // A real data room is thousands of files, so the name is the only way
  // in — and the search runs on the server, because the point of paging
  // is that the browser never has the rest to look through. Debounced:
  // a request per keystroke over a room this size is a request per
  // keystroke nobody reads the answer to.
  useEffect(() => {
    let live = true
    const timer = setTimeout(() => {
      if (!live) return
      // Set here rather than in the effect body: during the debounce
      // nothing is loading yet, and a spinner that appears on the first
      // keystroke and stays for every one after is worse than none.
      setLoading(true)
      void fetchPage({ q: query.trim(), limit: PAGE, offset: 0 })
        .then((page) => {
          if (!live) return
          setShown(page.items)
          setTotal(page.total)
        })
        .finally(() => live && setLoading(false))
    }, query ? SETTLE : 0)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [fetchPage, query, reloadOn])

  const more = () => {
    void fetchPage({ q: query.trim(), limit: PAGE, offset: shown.length }).then(
      (page) => {
        setShown((was) => [...was, ...page.items])
        setTotal(page.total)
      },
    )
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        outline: over ? `2px solid ${colour.blue}` : '2px solid transparent',
        outlineOffset: -2,
        borderRadius: 18,
        transition: 'outline-color .12s ease',
      }}
      onDragOver={(event) => {
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={(event) => {
        // Only when it truly left the panel, not on every child crossing.
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setOver(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setOver(false)
        if (event.dataTransfer.files.length) onUpload(event.dataTransfer.files)
      }}
    >
      <div
        style={{
          flex: '0 0 auto',
          padding: '24px 26px 18px',
          display: 'flex',
          alignItems: 'baseline',
          gap: 16,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
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
            {/* While a search is on, the number is what matches — and it
                says « matching » rather than « files », because « Project
                Cascade · 3 files » under a search box reads as a fact
                about the deal rather than about the query. */}
            {deal} · {total.toLocaleString()}{' '}
            {query.trim()
              ? 'matching'
              : total === 1
                ? 'file'
                : 'files'}
          </div>
        </div>
        <button
          onClick={() => picker.current?.click()}
          style={{
            border: 0,
            background: 'transparent',
            padding: 0,
            font: 'inherit',
            fontSize: 13,
            color: colour.blue,
            cursor: 'pointer',
          }}
        >
          Add files
        </button>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files?.length) onUpload(event.target.files)
            event.target.value = ''
          }}
        />
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: '0 12px 20px',
        }}
      >
        {(total > 8 || query) && (
          <div style={{ padding: '0 14px 14px' }}>
            <Search
              value={query}
              onChange={setQuery}
              placeholder="Search files"
            />
          </div>
        )}

        {problem && (
          <div
            style={{
              fontSize: size.meta,
              color: colour.critical,
              padding: '0 14px 12px',
              lineHeight: 1.6,
            }}
          >
            {problem}
          </div>
        )}

        {/* A file being read has a row before it has an id, so the list
            never jumps when the upload lands. */}
        {uploading.map((name) => (
          <div
            key={`pending-${name}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '12px 14px',
              animation: 'pcDim 1.4s ease-in-out infinite',
            }}
          >
            <img
              src={iconFor(name)}
              alt=""
              style={{
                width: 18,
                height: 18,
                objectFit: 'contain',
                flex: '0 0 18px',
              }}
            />
            <span style={{ flex: 1, fontSize: 14, color: colour.ink }}>
              {name}
            </span>
            <span style={{ fontSize: size.small, color: colour.faint }}>
              reading…
            </span>
          </div>
        ))}

        {total === 0 && !query && !loading && uploading.length === 0 && !problem && (
          <div style={{ padding: '0 14px' }}>
            <Nothing>
              Nothing here yet. Drop a model and a deck anywhere on this panel
              and the checks can run.
            </Nothing>
          </div>
        )}

        {shown.length === 0 && query !== '' && !loading && (
          <div style={{ padding: '0 14px' }}>
            <Nothing>No file here is called that.</Nothing>
          </div>
        )}

        {shown.map((artifact) => {
          const state = status(artifact)
          return (
            <div key={artifact.id}>
              <button
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
                  style={{
                    width: 18,
                    height: 18,
                    objectFit: 'contain',
                    flex: '0 0 18px',
                  }}
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
                  {artifact.version > 1 && (
                    <span style={{ color: colour.fainter }}>
                      {' '}
                      · v{artifact.version}
                    </span>
                  )}
                </span>
                <span
                  style={{
                    flex: '0 0 auto',
                    fontSize: size.small,
                    color: state.ink,
                  }}
                >
                  {state.text}
                </span>
              </button>

              {/* The server's own sentence, which is written to be read by
                  the person who uploaded the file. */}
              {artifact.status === 'failed' && artifact.error && (
                <div
                  style={{
                    fontSize: size.small,
                    color: colour.muted,
                    padding: '0 14px 12px 46px',
                    lineHeight: 1.6,
                    maxWidth: '68ch',
                  }}
                >
                  {artifact.error}
                </div>
              )}
            </div>
          )
        })}

        {/* What is drawn against what exists, and a way to the rest. A
            button rather than the workspace's scroll sentinel: each page
            is a request now, and a list that fetches because a reader
            scrolled past the end keeps fetching while they look for the
            bottom. */}
        {shown.length < total && (
          <div style={{ padding: '14px 14px 4px' }}>
            <span style={{ fontSize: size.small, color: colour.fainter }}>
              showing {shown.length.toLocaleString()} of {total.toLocaleString()}
              {' — '}
            </span>
            <button
              onClick={more}
              style={{
                border: 0,
                background: 'transparent',
                padding: 0,
                font: 'inherit',
                fontSize: size.small,
                color: colour.blue,
                cursor: 'pointer',
              }}
            >
              show more
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
