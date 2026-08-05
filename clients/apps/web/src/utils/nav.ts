import { CONFIG } from '@/utils/config'
import { schemas } from '@spaire/client'
import type { Organization as OrganizationSDK } from '@spaire/sdk/models/components/organization'

export const organizationPageLink = (
  org:
    | schemas['Organization']
    | schemas['CustomerOrganization']
    | OrganizationSDK,
  path?: string,
): string => {
  return `${CONFIG.FRONTEND_BASE_URL}/${org.slug}/${path ?? ''}`
}

/**
 * Generate a public Spaire Space URL for sharing and SEO.
 * e.g., https://space.spairehq.com/miles-becker
 */
export const spacePageLink = (
  org:
    | schemas['Organization']
    | schemas['CustomerOrganization']
    | OrganizationSDK,
  path?: string,
): string => {
  return `${CONFIG.SPACE_BASE_URL}/${org.slug}/${path ?? ''}`
}

/**
 * Public storefront URL for sharing, SEO and "view live" links: the
 * creator's custom domain when one is live (slug-less paths, e.g.
 * https://learn.creator.com/products/123), else the platform-hosted URL.
 */
export const storefrontLink = (
  org:
    | schemas['Organization']
    | schemas['CustomerOrganization']
    | OrganizationSDK,
  path?: string,
): string => {
  const customDomain =
    'custom_domain' in org ? (org.custom_domain ?? null) : null
  if (customDomain) {
    return `https://${customDomain}/${path ?? ''}`
  }
  return spacePageLink(org, path)
}
