'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'

// Lightweight extension of the customer portal's authenticated-customer
// shape with the `avatar_url` we added server-side. The generated
// `@spaire/client` schemas don't know about it until `pnpm generate`
// is rerun, so we type it locally and cast at the call sites.
export type CustomerWithProfile = {
  id?: string
  name?: string | null
  email?: string
  avatar_url?: string | null
}

// Shared form-only fragment. Used by both the first-sign-in onboarding
// modal and the Settings dropdown's edit modal so the two surfaces
// stay visually identical.
function ProfileForm({
  initialName,
  initialAvatarUrl,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
  showCancel,
}: {
  initialName: string
  initialAvatarUrl: string | null
  onSubmit: (next: { name: string; avatar_url: string | null }) => void
  onCancel?: () => void
  submitting: boolean
  submitLabel: string
  showCancel: boolean
}) {
  const [name, setName] = React.useState(initialName)
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(
    initialAvatarUrl,
  )
  const [error, setError] = React.useState<string | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const onPick = (file: File | null) => {
    setError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Pick an image file.')
      return
    }
    // Down-rez the image client-side to a ~256px square data URL so
    // the column stays under a few KB. Customer avatars don't need
    // S3 today — the data URL inlines straight into the JSON
    // payload.
    const img = new Image()
    const reader = new FileReader()
    reader.onload = () => {
      img.onload = () => {
        const size = 256
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          setError('Image processing failed.')
          return
        }
        // Cover-fit: scale the shorter side to 256 and center-crop.
        const scale = Math.max(size / img.width, size / img.height)
        const dw = img.width * scale
        const dh = img.height * scale
        ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh)
        const out = canvas.toDataURL('image/jpeg', 0.85)
        setAvatarUrl(out)
      }
      img.onerror = () => setError('Couldn’t read that image.')
      img.src = reader.result as string
    }
    reader.onerror = () => setError('Couldn’t read that file.')
    reader.readAsDataURL(file)
  }

  const canSubmit = !submitting && name.trim().length > 0

  return (
    <div className="po-screen">
      <div className="po-avatar-row">
        <button
          type="button"
          className="po-avatar"
          onClick={() => fileRef.current?.click()}
          aria-label="Choose profile picture"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" />
          ) : (
            <span className="po-avatar-placeholder">
              {name.trim().charAt(0).toUpperCase() || '+'}
            </span>
          )}
        </button>
        <div className="po-avatar-hint">
          <div className="po-avatar-label">Profile picture</div>
          <button
            type="button"
            className="po-link"
            onClick={() => fileRef.current?.click()}
          >
            {avatarUrl ? 'Replace' : 'Upload'}
          </button>
          {avatarUrl && (
            <button
              type="button"
              className="po-link po-link--muted"
              onClick={() => setAvatarUrl(null)}
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="po-fields">
        <label className="po-field">
          <input
            className="po-input"
            type="text"
            placeholder=" "
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSubmit) {
                onSubmit({ name: name.trim(), avatar_url: avatarUrl })
              }
            }}
          />
          <span className="po-label">How should we call you?</span>
        </label>
      </div>

      {error && <div className="po-error">{error}</div>}

      <div className="po-btn-row">
        {showCancel && (
          <button type="button" className="po-btn-back" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className="po-btn-cta"
          disabled={!canSubmit}
          onClick={() => onSubmit({ name: name.trim(), avatar_url: avatarUrl })}
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  )
}

// Shared profile-update mutation. PATCHes the customer-portal endpoint
// directly (not via the generated client) because the route is too
// new for the published OpenAPI schema.
function useUpdateCustomerProfile(token: string | null | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      name: string | null
      avatar_url: string | null
    }) => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/v1/customer-portal/customers/me/profile`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token ?? ''}`,
          },
          body: JSON.stringify(body),
        },
      )
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Profile ${res.status}: ${text}`)
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer'] })
    },
  })
}

export function OnboardingModal({
  customer,
  token,
  open,
  onClose,
}: {
  customer: CustomerWithProfile
  token: string | null | undefined
  open: boolean
  onClose: () => void
}) {
  const update = useUpdateCustomerProfile(token)
  if (!open) return null
  return (
    <PortalProfileShell
      title="Welcome — let’s set up your profile"
      subtitle="We use this to label your posts in the community and to greet you across the portal."
    >
      <ProfileForm
        initialName={customer.name ?? ''}
        initialAvatarUrl={customer.avatar_url ?? null}
        onSubmit={(next) =>
          update.mutate(next, {
            onSuccess: () => onClose(),
          })
        }
        submitting={update.isPending}
        submitLabel="Save and continue"
        showCancel={false}
      />
    </PortalProfileShell>
  )
}

export function SettingsModal({
  customer,
  token,
  open,
  onClose,
}: {
  customer: CustomerWithProfile
  token: string | null | undefined
  open: boolean
  onClose: () => void
}) {
  const update = useUpdateCustomerProfile(token)
  if (!open) return null
  return (
    <PortalProfileShell
      title="Profile"
      subtitle="Change how your name and picture show across the portal."
      onClose={onClose}
    >
      <ProfileForm
        initialName={customer.name ?? ''}
        initialAvatarUrl={customer.avatar_url ?? null}
        onSubmit={(next) =>
          update.mutate(next, {
            onSuccess: () => onClose(),
          })
        }
        onCancel={onClose}
        submitting={update.isPending}
        submitLabel="Save"
        showCancel
      />
    </PortalProfileShell>
  )
}

function PortalProfileShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle: string
  onClose?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="po-backdrop" role="dialog" aria-modal="true">
      <PortalProfileStyles />
      <div className="po-card" onClick={(e) => e.stopPropagation()}>
        {onClose && (
          <button
            type="button"
            className="po-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        )}
        <div className="po-eyebrow">Account</div>
        <h2 className="po-title">{title}</h2>
        <p className="po-sub">{subtitle}</p>
        {children}
      </div>
    </div>
  )
}

// Scoped clone of the course-onboarding (Step 2) design system. The
// wizard's `.so-*` styles are locked behind its own component-scoped
// <style> block, so we mirror just the field + button + label
// primitives we need under a `.po-*` prefix so the two surfaces stay
// visually identical without coupling at the class-name level.
function PortalProfileStyles() {
  return (
    <style jsx global>{`
      .po-backdrop {
        position: fixed;
        inset: 0;
        z-index: 200;
        background: rgba(20, 20, 24, 0.42);
        backdrop-filter: blur(4px);
        display: grid;
        place-items: center;
        padding: 32px 16px;
      }
      .po-card {
        background: #ffffff;
        border-radius: 18px;
        width: 100%;
        max-width: 440px;
        padding: 36px 32px 28px;
        position: relative;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.18);
      }
      .po-close {
        position: absolute;
        top: 14px;
        right: 14px;
        width: 32px;
        height: 32px;
        border-radius: 999px;
        border: none;
        background: transparent;
        color: rgba(0, 0, 0, 0.5);
        font-size: 20px;
        cursor: pointer;
        line-height: 1;
      }
      .po-close:hover {
        background: rgba(0, 0, 0, 0.05);
        color: rgba(0, 0, 0, 0.85);
      }
      .po-eyebrow {
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: rgba(0, 0, 0, 0.4);
        margin-bottom: 10px;
      }
      .po-title {
        font-family: var(--font-poppins), system-ui, sans-serif;
        font-weight: 700;
        font-size: 22px;
        line-height: 1.2;
        letter-spacing: -0.02em;
        color: #0a0a0a;
        margin: 0 0 8px;
      }
      .po-sub {
        font-size: 13px;
        color: rgba(0, 0, 0, 0.55);
        line-height: 1.45;
        margin: 0 0 24px;
      }
      .po-avatar-row {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 22px;
      }
      .po-avatar {
        width: 64px;
        height: 64px;
        border-radius: 999px;
        background: #efeff2;
        border: 1.5px solid #e0e0e6;
        display: grid;
        place-items: center;
        overflow: hidden;
        padding: 0;
        cursor: pointer;
        color: #0a0a0a;
      }
      .po-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .po-avatar-placeholder {
        font-size: 22px;
        font-weight: 600;
        color: rgba(0, 0, 0, 0.45);
      }
      .po-avatar-hint {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .po-avatar-label {
        font-size: 12px;
        font-weight: 500;
        color: rgba(0, 0, 0, 0.55);
      }
      .po-link {
        background: none;
        border: none;
        color: #0a0a0a;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        padding: 0;
        text-align: left;
        text-decoration: underline;
        text-underline-offset: 3px;
      }
      .po-link--muted {
        color: rgba(0, 0, 0, 0.5);
      }
      .po-fields {
        display: flex;
        flex-direction: column;
        gap: 14px;
        margin-bottom: 24px;
      }
      .po-field {
        position: relative;
        display: block;
        background: #ffffff;
        border: 1.5px solid #e0e0e6;
        border-radius: 12px;
        transition: border-color 0.15s;
      }
      .po-field:focus-within {
        /* Portal accent (community blue) — NOT the wizard's indigo. */
        border-color: var(--sp-accent, #0066cc);
      }
      .po-input {
        width: 100%;
        padding: 22px 16px 10px 16px;
        background: transparent;
        border: 0;
        outline: 0;
        border-radius: inherit;
        font-family:
          -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui,
          sans-serif;
        font-size: 16px;
        font-weight: 400;
        color: #0a0a0a;
      }
      .po-input::placeholder {
        color: transparent;
      }
      .po-label {
        position: absolute;
        left: 16px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 16px;
        font-weight: 400;
        color: rgba(0, 0, 0, 0.45);
        pointer-events: none;
        background: transparent;
        transition:
          transform 0.15s,
          font-size 0.15s,
          color 0.15s,
          top 0.15s;
      }
      /* The floated label sits INSIDE the field (the input reserves
         22px of top padding for it), so it needs no background chip —
         a hardcoded white one here is what turned the "How should we
         call you?" label into a white pill in dark mode. */
      .po-input:focus ~ .po-label,
      .po-input:not(:placeholder-shown) ~ .po-label {
        top: 10px;
        transform: none;
        font-size: 11px;
        color: rgba(0, 0, 0, 0.5);
        background: transparent;
      }
      .po-error {
        font-size: 12px;
        color: #c43d3d;
        margin-bottom: 14px;
      }
      .po-btn-row {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 16px;
      }
      .po-btn-back {
        background: none;
        border: none;
        font-family:
          -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui,
          sans-serif;
        font-size: 13px;
        color: rgba(0, 0, 0, 0.5);
        cursor: pointer;
        padding: 8px 0;
      }
      .po-btn-back:hover {
        color: #0a0a0a;
      }
      .po-btn-cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 13px 22px;
        background: var(--sp-ink, #0a0a0a);
        color: var(--sp-bg, #ffffff);
        border: none;
        border-radius: 100px;
        font-family:
          -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui,
          sans-serif;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }
      .po-btn-cta:hover {
        opacity: 0.85;
      }
      .po-btn-cta:disabled {
        opacity: 0.3;
        pointer-events: none;
      }
    `}</style>
  )
}
