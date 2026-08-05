'use client'

// SpotlightLessonCard — literal static clone of the "Spotlight" lesson card
// design (Lesson 9 Card.html). A 380×362 cover-image card with a frosted blur
// over its lower half, a dark shade gradient, a hover-reveal play button, and
// an info block (episode label, ellipsised title, 2-line clamped description,
// footer with runtime + a "more" affordance). Hover lifts the card.
//
// Content defaults to the design's sample so it clones exactly; props are
// exposed so it can be reused with real lesson data later. CSS is a faithful
// port scoped to this component via styled-jsx.

const PLAY_PATH =
  'M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5Z'

export function SpotlightLessonCard({
  episodeLabel = 'Lesson 9',
  title = 'Constructing the Point',
  description = 'Patterns, angles, and patience. How Jack builds a winning point and the high-percentage tennis behind it.',
  time = '23 min',
  imageUrl = null,
  imagePosition = 'center 22%',
  locked = false,
  onClick,
  onMore,
}: {
  episodeLabel?: string
  title?: string
  description?: string
  time?: string
  /** When absent, a dark gradient renders instead of a photo. */
  imageUrl?: string | null
  /** background-position for the photo (design: 'center 22%'). */
  imagePosition?: string
  /** Renders the design's frosted lock chip (paywalled lesson). */
  locked?: boolean
  onClick?: () => void
  onMore?: () => void
}) {
  const cardBg = imageUrl
    ? `url('${imageUrl}')`
    : 'radial-gradient(120% 120% at 30% 15%, #1b1d22 0%, #0c0d10 60%, #060708 100%)'
  return (
    <div className="lockup" onClick={onClick}>
      <div
        className="lockup-card"
        style={{ backgroundImage: cardBg, backgroundPosition: imagePosition }}
      >
        <div className="lockup-blur">
          <div className="bl bl1" />
          <div className="bl bl2" />
          <div className="bl bl3" />
          <div className="bl bl4" />
        </div>
        <div className="lockup-shade" />
        {locked && (
          <div className="lockup-chip-lock" aria-label="Locked">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </div>
        )}
        <div className="lockup-playhover">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff">
            <path d={PLAY_PATH} />
          </svg>
        </div>
        <div className="lockup-info">
          <div className="lockup-ep">{episodeLabel}</div>
          <div className="lockup-title">{title}</div>
          <div className="lockup-desc">{description}</div>
          <div className="lockup-foot">
            <span className="lockup-time">{time}</span>
            <button
              className="lockup-more"
              type="button"
              aria-label="More"
              onClick={(e) => {
                e.stopPropagation()
                onMore?.()
              }}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        /* ============================================================ LESSON CARD (lockup) */
        .lockup {
          --text: #1d1d1f;
          --text-2: rgba(0, 0, 0, 0.56);
          --ink: #07080a;
          --sf: -apple-system, BlinkMacSystemFont, 'SF Pro Display',
            'SF Pro Text', system-ui, sans-serif;
          flex: 0 0 auto;
          width: 380px;
          cursor: pointer;
          font-family: var(--sf);
          letter-spacing: -0.014em;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        /* Neutralize UA button chrome only — the .lockup-more button sets its
           own (transparent) background below. */
        .lockup :global(button) {
          font-family: inherit;
          cursor: pointer;
          border: none;
        }
        .lockup-card {
          position: relative;
          width: 380px;
          height: 362px;
          border-radius: 16px;
          overflow: hidden;
          background-size: cover;
          background-position: center;
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06),
            0 10px 24px rgba(0, 0, 0, 0.16);
          transition: transform 0.26s cubic-bezier(0.2, 1.05, 0.3, 1),
            box-shadow 0.26s;
        }
        .lockup:hover .lockup-card {
          transform: translateY(-5px);
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08),
            0 18px 40px rgba(0, 0, 0, 0.24);
        }
        /* Progressive (tiered) blur — four stacked layers each blurring more
           and masked to fade out higher up, so the image stays crisp at the
           top of the band and dissolves toward the text. */
        .lockup-blur {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 66%;
          pointer-events: none;
        }
        .lockup-blur .bl {
          position: absolute;
          inset: 0;
        }
        .lockup-blur .bl1 {
          -webkit-backdrop-filter: blur(2px);
          backdrop-filter: blur(2px);
          -webkit-mask-image: linear-gradient(
            0deg,
            #000 0%,
            #000 26%,
            transparent 52%
          );
          mask-image: linear-gradient(0deg, #000 0%, #000 26%, transparent 52%);
        }
        .lockup-blur .bl2 {
          -webkit-backdrop-filter: blur(5px);
          backdrop-filter: blur(5px);
          -webkit-mask-image: linear-gradient(
            0deg,
            #000 0%,
            #000 15%,
            transparent 38%
          );
          mask-image: linear-gradient(0deg, #000 0%, #000 15%, transparent 38%);
        }
        .lockup-blur .bl3 {
          -webkit-backdrop-filter: blur(10px);
          backdrop-filter: blur(10px);
          -webkit-mask-image: linear-gradient(
            0deg,
            #000 0%,
            #000 7%,
            transparent 24%
          );
          mask-image: linear-gradient(0deg, #000 0%, #000 7%, transparent 24%);
        }
        .lockup-blur .bl4 {
          -webkit-backdrop-filter: blur(20px);
          backdrop-filter: blur(20px);
          -webkit-mask-image: linear-gradient(0deg, #000 0%, transparent 12%);
          mask-image: linear-gradient(0deg, #000 0%, transparent 12%);
        }
        .lockup-shade {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            0deg,
            rgba(7, 8, 10, 0.92) 2%,
            rgba(7, 8, 10, 0.6) 26%,
            rgba(7, 8, 10, 0.08) 52%,
            transparent 66%
          );
        }
        /* Locked-state affordance — kept for parity with the design (rendered
           when a lesson sits behind the paywall). */
        .lockup-chip-lock {
          position: absolute;
          top: 14px;
          right: 14px;
          z-index: 3;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: rgba(10, 11, 13, 0.46);
          -webkit-backdrop-filter: blur(12px) saturate(150%);
          backdrop-filter: blur(12px) saturate(150%);
          display: grid;
          place-items: center;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
          color: rgba(255, 255, 255, 0.92);
        }
        .lockup-info {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 2;
          padding: 0 20px 20px;
        }
        .lockup-ep {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(235, 235, 245, 0.66);
          margin-bottom: 6px;
        }
        .lockup-title {
          font-size: 22px;
          font-weight: 600;
          letter-spacing: -0.02em;
          line-height: 1.1;
          color: #fff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .lockup-desc {
          font-size: 14.5px;
          line-height: 1.4;
          color: rgba(235, 235, 245, 0.8);
          margin-top: 8px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          min-height: 41px;
        }
        .lockup-foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 14px;
        }
        .lockup-time {
          font-size: 14px;
          font-weight: 500;
          color: rgba(235, 235, 245, 0.84);
          font-variant-numeric: tabular-nums;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .lockup-more {
          background: none;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 3px;
          color: rgba(235, 235, 245, 0.7);
        }
        .lockup-more:hover {
          color: #fff;
        }
        .lockup-more span {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: currentColor;
        }
        .lockup-playhover {
          position: absolute;
          top: 30%;
          left: 50%;
          transform: translate(-50%, -50%) scale(0.82);
          z-index: 3;
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.18);
          -webkit-backdrop-filter: blur(16px);
          backdrop-filter: blur(16px);
          display: grid;
          place-items: center;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.42);
          opacity: 0;
          transition: opacity 0.28s, transform 0.28s;
        }
        .lockup:hover .lockup-playhover {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
        .lockup-playhover :global(svg) {
          margin-left: 2px;
        }
      `}</style>
    </div>
  )
}

export default SpotlightLessonCard
