'use client'

// CatalogCard — literal clone of the "Catalog Card.html" design (the portable
// catalog lesson card). A fixed 380×362 white card: a 214px thumbnail (episode
// + duration chips, hover play overlay) with the details stacked beneath
// (uppercase episode number, title, 3-line clamped description, duration meta).
// All styles are scoped under .lc-catalog and ported verbatim; content defaults
// to the design sample, photo self-hosted.

export type CatalogCardProps = {
  episodeChip?: string
  episodeNum?: string
  title?: string
  description?: string
  duration?: string
  imageUrl?: string
  imagePosition?: string
  /** Dark surface variant (Lesson Card B.html) — used by the lesson picker. */
  dark?: boolean
  onClick?: () => void
}

const IconClock = ({ size = 13 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

export function CatalogCard({
  episodeChip = 'EPISODE 2',
  episodeNum = 'Episode 2',
  title = 'Laminating the Dough',
  description = 'Marco breaks down the butter block — how to lock it in, roll it out, and fold the layers that turn a flat sheet of dough into a croissant that shatters instead of squashes.',
  duration = '14m 22s',
  imageUrl = '/assets/onboarding/chef-marco.jpg',
  imagePosition = '50% 30%',
  dark = false,
  onClick,
}: CatalogCardProps = {}) {
  return (
    <div className={`lc-catalog${dark ? ' dark' : ''}`} onClick={onClick}>
      <div className="lc-card">
        <div className="lc-thumb">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Lesson thumbnail"
            style={{ objectPosition: imagePosition }}
          />
          <div className="lc-ep">{episodeChip}</div>
          <div className="lc-dur">
            <IconClock size={11} />
            <span>{duration}</span>
          </div>
          <div className="lc-play">
            <div className="lc-play-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </div>
        <div className="lc-info">
          <div className="lc-num">{episodeNum}</div>
          <div className="lc-title">{title}</div>
          <div className="lc-desc">{description}</div>
          <div className="lc-meta">
            <IconClock size={13} />
            <span>{duration}</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .lc-catalog {
          width: 380px;
          cursor: pointer;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display',
            'SF Pro Text', system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          letter-spacing: -0.014em;
        }
        .lc-card {
          width: 100%;
          height: 362px;
          border-radius: 16px;
          overflow: hidden;
          background: #ffffff;
          border: 1px solid #e6e6e9;
          display: flex;
          flex-direction: column;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.05);
          transition: transform 0.26s cubic-bezier(0.34, 1.3, 0.64, 1),
            box-shadow 0.26s;
        }
        .lc-catalog:hover .lc-card {
          transform: translateY(-5px);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.06);
        }

        /* thumbnail */
        .lc-thumb {
          position: relative;
          flex: 0 0 auto;
          height: 214px;
          background: #111111;
          overflow: hidden;
        }
        .lc-thumb :global(img) {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: 50% 30%;
        }

        /* hover play overlay */
        .lc-play {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.25);
          display: grid;
          place-items: center;
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .lc-catalog:hover .lc-play {
          opacity: 1;
        }
        .lc-play-btn {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.95);
          color: #07080a;
          display: grid;
          place-items: center;
          padding-left: 3px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        }

        /* chips on the image */
        .lc-ep {
          position: absolute;
          left: 12px;
          top: 12px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: rgba(255, 255, 255, 0.85);
          background: rgba(0, 0, 0, 0.42);
          -webkit-backdrop-filter: blur(8px);
          backdrop-filter: blur(8px);
          padding: 4px 8px;
          border-radius: 6px;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
        }
        .lc-dur {
          position: absolute;
          right: 12px;
          top: 12px;
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.92);
          font-variant-numeric: tabular-nums;
          background: rgba(0, 0, 0, 0.42);
          -webkit-backdrop-filter: blur(8px);
          backdrop-filter: blur(8px);
          padding: 4px 9px 4px 7px;
          border-radius: 980px;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
        }

        /* info block below the image */
        .lc-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 18px 20px 20px;
        }
        .lc-num {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #86868b;
          margin-bottom: 6px;
        }
        .lc-title {
          font-size: 19px;
          font-weight: 600;
          letter-spacing: -0.02em;
          line-height: 1.2;
          color: #1d1d1f;
          margin-bottom: 9px;
        }
        .lc-desc {
          font-size: 14px;
          color: rgba(0, 0, 0, 0.56);
          line-height: 1.55;
          text-wrap: pretty;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .lc-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: auto;
          padding-top: 12px;
          font-size: 13px;
          font-weight: 500;
          color: #86868b;
          font-variant-numeric: tabular-nums;
        }

        /* dark variant — Lesson Card B.html (catalog card on a dark surface) */
        .lc-catalog.dark .lc-card {
          background: #1a1a1c;
          border-color: rgba(255, 255, 255, 0.1);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4),
            0 4px 20px rgba(0, 0, 0, 0.45);
        }
        .lc-catalog.dark:hover .lc-card {
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.6), 0 2px 8px rgba(0, 0, 0, 0.5);
        }
        .lc-catalog.dark .lc-num {
          color: rgba(245, 245, 247, 0.48);
        }
        .lc-catalog.dark .lc-title {
          color: #f5f5f7;
        }
        .lc-catalog.dark .lc-desc {
          color: rgba(245, 245, 247, 0.62);
        }
        .lc-catalog.dark .lc-meta {
          color: rgba(245, 245, 247, 0.48);
        }
      `}</style>
    </div>
  )
}

export default CatalogCard
