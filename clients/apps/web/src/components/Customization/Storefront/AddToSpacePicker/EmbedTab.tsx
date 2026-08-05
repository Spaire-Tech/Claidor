'use client'

import { platformLogoUrl } from '@/components/Profile/linkPlatforms'
import { schemas } from '@spaire/client'
import { useEffect, useState } from 'react'
import { LinkDraft, LinkEditForm } from './LinkEditForm'
import {
  EMBED_PLATFORMS,
  EmbedPlatform,
  detectEmbedPlatform,
} from './platforms'

// Platform tile art. Shows the real .jpg brand logo from
// /public/<id>.jpg; until that file exists (or if it fails to load) it
// falls back to the inline SVG mark on the brand color, so the picker
// always renders something on-brand.
const PlatformArt = ({ platform }: { platform: EmbedPlatform }) => {
  const [failed, setFailed] = useState(false)
  const src = platformLogoUrl(platform.id)
  if (src && !failed) {
    return (
      <div className="wg-art" style={{ padding: 0, overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={platform.label}
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    )
  }
  return (
    <div className="wg-art" style={{ background: platform.bg }}>
      <platform.Icon style={{ fontSize: 22 }} />
    </div>
  )
}

export type EmbedPickPayload = {
  url: string
  platform: EmbedPlatform
  title: string | null
  description: string | null
  image_url: string | null
}

export const EmbedTab = ({
  organization,
  onPick,
}: {
  organization: schemas['Organization']
  onPick: (p: EmbedPickPayload) => void
}) => {
  const [picked, setPicked] = useState<EmbedPlatform | null>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState<'select' | 'paste' | 'edit'>('select')

  // Auto-fetched preview seeds the edit form. Some platforms don't
  // return useful oEmbed metadata; we still let the user submit a
  // clean URL with no auto-fill if the fetch fails.
  const [preview, setPreview] = useState<{
    title: string | null
    description: string | null
    image_url: string | null
  } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (stage !== 'paste' || !picked || !url.trim()) {
      setPreview(null)
      return
    }
    const candidate = /^https?:\/\//i.test(url.trim())
      ? url.trim()
      : `https://${url.trim()}`
    const detected = detectEmbedPlatform(candidate)
    if (!detected || detected.id !== picked.id) {
      setPreview(null)
      return
    }
    const controller = new AbortController()
    const handle = window.setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/link-preview?url=${encodeURIComponent(candidate)}`,
          { signal: controller.signal },
        )
        if (res.ok) {
          const meta = await res.json()
          setPreview({
            title: meta.title ?? null,
            description: meta.description ?? null,
            image_url: meta.image_url ?? null,
          })
        } else {
          setPreview({ title: null, description: null, image_url: null })
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setPreview(null)
      } finally {
        setLoading(false)
      }
    }, 350)
    return () => {
      controller.abort()
      window.clearTimeout(handle)
    }
  }, [stage, picked, url])

  // Stage 1 — pick a platform.
  if (stage === 'select') {
    return (
      <div className="wg-tab">
        <p className="wg-help">Pick a platform</p>
        <div className="wg-grid two embed">
          {EMBED_PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="wg-card"
              onClick={() => {
                setPicked(p)
                setUrl('')
                setError(null)
                setStage('paste')
              }}
            >
              <PlatformArt platform={p} />
              <div className="wg-meta">
                <div className="wg-card-title">{p.label}</div>
                <div className="wg-card-sub">{p.sub}</div>
              </div>
              <span className="wg-add-btn small ghost" aria-hidden>
                →
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Stage 2 — paste the URL.
  if (stage === 'paste' && picked) {
    const goToEdit = () => {
      const trimmed = url.trim()
      if (!trimmed) return
      const candidate = /^https?:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`
      const detected = detectEmbedPlatform(candidate)
      if (!detected || detected.id !== picked.id) {
        setError(`That doesn't look like a ${picked.label} URL.`)
        return
      }
      setError(null)
      setStage('edit')
    }

    return (
      <div className="wg-tab">
        <button
          type="button"
          className="wg-back"
          onClick={() => {
            setPicked(null)
            setUrl('')
            setError(null)
            setStage('select')
          }}
        >
          ← All platforms
        </button>
        <div className="wg-card" style={{ cursor: 'default', marginTop: 8 }}>
          <PlatformArt platform={picked} />
          <div className="wg-meta">
            <div className="wg-card-title">{picked.label}</div>
            <div className="wg-card-sub">
              {picked.sub}
              {!picked.canEmbed && ' · renders as a stylized link card'}
            </div>
          </div>
        </div>
        <div className="wg-input-pill" style={{ marginTop: 14 }}>
          <input
            autoFocus
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') goToEdit()
            }}
            placeholder={`Paste a ${picked.label} URL`}
          />
          <button
            type="button"
            className="wg-add-btn"
            disabled={!url.trim()}
            onClick={goToEdit}
            aria-label="Continue"
          >
            →
          </button>
        </div>
        {loading && (
          <p className="wg-help" style={{ marginTop: 10 }}>
            Fetching preview…
          </p>
        )}
        {error && (
          <p className="wg-help" style={{ color: '#b00020' }}>
            {error}
          </p>
        )}
      </div>
    )
  }

  // Stage 3 — edit form.
  if (stage === 'edit' && picked) {
    const candidate = /^https?:\/\//i.test(url.trim())
      ? url.trim()
      : `https://${url.trim()}`
    const initial: LinkDraft = {
      url: candidate,
      title: preview?.title ?? picked.label,
      description: preview?.description ?? '',
      image_url: preview?.image_url ?? null,
    }
    return (
      <LinkEditForm
        organization={organization}
        initial={initial}
        ctaLabel="Embed in Space"
        onBack={() => setStage('paste')}
        onSubmit={(draft) =>
          onPick({
            url: draft.url,
            platform: picked,
            title: draft.title || null,
            description: draft.description || null,
            image_url: draft.image_url,
          })
        }
      />
    )
  }

  return null
}
