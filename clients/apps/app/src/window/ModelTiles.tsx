// The makers' marks on Connect apps' tiles (`assets/marks/<provider>.png`;
// the Mac's and the iPhone's `Marks/<provider>`): AI Models' card and its
// row in the account menu (11 November 2026, the founder: "i like B. but
// without the claude opus 5.5. also add meta icon there too. and also can
// you add ai models to the menu bar"). A tile is white, #2c2c2e on dark;
// ChatGPT's and Grok's marks in the ink, Claude's and Meta's in their own
// colours in both modes ("meta keeps it blue in dark mode as well").

import type { CSSProperties } from 'react'
import { modelsCard } from '../core/aiModels'
import './ModelTiles.css'

const files = import.meta.glob<string>('../assets/marks/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})

const byProvider = new Map(
  Object.entries(files).map(([path, url]) => [
    path.slice(path.lastIndexOf('/') + 1, -'.png'.length),
    url,
  ]),
)

/** A maker's mark on its tile, `side` square, round as an app icon (0.2237 of its side), the mark `share` of it (0.56) in the middle. */
export function ModelTile({
  provider,
  side,
  share = 0.56,
  className,
  style,
}: {
  provider: string
  side: number
  share?: number
  className?: string
  style?: CSSProperties
}) {
  const url = byProvider.get(provider)
  const mark = Math.round(side * share)
  return (
    <span
      className={className ? `model-tile ${className}` : 'model-tile'}
      style={{
        width: side,
        height: side,
        borderRadius: side * 0.2237,
        ...style,
      }}
    >
      {url === undefined ? null : modelsCard.coloured.has(provider) ? (
        <img src={url} alt="" style={{ width: mark, height: mark }} />
      ) : (
        <span
          className="model-tile-ink"
          style={{
            width: mark,
            height: mark,
            maskImage: `url("${url}")`,
            WebkitMaskImage: `url("${url}")`,
          }}
        />
      )}
    </span>
  )
}

/**
 * AI Models' picture (design B, without the model's pill): the four marks'
 * tiles at 56, fanned in the middle of the card's 320 by 200, each over the
 * last by 8, turned as `modelsCard.turns`, the outer two 4 lower, so they
 * sit on an arc; a soft shadow under each.
 */
export function ModelTilesFan() {
  const last = modelsCard.marks.length - 1
  return (
    <div
      className="agents-picture models-picture"
      role="img"
      aria-label="ChatGPT, Claude, Grok, Meta"
    >
      <span className="models-fan">
        {modelsCard.marks.map((provider, i) => (
          <ModelTile
            key={provider}
            provider={provider}
            side={56}
            className="models-fan-tile"
            style={{
              transform: `translateY(${i === 0 || i === last ? 4 : 0}px) rotate(${modelsCard.turns[i]}deg)`,
            }}
          />
        ))}
      </span>
    </div>
  )
}

/** The four marks at AI Models' end in the account menu, as External Agents' mascots (`.menu-mascots`): 18, the mark 0.64 of it, each over the last by 4, the first turned 7° left and the last 7° right. */
export function MenuModelTiles() {
  return (
    <span className="menu-mascots" aria-hidden="true">
      {modelsCard.marks.map((provider) => (
        <ModelTile
          key={provider}
          provider={provider}
          side={18}
          share={0.64}
          className="menu-model-tile"
          style={{ borderRadius: 5 }}
        />
      ))}
    </span>
  )
}
