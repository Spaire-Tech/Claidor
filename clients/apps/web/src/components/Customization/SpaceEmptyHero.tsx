'use client'

// Shared empty-state hero used in three places:
//   - The Spaire Space editor canvas (creator view, with the
//     "Add to Space" CTA wired to the picker)
//   - The in-editor preview when isSpaceEnabled && !isEditing
//   - The public storefront a visitor sees at /<organization>
// The CTA only renders when an onAddToSpace handler is supplied, so
// public visitors don't see a creator-facing button.

export const SpaceEmptyHero = ({
  onAddToSpace,
  fill = false,
}: {
  onAddToSpace?: () => void
  fill?: boolean
}) => (
  <section
    style={{
      position: 'relative',
      width: '100%',
      height: fill ? '100%' : 'min(56vh, 440px)',
      minHeight: fill ? undefined : 340,
      borderRadius: 'calc(28px * var(--radius-mul, 1))',
      overflow: 'hidden',
      background: '#000',
      isolation: 'isolate',
      border: '1px solid oklch(0.92 0.003 280)',
      boxShadow:
        '0 2px 6px rgba(0,0,0,0.06), 0 24px 60px rgba(0,0,0,0.10)',
    }}
  >
    <img
      src="/assets/space-empty-hero.jpg"
      alt=""
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
      }}
    />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2,
        pointerEvents: 'none',
        background:
          'linear-gradient(180deg, oklch(0 0 0 / 0.2) 0%, oklch(0 0 0 / 0) 30%, oklch(0 0 0 / 0) 45%, oklch(0 0 0 / 0.6) 80%, oklch(0 0 0 / 0.92) 100%)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 3,
        padding: '32px 36px 40px',
        color: 'white',
      }}
    >
      <h2
        style={{
          fontSize: 'clamp(30px, 3.8vw, 48px)',
          fontWeight: 'var(--h-weight, 700)',
          fontStyle: 'var(--h-italic, normal)',
          letterSpacing: 'calc(var(--h-tracking, 0em) - 0.04em)',
          lineHeight: 'calc(var(--h-leading, 1) * 0.98)',
          margin: '0 0 14px',
          color: 'white',
          maxWidth: '16ch',
          textShadow: '0 2px 30px oklch(0 0 0 / 0.35)',
        }}
      >
        Everything in one Space
      </h2>
      <p
        style={{
          fontSize: 'clamp(13px, 1.05vw, 16px)',
          fontWeight: 400,
          color: 'rgba(255,255,255,0.88)',
          maxWidth: 560,
          margin: onAddToSpace ? '0 0 24px' : 0,
          lineHeight: 1.5,
        }}
      >
        Create a space where everything you offer is clearly presented,
        easily discovered, and ready for your audience to buy whenever
        they&rsquo;re interested.
      </p>
      {onAddToSpace && (
        <button
          type="button"
          onClick={onAddToSpace}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 20px',
            background: 'white',
            color: 'oklch(0.14 0.006 280)',
            borderRadius: 999,
            boxShadow: '0 8px 28px oklch(0 0 0 / 0.4)',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          Add to Space →
        </button>
      )}
    </div>
  </section>
)
