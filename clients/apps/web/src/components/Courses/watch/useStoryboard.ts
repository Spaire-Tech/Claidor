'use client'

// Mux storyboard support for hover-scrub thumbnails.
//
// Mux auto-generates a storyboard for every asset: one sprite sheet of
// frames plus a WebVTT file mapping time ranges to crop regions of that
// sheet (`storyboard.jpg#xywh=x,y,w,h`). The hook fetches and parses the
// VTT once per lesson; the player looks a cue up by time while the viewer
// hovers or drags the scrub bar.

import { useEffect, useState } from 'react'

export type StoryboardCue = {
  start: number
  end: number
  url: string
  x: number
  y: number
  w: number
  h: number
}

// "HH:MM:SS.mmm" | "MM:SS.mmm" → seconds
function parseTimestamp(ts: string): number | null {
  const m = ts.trim().match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/)
  if (!m) return null
  return (
    Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
  )
}

// Resolve a cue's image reference against the VTT URL, carrying the signed
// token over. For signed playback the VTT is fetched with an 's'-audience
// token that also authorizes the sprite image — but the reference inside
// the VTT body doesn't include it, so an unsigned image URL would 403.
function resolveImageUrl(ref: string, vttUrl: string): string | null {
  let resolved: URL
  try {
    resolved = new URL(ref, vttUrl)
  } catch {
    // A blob:/data: VTT can't be a base for relative refs — absolute only.
    try {
      resolved = new URL(ref)
    } catch {
      return null
    }
  }
  try {
    const token = new URL(vttUrl).searchParams.get('token')
    if (token && !resolved.searchParams.get('token')) {
      resolved.searchParams.set('token', token)
    }
  } catch {
    /* non-hierarchical vtt URL (blob:) — no token to inherit */
  }
  return resolved.toString()
}

export function parseStoryboardVtt(
  text: string,
  vttUrl: string,
): StoryboardCue[] {
  const cues: StoryboardCue[] = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const arrow = lines[i].split('-->')
    if (arrow.length !== 2) continue
    const start = parseTimestamp(arrow[0])
    // Trailing cue settings (e.g. "align:middle") sit after the timestamp.
    const end = parseTimestamp(arrow[1].trim().split(/\s+/)[0])
    if (start == null || end == null) continue
    // The payload is the next non-empty line: "<image-url>#xywh=x,y,w,h"
    let payload = ''
    for (let j = i + 1; j < lines.length && lines[j].trim() !== ''; j++) {
      payload = lines[j].trim()
      i = j
    }
    const hash = payload.match(/^(.*)#xywh=(\d+),(\d+),(\d+),(\d+)$/)
    if (!hash) continue
    const url = resolveImageUrl(hash[1], vttUrl)
    if (!url) continue
    cues.push({
      start,
      end,
      url,
      x: Number(hash[2]),
      y: Number(hash[3]),
      w: Number(hash[4]),
      h: Number(hash[5]),
    })
  }
  return cues
}

export function cueAt(
  cues: StoryboardCue[] | null,
  t: number,
): StoryboardCue | null {
  if (!cues || cues.length === 0) return null
  return (
    cues.find((c) => t >= c.start && t < c.end) ??
    // Past the last cue's end (or before the first start) — clamp.
    (t >= cues[cues.length - 1].end ? cues[cues.length - 1] : cues[0])
  )
}

// Fetch + parse a storyboard VTT. Returns null while loading, on error, or
// when no URL is given — the player falls back to a time-only preview.
export function useStoryboard(
  url: string | null | undefined,
): StoryboardCue[] | null {
  // Result is keyed by the URL it was parsed from, so switching lessons
  // never shows the previous lesson's frames while the new VTT loads.
  const [result, setResult] = useState<{
    url: string
    cues: StoryboardCue[]
  } | null>(null)
  useEffect(() => {
    if (!url) return
    let cancelled = false
    fetch(url)
      .then((res) => (res.ok ? res.text() : Promise.reject(res.status)))
      .then((text) => {
        if (cancelled) return
        const parsed = parseStoryboardVtt(text, url)
        if (parsed.length > 0) setResult({ url, cues: parsed })
      })
      .catch(() => {
        // Storyboard is progressive enhancement — a missing or still-
        // generating one must never break scrubbing.
      })
    return () => {
      cancelled = true
    }
  }, [url])
  return url && result?.url === url ? result.cues : null
}
