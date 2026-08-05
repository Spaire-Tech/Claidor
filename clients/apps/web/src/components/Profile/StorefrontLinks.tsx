'use client'

import LinkOutlined from '@mui/icons-material/LinkOutlined'
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined'
import { useState } from 'react'
import {
  buildEmbedUrl,
  getDomain,
  getEmbedAspect,
  getPlatformConfig,
  isEmbeddablePlatform,
  platformLogoUrl,
} from './linkPlatforms'

export type StorefrontLinkItem = {
  id: string
  url: string
  title?: string | null
  description?: string | null
  image_url?: string | null
  type: 'standard' | 'embedded'
  platform?: string | null
  // Per-link layout. Embeds ignore it; for standard links it overrides
  // the section default. Unset → fall back to the section's layout.
  layout?: LinksLayout | null
}

export type LinksLayout = 'classic' | 'carousel' | 'image_grid' | 'card'

// ─── Embed iframe ───────────────────────────────────────────────────────────
// Reads aspect ratio / fixed height from the platform config so adding a
// new embeddable platform is a one-file change in linkPlatforms.ts.

// Max width for portrait/"reel" embeds (TikTok, Instagram reels,
// YouTube shorts). A 9:16 iframe at full column width becomes ~750px
// tall and dominates the page — cap the WIDTH instead so the embed
// reads like the reel viewers see on the source platform.
const REEL_MAX_WIDTH = 380

export const EmbedFrame = ({ link }: { link: StorefrontLinkItem }) => {
  const platform = link.platform ?? ''
  const src = buildEmbedUrl(link.url, platform)
  if (!src) return null
  const cfg = getPlatformConfig(platform)
  const aspect = getEmbedAspect(link.url, platform)

  const commonProps = {
    src,
    frameBorder: '0',
    allow:
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen',
    allowFullScreen: true,
    loading: 'lazy' as const,
    title: link.title ?? platform,
  }

  if (aspect) {
    // Responsive aspect-ratio iframe. paddingTop% is relative to the
    // element's WIDTH, so a capped max-width naturally caps the height.
    // Reels / shorts (aspect < 1) get a narrow centered card so they
    // read like the source platform, not a 750px wall of video.
    const padding = (1 / aspect) * 100
    const isReel = aspect < 1
    return (
      <div
        className={`relative w-full overflow-hidden bg-black ${
          isReel ? 'mx-auto' : ''
        }`}
        style={{
          maxWidth: isReel ? REEL_MAX_WIDTH : undefined,
          paddingTop: `${padding}%`,
        }}
      >
        <iframe
          {...commonProps}
          scrolling={platform === 'soundcloud' ? 'no' : undefined}
          className="absolute inset-0 block h-full w-full"
        />
      </div>
    )
  }

  return (
    <iframe
      {...commonProps}
      width="100%"
      height={cfg?.embedHeight ?? 180}
      scrolling={platform === 'soundcloud' ? 'no' : undefined}
      className="block w-full"
    />
  )
}

// ─── Shared thumbnail ───────────────────────────────────────────────────────

// Generic link glyph — the last-resort thumbnail.
const LinkGlyph = ({ className }: { className?: string }) => (
  <div
    className={`flex items-center justify-center bg-gray-100 ${className ?? ''}`}
  >
    <LinkOutlined style={{ fontSize: 24 }} className="text-gray-300" />
  </div>
)

// Brand logo fallback: shown when a link has no preview image but we do
// know its platform. If the .jpg hasn't been added to /public yet,
// onError drops us back to the generic glyph so nothing looks broken.
const PlatformLogoThumb = ({
  platform,
  className,
}: {
  platform: string
  className?: string
}) => {
  const [failed, setFailed] = useState(false)
  const src = platformLogoUrl(platform)
  if (!src || failed) return <LinkGlyph className={className} />
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={className}
      onError={() => setFailed(true)}
    />
  )
}

export const Thumb = ({
  link,
  className,
}: {
  link: StorefrontLinkItem
  className?: string
}) =>
  link.image_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={link.image_url} alt="" className={className} />
  ) : link.platform ? (
    <PlatformLogoThumb platform={link.platform} className={className} />
  ) : (
    <LinkGlyph className={className} />
  )

// ─── Per-link renderer ──────────────────────────────────────────────────────
// One component handles all four layouts. `preview` swaps the outer
// <a> for a non-navigating <div> so the editor canvas can reuse this
// without leaving the editor when a card is clicked.

const LinkShell = ({
  link,
  preview,
  className,
  children,
}: {
  link: StorefrontLinkItem
  preview: boolean
  className: string
  children: React.ReactNode
}) =>
  preview ? (
    <div className={className}>{children}</div>
  ) : (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  )

export const UrlLink = ({
  link,
  layout,
  preview = false,
}: {
  link: StorefrontLinkItem
  layout: LinksLayout
  preview?: boolean
}) => {
  const title = link.title || getDomain(link.url)
  const host = getDomain(link.url)

  if (layout === 'classic') {
    return (
      <LinkShell
        link={link}
        preview={preview}
        className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm transition-all hover:shadow-md"
      >
        <Thumb link={link} className="h-12 w-12 shrink-0 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
          {link.description && (
            <p className="truncate text-xs text-gray-500">{link.description}</p>
          )}
          <p className="mt-0.5 truncate text-[11px] text-gray-400">{host}</p>
        </div>
        <OpenInNewOutlined
          style={{ fontSize: 16 }}
          className="shrink-0 text-gray-300"
        />
      </LinkShell>
    )
  }

  if (layout === 'image_grid') {
    return (
      <LinkShell
        link={link}
        preview={preview}
        className="group relative block aspect-square overflow-hidden rounded-2xl bg-gray-100 shadow-sm transition-all hover:shadow-md"
      >
        <Thumb
          link={link}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/60 via-black/10 to-transparent p-3">
          <p className="line-clamp-2 text-sm font-semibold text-white">
            {title}
          </p>
          <p className="truncate text-[10px] text-white/70">{host}</p>
        </div>
      </LinkShell>
    )
  }

  if (layout === 'carousel') {
    return (
      <LinkShell
        link={link}
        preview={preview}
        className="flex w-[240px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md"
      >
        <Thumb link={link} className="aspect-[4/3] w-full object-cover" />
        <div className="flex flex-col gap-1 p-3">
          <p className="line-clamp-2 text-sm font-semibold text-gray-900">
            {title}
          </p>
          <p className="truncate text-[11px] text-gray-400">{host}</p>
        </div>
      </LinkShell>
    )
  }

  // card layout
  return (
    <LinkShell
      link={link}
      preview={preview}
      className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md"
    >
      <Thumb link={link} className="aspect-[16/9] w-full object-cover" />
      <div className="flex flex-col gap-1 p-4">
        <p className="truncate text-base font-semibold text-gray-900">{title}</p>
        {link.description && (
          <p className="line-clamp-2 text-sm text-gray-500">{link.description}</p>
        )}
        <p className="mt-1 truncate text-[11px] text-gray-400">{host}</p>
      </div>
    </LinkShell>
  )
}

// A render run within a link block. Mirrors the editor's runs so the live
// page matches the canvas exactly (WYSIWYG). Everything stays in document
// order — nothing is hoisted into a separate "Featured" section.
//   • embed — an embeddable link, always full-width on its own row.
//   • group — consecutive standard links sharing a layout, rendered
//             together so Grid / Carousel arrange multiple links at once.
export type LinkRun =
  | { kind: 'embed'; link: StorefrontLinkItem }
  | { kind: 'group'; layout: LinksLayout; links: StorefrontLinkItem[] }

// An "embedded"-typed link only renders as a full-width iframe when we can
// actually build an embed URL for its platform; otherwise it falls back to
// a normal card and flows inline with the standard links.
export const isEmbeddableLink = (link: StorefrontLinkItem): boolean =>
  link.type === 'embedded' &&
  isEmbeddablePlatform(link.platform) &&
  !!buildEmbedUrl(link.url, link.platform ?? '')

export const buildLinkRuns = (
  links: StorefrontLinkItem[],
  fallback: LinksLayout,
): LinkRun[] => {
  const runs: LinkRun[] = []
  for (const link of links) {
    if (isEmbeddableLink(link)) {
      runs.push({ kind: 'embed', link })
      continue
    }
    const layout = (link.layout ?? fallback) as LinksLayout
    const tail = runs[runs.length - 1]
    if (tail && tail.kind === 'group' && tail.layout === layout) {
      tail.links.push(link)
    } else {
      runs.push({ kind: 'group', layout, links: [link] })
    }
  }
  return runs
}

export const URL_LAYOUT_WRAPPERS: Record<LinksLayout, string> = {
  classic: 'flex flex-col gap-3',
  card: 'flex flex-col gap-4',
  image_grid: 'grid grid-cols-2 gap-3 sm:grid-cols-3',
  carousel:
    '-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2',
}

// ─── Embed card (full-width) ─────────────────────────────────────────────────
// Embeds always take the full container width so they make full use of the
// right-side space column.

export const EmbedCard = ({ link }: { link: StorefrontLinkItem }) => {
  const canEmbed =
    link.type === 'embedded' &&
    link.platform &&
    buildEmbedUrl(link.url, link.platform)

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      {canEmbed ? (
        <EmbedFrame link={link} />
      ) : (
        <Thumb link={link} className="aspect-[16/9] w-full object-cover" />
      )}
      {(link.title || link.description) && (
        <div className="flex flex-col gap-1.5 p-4">
          {link.title && (
            <h3 className="text-base font-bold text-gray-900">{link.title}</h3>
          )}
          {link.description && (
            <p className="line-clamp-2 text-sm text-gray-500">
              {link.description}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────
// Renders the links in document order (WYSIWYG with the editor canvas):
// each standard link uses its own per-link layout, consecutive same-layout
// links group into one Grid / Carousel / list, and embeds sit full-width
// exactly where the creator placed them — nothing is hoisted into a
// separate section.

export const StorefrontLinks = ({
  links,
  layout = 'classic',
  preview = false,
}: {
  links: StorefrontLinkItem[]
  layout?: LinksLayout
  preview?: boolean
}) => {
  if (links.length === 0) return null

  const runs = buildLinkRuns(links, layout)

  return (
    <div className="flex w-full flex-col gap-5">
      {runs.map((run) =>
        run.kind === 'embed' ? (
          <EmbedCard key={run.link.id} link={run.link} />
        ) : (
          <div
            key={run.links[0].id}
            className={
              URL_LAYOUT_WRAPPERS[run.layout] ?? URL_LAYOUT_WRAPPERS.classic
            }
            style={
              run.layout === 'carousel'
                ? { scrollbarWidth: 'thin' }
                : undefined
            }
          >
            {run.links.map((link) => (
              <UrlLink
                key={link.id}
                link={link}
                // A non-embeddable "embedded" link falls back to a card,
                // matching the editor's LinkRow dispatch.
                layout={link.type === 'embedded' ? 'card' : run.layout}
                preview={preview}
              />
            ))}
          </div>
        ),
      )}
    </div>
  )
}
