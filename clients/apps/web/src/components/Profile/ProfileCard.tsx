'use client'

import { useStorefrontSubscribe } from '@/hooks/queries/emailMarketing'
import { focalPointToObjectPosition } from '@/components/Customization/Storefront/StorefrontSidebar/utils'
import {
  resolveSpaceItems,
  type ResolvedSpaceItem,
} from '@/components/Profile/spaceItems'
import { StorefrontLinkItem } from '@/components/Profile/StorefrontLinks'
import { schemas } from '@spaire/client'
import Avatar from '@spaire/ui/components/atoms/Avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@spaire/ui/components/ui/tooltip'
import TranslateOutlined from '@mui/icons-material/TranslateOutlined'
import Verified from '@mui/icons-material/Verified'
import Link from 'next/link'
import { useState } from 'react'
import LogoType from '../Brand/LogoType'
import { getSocialIcon } from './socialPlatforms'

interface ProfileCardProps {
  organization: schemas['Organization']
  products?: schemas['ProductStorefront'][] | schemas['Product'][]
  /**
   * Render in editor-preview mode: external links don't navigate, the
   * subscribe form is disabled. Mutations would otherwise fire against
   * the live API while the org is just looking at their preview.
   */
  preview?: boolean
}

const renderSocialIcon = (platform: string) => {
  const Icon = getSocialIcon(platform)
  return <Icon className="h-6 w-6" />
}

export const ProfileCard = ({
  organization,
  products = [],
  preview = false,
}: ProfileCardProps) => {
  const settings = organization.storefront_settings
  const showHeader = settings?.show_header ?? true
  const showLogo = settings?.show_logo ?? true
  const showName = settings?.show_name ?? true
  const showDescription = settings?.show_description ?? true
  const showCardProducts = settings?.show_card_products ?? true
  const description = settings?.description ?? null
  const profileTitle = settings?.profile_title ?? null
  const skills = settings?.skills ?? []
  const languages = settings?.languages ?? []
  const availableForWork = settings?.available_for_work ?? false
  const contactUrl = settings?.contact_url ?? null

  const headerFocal = (settings as any)?.header_focal_point ?? '50% 50%'

  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [subscribeError, setSubscribeError] = useState<string | null>(null)
  const subscribe = useStorefrontSubscribe()

  // Same RFC 5322-ish check Chromium uses for type=email.
  const EMAIL_REGEX =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

  const handleSubscribe = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (preview) return
    const trimmed = email.trim()
    if (subscribing) return
    if (!trimmed) {
      setSubscribeError('Please enter your email.')
      return
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      setSubscribeError('Please enter a valid email address.')
      return
    }
    setSubscribeError(null)
    setSubscribing(true)
    try {
      const { error } = await subscribe.mutateAsync({
        slug: organization.slug,
        email: trimmed,
      })
      if (error) {
        const detail = (error as { detail?: unknown }).detail
        setSubscribeError(
          typeof detail === 'string'
            ? detail
            : 'Could not subscribe. Please try again.',
        )
        return
      }
      setSubscribed(true)
      setEmail('')
    } catch {
      setSubscribeError('Could not subscribe. Please try again.')
    } finally {
      setSubscribing(false)
    }
  }

  const MAX_VISIBLE_SKILLS = 4

  // Carousel of products in the user's Space. Scoping + ordering come
  // from the shared resolver, so this strip and the main Space below
  // always agree: hide a product via Arrange and it disappears here
  // too, drop it into a new slot and the carousel reorders to match.
  // Only products with images render in the strip.
  const highlights = (() => {
    if (!showCardProducts) return []
    const resolved = resolveSpaceItems({
      settings,
      products,
      links: (settings?.storefront_links ?? []) as StorefrontLinkItem[],
    })
    return resolved
      .filter(
        (i): i is Extract<ResolvedSpaceItem, { kind: 'product' }> =>
          i.kind === 'product' && i.product.medias.length > 0,
      )
      .map((i) => i.product)
  })()

  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      {/* Banner */}
      {showHeader && (
        <div className="relative">
          {settings?.header_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.header_image_url}
              alt=""
              className="aspect-[16/5] w-full object-cover"
              style={{ objectPosition: focalPointToObjectPosition(headerFocal) }}
            />
          ) : (
            <div className="aspect-[16/5] w-full bg-gradient-to-br from-gray-800 to-gray-950" />
          )}
        </div>
      )}

      <div className="relative flex flex-col px-6 pb-6">
        {/* Avatar — overlapping banner, full-bleed logo */}
        {showLogo && (
          <div className={showHeader ? '-mt-10' : 'mt-6'}>
            {organization.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={organization.avatar_url}
                alt={organization.name}
                className="h-20 w-20 rounded-xl border-4 border-white object-cover shadow-sm"
              />
            ) : (
              <Avatar
                className="h-20 w-20 rounded-xl border-4 border-white text-lg shadow-sm"
                name={organization.name}
                avatar_url={null}
              />
            )}
          </div>
        )}

        {/* Profile title label + Name with verified badge */}
        {showName && (
          <div className={`flex flex-col gap-y-0.5 ${showLogo ? 'mt-5' : 'mt-6'}`}>
            {profileTitle && (
              <span className="text-[11px] font-semibold uppercase tracking-widest text-emerald-600">
                {profileTitle}
              </span>
            )}
            <div className="flex flex-row items-center gap-x-1.5">
              <h1 className="text-[26px] font-bold leading-tight text-gray-950">
                {organization.name}
              </h1>
              <Verified className="h-5 w-5 text-blue-500" />
            </div>
          </div>
        )}

        {/* Description */}
        {showDescription && description && (
          <p className="mt-4 text-[14px] leading-relaxed text-gray-500">
            {description}
          </p>
        )}

        {/* Available for work + Languages */}
        {(availableForWork || languages.length > 0) && (
          <div className="mt-4 flex flex-row flex-wrap items-center gap-2">
            {availableForWork &&
              (contactUrl && !preview ? (
                <a
                  href={contactUrl}
                  target={
                    contactUrl.startsWith('mailto:') ? undefined : '_blank'
                  }
                  rel="noopener noreferrer"
                  className="rounded-full border border-blue-200 px-3 py-1 text-[12px] font-medium text-[#0066cc] transition-colors hover:bg-blue-50"
                >
                  Work with me →
                </a>
              ) : (
                <span className="rounded-full border border-blue-200 px-3 py-1 text-[12px] font-medium text-[#0066cc]">
                  Work with me
                </span>
              ))}
            {languages.length > 0 &&
              (languages.length <= 2 ? (
                <span className="flex flex-row items-center gap-x-1.5 rounded-full border border-gray-200 px-3 py-1 text-[12px] text-gray-500">
                  <TranslateOutlined style={{ fontSize: 14 }} />
                  {languages.join(', ')}
                </span>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex flex-row items-center gap-x-1.5 rounded-full border border-gray-200 px-3 py-1 text-[12px] text-gray-500"
                    >
                      <TranslateOutlined style={{ fontSize: 14 }} />
                      {languages[0]}, {languages.length - 1} more
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{languages.join(', ')}</TooltipContent>
                </Tooltip>
              ))}
          </div>
        )}

        {/* Skill tags */}
        {skills.length > 0 && (
          <div className="mt-3 flex flex-row flex-wrap gap-2">
            {skills.slice(0, MAX_VISIBLE_SKILLS).map((skill: string) => (
              <span
                key={skill}
                className="rounded-full border border-gray-200 px-3 py-1 text-[12px] text-gray-600"
              >
                {skill}
              </span>
            ))}
            {skills.length > MAX_VISIBLE_SKILLS && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="rounded-full border border-gray-200 px-3 py-1 text-[12px] text-gray-400"
                  >
                    +{skills.length - MAX_VISIBLE_SKILLS}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {skills.slice(MAX_VISIBLE_SKILLS).join(', ')}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {/* Social icons */}
        {organization.socials.length > 0 && (
          <div className="mt-4 flex flex-row items-center gap-x-3">
            {organization.socials.map((social, i) =>
              preview ? (
                <span
                  key={i}
                  className="text-gray-800"
                  aria-label={social.platform}
                >
                  {renderSocialIcon(social.platform)}
                </span>
              ) : (
                <Link
                  key={i}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-800 transition-colors hover:text-gray-950"
                >
                  {renderSocialIcon(social.platform)}
                </Link>
              ),
            )}
          </div>
        )}

        {/* Highlights — auto-scrolling carousel of products that live on
            the Space. The marquee duplicates the track to loop seamlessly,
            but with fewer than MARQUEE_MIN items the duplicate is visible
            side-by-side (e.g. one course rendered twice), so we render a
            static row in that case. */}
        {highlights.length > 0 && (() => {
          const MARQUEE_MIN = 4
          const shouldMarquee = highlights.length >= MARQUEE_MIN
          if (!shouldMarquee) {
            return (
              <div className="mt-5 flex flex-row gap-2 overflow-x-auto pb-1">
                {highlights.map((product) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={product.id}
                    src={product.medias[0].public_url}
                    alt={product.name}
                    className="h-16 w-16 shrink-0 rounded-lg object-cover"
                  />
                ))}
              </div>
            )
          }
          return (
            <div
              className="profile-card-marquee mt-5"
              aria-label="Featured products"
            >
              <div
                className="profile-card-marquee-track"
                style={
                  {
                    '--marquee-duration': `${Math.max(8, highlights.length * 3.5)}s`,
                  } as React.CSSProperties
                }
              >
                {[...highlights, ...highlights].map((product, idx) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${product.id}-${idx < highlights.length ? 'a' : 'b'}`}
                    src={product.medias[0].public_url}
                    alt={product.name}
                    aria-hidden={idx >= highlights.length}
                    className="h-16 w-16 shrink-0 rounded-lg object-cover"
                  />
                ))}
              </div>
            </div>
          )
        })()}

        {/* Email Subscribe */}
        {subscribed ? (
          <div className="mt-5 flex items-center justify-center rounded-xl bg-green-50 px-4 py-3 text-[13px] font-medium text-green-700">
            You&apos;re subscribed!
          </div>
        ) : (
          <form onSubmit={handleSubscribe} className="mt-5 flex flex-col gap-1.5">
            <div className="flex flex-row gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (subscribeError) setSubscribeError(null)
                }}
                placeholder={
                  preview
                    ? 'Subscribe (disabled in preview)'
                    : 'Enter your email address...'
                }
                disabled={preview}
                aria-invalid={subscribeError ? true : undefined}
                aria-describedby={
                  subscribeError ? 'subscribe-error' : undefined
                }
                className={`min-w-0 flex-1 rounded-xl border bg-white px-4 py-2.5 text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 ${
                  subscribeError
                    ? 'border-red-300 focus:border-red-400'
                    : 'border-gray-200 focus:border-gray-300'
                }`}
              />
              <button
                type="submit"
                disabled={preview || subscribing || !email.trim()}
                className="shrink-0 rounded-xl bg-blue-500 px-5 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {subscribing ? 'Subscribing...' : 'Subscribe'}
              </button>
            </div>
            {subscribeError && (
              <p id="subscribe-error" className="text-[12px] text-red-500">
                {subscribeError}
              </p>
            )}
          </form>
        )}

        {/* Powered by Spaire */}
        <div className="mt-6 flex flex-row items-center justify-center gap-x-1.5 border-t border-gray-100 pt-4">
          <span className="text-[11px] text-gray-400">Powered by</span>
          <LogoType className="h-4" />
        </div>
      </div>
    </div>
    </TooltipProvider>
  )
}
