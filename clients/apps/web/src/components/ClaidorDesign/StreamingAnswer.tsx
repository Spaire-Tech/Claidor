'use client'

import React, {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { mdCleanLines, mdLite } from './mdlite'

/**
 * Smooth streaming for live answers.
 *
 * The network delivers text in irregular chunks; rendering them directly
 * reads as stutter, and driving the reveal through the app's root
 * component re-rendered every view in the product 33 times a second. This
 * component owns the whole problem instead:
 *
 * - a buffer drained at a steady pace on requestAnimationFrame, draining
 *   faster when the network runs ahead so it never falls behind;
 * - word-level reveal — each new word fades in and rises 3px over ~300ms,
 *   a wave rather than a typewriter (disabled under
 *   prefers-reduced-motion, where words appear instantly);
 * - incremental rendering — finished paragraphs are memoized and never
 *   re-render, only the growing tail block does;
 * - only this subtree updates per frame; the rest of the app renders on
 *   chunk boundaries at most.
 *
 * Citations are not this component's concern by design: the host holds
 * source cards until the answer completes — sources trickling in while
 * the lawyer reads would undercut the claim that they were verified.
 */

/** Imperative text buffer shared between the SSE callbacks and the UI. */
export class TextStream {
  text = ''
  networkDone = false

  push(delta: string) {
    this.text += delta
  }

  finish() {
    this.networkDone = true
  }
}

/** Base drain rate; catch-up scales with backlog so we never lag. */
const BASE_CHARS_PER_SECOND = 55
const MAX_CHARS_PER_SECOND = 400

const FinishedBlock = memo(function FinishedBlock({ text }: { text: string }) {
  return <p style={{ margin: '0 0 12px' }}>{mdLite(text)}</p>
})

/** The still-growing tail: words wrapped in fade-in spans. */
const TailBlock = ({ text }: { text: string }) => {
  const cleaned = mdCleanLines(text)
  const source = typeof cleaned === 'string' ? cleaned : text
  const parts = source.split(/\*\*([^*]+)\*\*/g)
  let wordKey = 0
  const renderWords = (chunk: string) =>
    chunk.split(/(\s+)/).map((piece) =>
      /^\s*$/.test(piece) ? (
        piece
      ) : (
        <span key={wordKey++} className="claidor-word">
          {piece}
        </span>
      ),
    )
  return (
    <p style={{ margin: '0 0 12px' }}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={'s' + i}>{renderWords(part)}</strong>
        ) : (
          <React.Fragment key={'f' + i}>{renderWords(part)}</React.Fragment>
        ),
      )}
    </p>
  )
}

export const StreamingAnswer = memo(
  function StreamingAnswer({
    stream,
    onDrained,
    onGrow,
  }: {
    stream: TextStream
    /** Fired once, when every buffered character has been revealed. */
    onDrained: () => void
    /** Fired on frames that revealed text — the host keeps scroll pinned. */
    onGrow: () => void
  }) {
    const [revealed, setRevealed] = useState(0)
    const drainedRef = useRef(false)
    const callbacksRef = useRef({ onDrained, onGrow })
    callbacksRef.current = { onDrained, onGrow }

    useEffect(() => {
      const reduced = window.matchMedia?.(
        '(prefers-reduced-motion: reduce)',
      )?.matches
      let raf = 0
      let last = performance.now()
      const tick = (now: number) => {
        const elapsed = (now - last) / 1000
        last = now
        setRevealed((current) => {
          const target = stream.text.length
          if (current >= target) {
            if (stream.networkDone && !drainedRef.current) {
              drainedRef.current = true
              // Defer: never call back into the host mid-render.
              setTimeout(() => callbacksRef.current.onDrained(), 0)
            }
            return current
          }
          const backlog = target - current
          const rate = reduced
            ? Number.POSITIVE_INFINITY
            : Math.min(
                MAX_CHARS_PER_SECOND,
                BASE_CHARS_PER_SECOND + backlog / 3,
              )
          const step =
            rate === Number.POSITIVE_INFINITY
              ? backlog
              : Math.max(1, Math.round(rate * elapsed))
          callbacksRef.current.onGrow()
          return Math.min(target, current + step)
        })
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(raf)
    }, [stream])

    const visible = stream.text.slice(0, revealed)
    const blocks = useMemo(() => visible.split(/\n\n+/), [visible])

    return (
      <>
        {blocks.map((block, i) =>
          i < blocks.length - 1 ? (
            <FinishedBlock key={i} text={block} />
          ) : (
            <TailBlock key={i} text={block} />
          ),
        )}
        {revealed < stream.text.length || !stream.networkDone ? (
          <span className="claidor-cursor" />
        ) : null}
      </>
    )
  },
  (prev, next) => prev.stream === next.stream,
)
