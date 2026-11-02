// A PDF in the preview (mac/Simeon/FileBodies.swift's `PDFControl`,
// `PDFToolbar` and `PDFBody`): its pages drawn by pdf.js 5.4.296, the
// window's own copy of the library, loaded with the first PDF.

import type {
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
  TextLayer,
} from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'
import { t } from '../l10n'

/** The zoom over fitting the width: 0.5 to 4, a quarter a step (`PDFControl`). */
export const zoomStep = 0.25
export const clampZoom = (zoom: number) => Math.min(4, Math.max(0.5, zoom))

export interface PDFState {
  zoom: number
  page: number
  pages: number
}

type PDFModule = typeof import('pdfjs-dist')
let loading: Promise<PDFModule> | undefined

/** pdf.js and its worker, read once, when the first PDF opens. */
function pdfjs(): Promise<PDFModule> {
  loading ??= Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]).then(([module, worker]) => {
    module.GlobalWorkerOptions.workerSrc = worker.default
    return module
  })
  return loading
}

/** The PDF's controls in the head (`sand-file-viewer__toolbar`, 8 apart): Zoom out, "1 / 2" (11, at 60%), Zoom in. */
export function PDFToolbar({
  state,
  zoom,
}: {
  state: PDFState
  zoom: (delta: number) => void
}) {
  return (
    <div className="pdf-toolbar">
      <button
        type="button"
        className="pdf-tool"
        title={t('Zoom out')}
        aria-label={t('Zoom out')}
        disabled={state.zoom <= 0.5}
        onClick={() => zoom(-zoomStep)}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          >
            <circle cx="5" cy="5" r="3.5" />
            <path d="M3.3 5h3.4M7.6 7.6 10.5 10.5" />
          </g>
        </svg>
      </button>
      <span className="pdf-pages">{`${state.page} / ${state.pages}`}</span>
      <button
        type="button"
        className="pdf-tool"
        title={t('Zoom in')}
        aria-label={t('Zoom in')}
        disabled={state.zoom >= 4}
        onClick={() => zoom(zoomStep)}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          >
            <circle cx="5" cy="5" r="3.5" />
            <path d="M3.3 5h3.4M5 3.3v3.4M7.6 7.6 10.5 10.5" />
          </g>
        </svg>
      </button>
    </div>
  )
}

/**
 * A PDF's pages (`sand-pdf-page`): one under another, 16 apart, as wide as
 * the panel less 32 times the zoom, each with its number at its foot (11,
 * white at 90%, on black at 55%, 8 up). Pages are drawn as they come near
 * the view; their words can be chosen and copied (pdf.js's text layer).
 */
export function PDFBody({
  data,
  zoom,
  onPages,
  onPage,
  onFailure,
}: {
  data: Uint8Array
  zoom: number
  onPages: (pages: number) => void
  onPage: (page: number) => void
  onFailure: () => void
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy>()
  const [sizes, setSizes] = useState<{ width: number; height: number }[]>([])
  const [width, setWidth] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    let opened: PDFDocumentProxy | undefined
    void pdfjs()
      .then(async (module) => {
        // pdf.js takes the bytes it is given: it gets its own copy.
        opened = await module.getDocument({
          data: data.slice(),
          isEvalSupported: false,
        }).promise
        const pages: { width: number; height: number }[] = []
        for (let index = 1; index <= opened.numPages; index += 1) {
          const viewport = (await opened.getPage(index)).getViewport({
            scale: 1,
          })
          pages.push({ width: viewport.width, height: viewport.height })
        }
        if (!live) return
        setSizes(pages)
        setDoc(opened)
        onPages(opened.numPages)
      })
      .catch(() => {
        if (live) onFailure()
      })
    return () => {
      live = false
      void opened?.destroy()
    }
    // The document is read once for its bytes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const seen = new ResizeObserver(() => setWidth(element.clientWidth))
    seen.observe(element)
    return () => seen.disconnect()
  }, [])

  // The window's scale: the panel's width less 32 over the first page's, a quarter to four, times the zoom.
  const first = sizes[0]
  const base =
    first && width > 32
      ? Math.min(4, Math.max(0.25, (width - 32) / first.width))
      : 1
  const scale = base * zoom

  return (
    <div
      ref={scroller}
      className="pdf-body"
      onScroll={(event) => {
        // The page at the middle of the view is the one shown.
        const box = event.currentTarget
        const middle = box.scrollTop + box.clientHeight / 2
        let top = 8
        for (let index = 0; index < sizes.length; index += 1) {
          const height = sizes[index]!.height * scale
          if (middle < top + height + 8) {
            onPage(index + 1)
            return
          }
          top += height + 16
        }
      }}
    >
      {doc &&
        sizes.map((size, index) => (
          <PDFPage
            key={index}
            doc={doc}
            number={index + 1}
            width={size.width * scale}
            height={size.height * scale}
            scale={scale}
            root={scroller}
          />
        ))}
    </div>
  )
}

function PDFPage({
  doc,
  number,
  width,
  height,
  scale,
  root,
}: {
  doc: PDFDocumentProxy
  number: number
  width: number
  height: number
  scale: number
  root: React.RefObject<HTMLDivElement | null>
}) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const words = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)

  useEffect(() => {
    const element = box.current
    if (!element) return
    const seen = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true)
      },
      { root: root.current, rootMargin: '800px 0px' },
    )
    seen.observe(element)
    return () => seen.disconnect()
  }, [root])

  useEffect(() => {
    if (!near) return
    let live = true
    let task: RenderTask | undefined
    let layer: TextLayer | undefined
    void (async () => {
      const module = await pdfjs()
      const page: PDFPageProxy = await doc.getPage(number)
      if (!live || !canvas.current || !words.current) return
      const viewport = page.getViewport({ scale })
      const ratio = window.devicePixelRatio || 1
      const surface = canvas.current
      surface.width = Math.floor(viewport.width * ratio)
      surface.height = Math.floor(viewport.height * ratio)
      const context = surface.getContext('2d')
      if (!context) return
      task = page.render({
        canvas: surface,
        canvasContext: context,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      })
      await task.promise.catch(() => undefined)
      if (!live) return
      words.current.replaceChildren()
      layer = new module.TextLayer({
        textContentSource: page.streamTextContent(),
        container: words.current,
        viewport,
      })
      await layer.render().catch(() => undefined)
    })()
    return () => {
      live = false
      task?.cancel()
      layer?.cancel()
    }
  }, [near, doc, number, scale])

  return (
    <div
      ref={box}
      className="pdf-page"
      style={
        {
          width,
          height,
          '--total-scale-factor': scale,
          '--scale-round-x': '1px',
          '--scale-round-y': '1px',
        } as React.CSSProperties
      }
    >
      <canvas ref={canvas} className="pdf-canvas" />
      <div ref={words} className="textLayer" />
      <span className="pdf-badge">{number}</span>
    </div>
  )
}
