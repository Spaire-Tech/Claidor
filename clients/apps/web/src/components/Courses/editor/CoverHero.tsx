'use client'

// CoverHero — literal clone of the "Cover Hero.html" design (The Golfer's
// Blueprint). Standalone, no JS in the source: a full-bleed 100vh photo hero
// with a dual legibility shade, an optional eyebrow top-left (only when one is
// provided — no channel/brand label by default), and a
// lower-left content stack (NEW SERIES badge + meta line, balance-wrapped
// display title, description with the dimmed "— with" byline, white Watch
// trailer pill + frosted Enroll button). CSS is a faithful port of the source
// stylesheet scoped via styled-jsx; content defaults to the design sample and
// the photo ships self-hosted (CSP 'self').

export type CoverHeroProps = {
  eyebrow?: string
  badge?: string
  metaItems?: string[]
  /** Title lines — rendered with <br/> between them, like the source. */
  titleLines?: string[]
  description?: string
  withByline?: string
  trailerLabel?: string
  enrollLabel?: string
  imageUrl?: string
  imagePosition?: string
  /** Eyebrow dot colour (design accent; Yoga Foundations uses teal). */
  dotColor?: string
  /** Size to the parent container instead of the viewport (picker tiles). */
  fill?: boolean
  onWatchTrailer?: () => void
  onEnroll?: () => void
}

export function CoverHero({
  eyebrow = '',
  badge = 'New Series',
  metaItems = ['11 lessons', '3 hr 42 min', 'All levels'],
  titleLines = ['The Golfer’s', 'Blueprint'],
  description = 'A two-time major champion takes you inside the scoring game — the swing, the short game, and the mind that wins the shots that matter. Shot like a film, taught like a private lesson.',
  withByline = 'Jack Reeves',
  trailerLabel = 'Watch trailer',
  enrollLabel = 'Enroll · $79',
  imageUrl = '/assets/onboarding/cover-fore.jpg',
  imagePosition = 'center 62%',
  dotColor = '#e0482e',
  fill = false,
  onWatchTrailer,
  onEnroll,
}: CoverHeroProps = {}) {
  return (
    <section
      className="hero"
      data-screen-label="Cover Hero"
      style={fill ? { height: '100%', minHeight: 0 } : undefined}
    >
      <div
        className="hero-art"
        style={{
          background: `url('${imageUrl}') ${imagePosition} / cover no-repeat`,
        }}
      />
      <div className="hero-shade" />

      {eyebrow ? (
        <div className="hero-eyebrow">
          <span className="dot" style={{ background: dotColor }} />
          {eyebrow}
        </div>
      ) : null}

      <div className="hero-content">
        <div className="hero-meta">
          <span className="badge">{badge}</span>
          <div className="meta-line">
            {metaItems.map((m, i) => (
              <span key={i} style={{ display: 'contents' }}>
                {i > 0 && <span className="sep">·</span>}
                <span>{m}</span>
              </span>
            ))}
          </div>
        </div>

        <h1 className="hero-title">
          {titleLines.map((line, i) => (
            <span key={i} style={{ display: 'contents' }}>
              {i > 0 && <br />}
              {line}
            </span>
          ))}
        </h1>

        <p className="hero-desc">
          {description}{' '}
          {withByline && <span className="with">— with {withByline}</span>}
        </p>

        <div className="hero-actions">
          <button className="btn-trailer" type="button" onClick={onWatchTrailer}>
            <span className="play">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5Z" />
              </svg>
            </span>
            {trailerLabel}
          </button>
          <button className="btn-enroll" type="button" onClick={onEnroll}>
            {enrollLabel}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>

      <style jsx>{`
        /* ============================================================
           COVER HERO — standalone, no JS, no frameworks.
           ============================================================ */
        .hero {
          --po: 'Poppins', var(--font-poppins), -apple-system,
            BlinkMacSystemFont, system-ui, sans-serif;
          position: relative;
          width: 100%;
          height: 100svh;
          min-height: 640px;
          overflow: hidden;
          background: #0a0807;
          font-family: var(--po);
          -webkit-font-smoothing: antialiased;
        }
        /* Neutralize UA button chrome only — buttons declare their own fills. */
        .hero :global(button) {
          font-family: inherit;
          cursor: pointer;
          border: none;
        }

        /* photo */
        .hero-art {
          position: absolute;
          inset: 0;
          transform: scaleX(-1);
        }

        /* legibility shade — stronger toward the lower left where the text sits */
        .hero-shade {
          position: absolute;
          inset: 0;
          background: linear-gradient(
              0deg,
              rgba(5, 5, 8, 0.62) 0%,
              rgba(5, 5, 8, 0.28) 32%,
              transparent 58%
            ),
            linear-gradient(105deg, rgba(5, 5, 8, 0.38) 0%, transparent 45%);
        }

        /* eyebrow — top left */
        .hero-eyebrow {
          position: absolute;
          top: 56px;
          left: 72px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: rgba(255, 255, 255, 0.92);
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
        }
        .hero-eyebrow .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #e0482e;
        }

        /* content stack — lower left */
        .hero-content {
          position: absolute;
          left: 72px;
          right: 72px;
          bottom: 64px;
          max-width: 860px;
          color: #fff;
        }

        .hero-meta {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 22px;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.92);
          color: #1d1d1f;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          padding: 8px 16px;
          border-radius: 980px;
        }
        .meta-line {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 16px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.78);
        }
        .meta-line .sep {
          opacity: 0.55;
        }

        .hero-title {
          font-size: clamp(56px, 7.2vw, 108px);
          font-weight: 700;
          line-height: 1.02;
          letter-spacing: -0.025em;
          text-wrap: balance;
        }

        .hero-desc {
          margin-top: 22px;
          max-width: 640px;
          font-size: 17px;
          font-weight: 500;
          line-height: 1.55;
          color: rgba(255, 255, 255, 0.88);
        }
        .hero-desc .with {
          color: rgba(255, 255, 255, 0.62);
        }

        .hero-actions {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-top: 30px;
        }
        .btn-trailer {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          background: #fff;
          color: #111;
          font-size: 16px;
          font-weight: 600;
          letter-spacing: -0.01em;
          padding: 14px 26px 14px 14px;
          border-radius: 980px;
          transition: transform 0.16s ease;
        }
        .btn-trailer:hover {
          transform: scale(1.03);
        }
        .btn-trailer:active {
          transform: scale(0.98);
        }
        .btn-trailer .play {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: #111;
          color: #fff;
          display: grid;
          place-items: center;
          flex: none;
        }
        .btn-enroll {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: rgba(20, 20, 24, 0.46);
          color: #fff;
          -webkit-backdrop-filter: blur(18px) saturate(160%);
          backdrop-filter: blur(18px) saturate(160%);
          box-shadow: none;
          font-size: 16px;
          font-weight: 600;
          letter-spacing: -0.01em;
          padding: 17px 28px;
          border-radius: 980px;
          transition: background 0.18s, transform 0.16s ease;
        }
        .btn-enroll:hover {
          background: rgba(40, 40, 46, 0.68);
          transform: scale(1.03);
        }
        .btn-enroll:active {
          transform: scale(0.98);
        }

        @media (max-width: 720px) {
          .hero-eyebrow {
            top: 32px;
            left: 28px;
          }
          .hero-content {
            left: 28px;
            right: 28px;
            bottom: 40px;
          }
          .hero-title {
            font-size: clamp(40px, 11vw, 64px);
          }
          .hero-actions {
            flex-wrap: wrap;
          }
        }
      `}</style>
    </section>
  )
}

export default CoverHero
