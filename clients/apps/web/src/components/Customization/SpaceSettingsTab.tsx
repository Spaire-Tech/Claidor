'use client'

// Settings tab for the Space editor.
//
// Styled to match the Community hub's settings surface 1:1 — same
// `.spaire-hub` grouped-list design system (cards, rows, toggles, sliding-pill
// segmented controls) and the same light/dark palette (dark comes for free via
// `.spaire-hub.dark`). We reuse Community's Toggle/Seg atoms and hub.css so the
// look stays in lockstep with that surface.
//
// Reads + writes via the surrounding react-hook-form context (same as the
// canvas inline editors), so the Publish button stays in sync.

import { storefrontLink } from '@/utils/nav'
import { schemas } from '@spaire/client'
import { useCallback, useEffect, useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { Field, Seg, Toggle } from '../Community/hub/atoms'
import '../Community/hub/hub.css'
import './SpaceSettingsTab.css'

type Settings = NonNullable<schemas['OrganizationStorefrontSettings']>

/** Text input that commits on blur / Enter (matches the Community settings),
 *  so we don't churn form state on every keystroke. */
function CommitInput({
  value,
  onCommit,
  placeholder,
  maxLength,
}: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  maxLength?: number
}) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <input
      className="input seo-box"
      value={v}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

/** Multi-line variant of CommitInput. */
function CommitTextarea({
  value,
  onCommit,
  placeholder,
  maxLength,
}: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  maxLength?: number
}) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <textarea
      className="input seo-box"
      value={v}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={3}
      style={{ width: '100%', resize: 'vertical', minHeight: 84 }}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
    />
  )
}

type DisplayToggle = {
  key: keyof Settings
  label: string
  hint: string
  def: boolean
}

const DISPLAY_TOGGLES: DisplayToggle[] = [
  {
    key: 'show_header',
    label: 'Cover image',
    hint: 'Show the banner across the top of your Space',
    def: true,
  },
  {
    key: 'show_logo',
    label: 'Profile photo',
    hint: 'Show your avatar on the profile card',
    def: true,
  },
  {
    key: 'show_name',
    label: 'Name',
    hint: 'Show your display name',
    def: true,
  },
  {
    key: 'show_description',
    label: 'Description',
    hint: 'Show the short bio under your name',
    def: true,
  },
  {
    key: 'show_product_details',
    label: 'Product details',
    hint: 'Show name and price on each product',
    def: true,
  },
  {
    key: 'show_card_products',
    label: 'Product images in card',
    hint: 'Show product thumbnails inside the profile card',
    def: true,
  },
]

/** Label + hint on the left, a control on the right — the Community row. */
function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="grow">
      <div className="grow-main">
        <div className="gl">{label}</div>
        {hint && <div className="gs">{hint}</div>}
      </div>
      <div className="grow-ctl">{children}</div>
    </div>
  )
}

export const SpaceSettingsTab = ({
  organization,
  dark,
  onOpenLinks,
}: {
  organization: schemas['Organization']
  dark: boolean
  onOpenLinks: () => void
}) => {
  const { watch, setValue } = useFormContext<schemas['OrganizationUpdate']>()
  const watched = watch()
  const settings = (watched.storefront_settings ??
    organization.storefront_settings ??
    {}) as Settings

  const updateSetting = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setValue(
        'storefront_settings',
        { ...settings, [key]: value },
        { shouldDirty: true },
      )
    },
    [settings, setValue],
  )

  const isEnabled = settings.enabled ?? false
  const theme = settings.theme ?? 'light'
  const thumbnailSize = settings.thumbnail_size ?? 'large'

  const spaceUrl = storefrontLink(organization).replace(/\/$/, '')
  const [copied, setCopied] = useState(false)
  const copyLink = () => {
    navigator.clipboard.writeText(spaceUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Confirm-before-disable, mirroring the editor's enable flow.
  const handleEnabledChange = (next: boolean) => {
    if (!next && isEnabled) {
      if (
        !window.confirm(
          'Disable your Space? Your public URL will return 404 to visitors until you re-enable it.',
        )
      ) {
        return
      }
    }
    updateSetting('enabled', next)
  }

  return (
    <div
      className={`spaire-hub${dark ? 'dark' : ''}`}
      style={{ background: 'var(--bg)', minHeight: '100%' }}
    >
      <div
        style={{ maxWidth: 760, margin: '0 auto', padding: '28px 24px 96px' }}
      >
        <div className="cr-head">
          <div>
            <div className="h">Settings</div>
            <div className="s">
              Control who can see your Space, how it looks, and what it shows.
            </div>
          </div>
        </div>

        {/* Visibility */}
        <div className="glist-label">Visibility</div>
        <div className="card glist" style={{ marginBottom: 26 }}>
          <Row
            label="Enable your Space"
            hint="Publish your Space to make it reachable at your public URL"
          >
            <Toggle
              on={isEnabled}
              onClick={() => handleEnabledChange(!isEnabled)}
            />
          </Row>
          {isEnabled && (
            <Row label="Public URL" hint={spaceUrl}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-quiet btn-sm" onClick={copyLink}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <a
                  className="btn btn-quiet btn-sm"
                  href={spaceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open
                </a>
              </div>
            </Row>
          )}
        </div>

        {/* Appearance */}
        <div className="glist-label">Appearance</div>
        <div className="card glist" style={{ marginBottom: 26 }}>
          <Row label="Theme">
            <Seg
              value={theme === 'dark' ? 'Dark' : 'Light'}
              options={['Light', 'Dark']}
              onChange={(v) =>
                updateSetting('theme', v === 'Dark' ? 'dark' : 'light')
              }
            />
          </Row>
        </div>

        {/* Search & sharing (SEO) */}
        <div className="glist-label">Search &amp; sharing</div>
        <div className="card form-card" style={{ marginBottom: 14 }}>
          <Field label="SEO title">
            <CommitInput
              value={settings.meta_title ?? ''}
              placeholder={`${organization.name} — Courses`}
              maxLength={70}
              onCommit={(v) => updateSetting('meta_title', v.trim() || null)}
            />
          </Field>
          <Field label="SEO description">
            <CommitTextarea
              value={settings.meta_description ?? ''}
              placeholder="A short, compelling summary of your Space."
              maxLength={200}
              onCommit={(v) =>
                updateSetting('meta_description', v.trim() || null)
              }
            />
          </Field>
        </div>
        <div className="card glist" style={{ marginBottom: 26 }}>
          <Row
            label="Search engine indexing"
            hint="Let search engines list your Space in their results"
          >
            <Toggle
              on={settings.index ?? true}
              onClick={() => updateSetting('index', !(settings.index ?? true))}
            />
          </Row>
        </div>

        {/* Display */}
        <div className="glist-label">Display</div>
        <div className="card glist" style={{ marginBottom: 26 }}>
          {DISPLAY_TOGGLES.map(({ key, label, hint, def }) => {
            const current = (settings[key] as boolean | undefined) ?? def
            return (
              <Row label={label} hint={hint} key={key as string}>
                <Toggle
                  on={current}
                  onClick={() =>
                    updateSetting(key, !current as Settings[typeof key])
                  }
                />
              </Row>
            )
          })}
          <Row
            label="Thumbnail size"
            hint="How large product images appear on your Space"
          >
            <Seg
              value={thumbnailSize[0].toUpperCase() + thumbnailSize.slice(1)}
              options={['Small', 'Medium', 'Large']}
              onChange={(v) =>
                updateSetting(
                  'thumbnail_size',
                  v.toLowerCase() as Settings['thumbnail_size'],
                )
              }
            />
          </Row>
        </div>

        {/* Blocks */}
        <div className="glist-label">Blocks</div>
        <div className="card glist" style={{ marginBottom: 26 }}>
          <Row
            label="Links &amp; embeds"
            hint="Manage the links and embeds shown on your Space"
          >
            <button className="btn btn-quiet btn-sm" onClick={onOpenLinks}>
              Manage
            </button>
          </Row>
        </div>
      </div>
    </div>
  )
}
