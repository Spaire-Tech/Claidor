import { schemas } from '@claidor/client'

// Client-side mirror of the backend's OrganizationStorefrontSettings
// defaults. The generated OpenAPI type marks every defaulted field as
// required, so anywhere the dashboard builds a settings object from a
// partial (e.g. a brand-new org where storefront_settings is null) has
// to fill the gaps with the same defaults the server would apply.
export const STOREFRONT_SETTINGS_DEFAULTS: schemas['OrganizationStorefrontSettings'] =
  {
    enabled: false,
    theme: 'light',
    show_header: true,
    show_logo: true,
    show_name: true,
    show_description: true,
    index: true,
    thumbnail_size: 'large',
    show_product_details: true,
    available_for_work: false,
    featured_mode: 'curated',
    show_card_products: true,
    links_position: 'after_products',
    links_layout: 'classic',
  }

export const withStorefrontSettingsDefaults = (
  settings?: Partial<schemas['OrganizationStorefrontSettings']> | null,
): schemas['OrganizationStorefrontSettings'] => ({
  ...STOREFRONT_SETTINGS_DEFAULTS,
  ...(settings ?? {}),
})
