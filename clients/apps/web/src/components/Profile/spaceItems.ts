// Space items — the single source of truth for what shows on the
// Space and in what order.
//
// Why this module exists
// ──────────────────────
// Before `space_items` existed, the order of a Space was reconstructed
// at render time from three independent fields on
// OrganizationStorefrontSettings:
//
//   • featured_product_ids — which products + their rank
//   • storefront_links     — link entries + their rank
//   • block_order          — whether the products section or the links
//                            section comes first
//
// That made it impossible to interleave kinds (a link between two
// products, a course between two links, etc.) and the Arrange UI had
// to invent the same composition logic on top. `space_items` is one
// flat ordered list of `{ kind, id, hidden? }` entries that every
// renderer and editor reads through this module. The legacy fields
// stay around for backcompat: when `space_items` is empty (or absent)
// the resolver derives the equivalent list from them, so untouched
// Spaces keep rendering identically.
//
// Lifecycle
// ─────────
//   1. New Spaces get `space_items: []` by default and behave the same
//      as before — the resolver fills in from legacy fields.
//   2. The first write through `withSpaceItems(...)` materialises the
//      derived list onto `space_items`, locking the Space into the new
//      flat-ordering model. From that point on the legacy fields are
//      ignored by the resolver and only kept around so older clients
//      that still read them don't break.

import { FormPublic } from '@/hooks/queries/forms'
import { schemas } from '@spaire/client'
import { StorefrontLinkItem } from './StorefrontLinks'

export type SpaceItemKind = 'product' | 'link' | 'form'

export type SpaceItem = {
  kind: SpaceItemKind
  id: string
  hidden?: boolean
}

// `space_items` isn't in the generated OpenAPI types yet (it lands the
// next time `pnpm generate` runs against a backend that includes the
// new field). Until then we pierce the cast at the boundary so the
// rest of the codebase can treat it as a first-class field.
type SettingsWithItems = schemas['OrganizationStorefrontSettings'] & {
  space_items?: SpaceItem[]
}

export const readSpaceItems = (
  settings:
    | schemas['OrganizationStorefrontSettings']
    | null
    | undefined,
): SpaceItem[] => {
  const items = (settings as SettingsWithItems | null | undefined)
    ?.space_items
  return Array.isArray(items) ? items : []
}

// A resolved Space item — same as the persisted SpaceItem but with the
// referenced product or link object attached so renderers don't have
// to chase ids again. Items whose id no longer resolves (deleted
// product, link removed elsewhere) are filtered out at resolve time so
// stale ids never reach the renderer.
export type ResolvedSpaceItem =
  | {
      kind: 'product'
      id: string
      hidden: boolean
      product: schemas['ProductStorefront']
    }
  | {
      kind: 'link'
      id: string
      hidden: boolean
      link: StorefrontLinkItem
    }
  | {
      kind: 'form'
      id: string
      hidden: boolean
      form: FormPublic
    }

// Build the canonical ordered list a renderer should consume.
//
//   • Prefer the persisted `space_items` order.
//   • Fall back to legacy ordering (featured_product_ids +
//     storefront_links + block_order) when `space_items` is empty.
//   • Drop ids that no longer resolve (archived products, deleted
//     links). The persisted order keeps them around (so unarchiving
//     restores the slot) but the renderer never sees them.
//
// What we *don't* do: auto-append catalog rows that aren't in
// `space_items`. An earlier version did, on the theory that
// freshly-created products should auto-appear on the Space — but it
// made removal impossible (anything you removed from space_items just
// floated to the bottom on the next render). The Space is now strictly
// opt-in: new products show up via the picker (which writes to
// space_items), and newly added links go through the link panel's
// addLink → appendSpaceItem path. Removal sticks.
//
// `includeHidden` is for editor surfaces (the Arrange panel) that need
// to render hidden rows in a muted state so the creator can flip the
// flag back. The public renderer always omits hidden items.
export const resolveSpaceItems = ({
  settings,
  products,
  links,
  forms = [],
  includeHidden = false,
}: {
  settings:
    | schemas['OrganizationStorefrontSettings']
    | null
    | undefined
  products: schemas['ProductStorefront'][]
  links: StorefrontLinkItem[]
  // Published forms referenced by `kind: 'form'` items. Optional so editor
  // surfaces that don't (yet) load forms keep compiling — form items just
  // don't resolve there, but they stay in `space_items`.
  forms?: FormPublic[]
  includeHidden?: boolean
}): ResolvedSpaceItem[] => {
  const productById = new Map(products.map((p) => [p.id, p]))
  const linkById = new Map(links.map((l) => [l.id, l]))
  const formById = new Map(forms.map((f) => [f.id, f]))

  const persisted = readSpaceItems(settings)
  const ordered: SpaceItem[] =
    persisted.length > 0
      ? persisted
      : deriveLegacySpaceItems({ settings, products, links })

  const seenProducts = new Set<string>()
  const seenLinks = new Set<string>()
  const seenForms = new Set<string>()
  const resolved: ResolvedSpaceItem[] = []

  for (const item of ordered) {
    if (item.kind === 'product') {
      const product = productById.get(item.id)
      if (!product || seenProducts.has(item.id)) continue
      seenProducts.add(item.id)
      const hidden = Boolean(item.hidden)
      if (hidden && !includeHidden) continue
      resolved.push({ kind: 'product', id: item.id, hidden, product })
    } else if (item.kind === 'link') {
      const link = linkById.get(item.id)
      if (!link || seenLinks.has(item.id)) continue
      seenLinks.add(item.id)
      const hidden = Boolean(item.hidden)
      if (hidden && !includeHidden) continue
      resolved.push({ kind: 'link', id: item.id, hidden, link })
    } else if (item.kind === 'form') {
      const form = formById.get(item.id)
      if (!form || seenForms.has(item.id)) continue
      seenForms.add(item.id)
      const hidden = Boolean(item.hidden)
      if (hidden && !includeHidden) continue
      resolved.push({ kind: 'form', id: item.id, hidden, form })
    }
  }

  return resolved
}

// Backcompat path. Reconstruct an ordered `SpaceItem[]` from the three
// legacy fields the renderer used before this module existed. Only
// called when `space_items` itself is empty.
const deriveLegacySpaceItems = ({
  settings,
  products,
  links,
}: {
  settings:
    | schemas['OrganizationStorefrontSettings']
    | null
    | undefined
  products: schemas['ProductStorefront'][]
  links: StorefrontLinkItem[]
}): SpaceItem[] => {
  const featuredMode = settings?.featured_mode ?? 'curated'
  const featuredIds = (settings?.featured_product_ids ?? []) as string[]
  const blockOrder = ((
    settings as { block_order?: ('products' | 'links' | 'forms')[] } | null | undefined
  )?.block_order ?? ['products', 'links']) as (
    | 'products'
    | 'links'
    | 'forms'
  )[]

  // Same product scoping the public storefront used before: in 'all'
  // mode show every product; in 'curated' mode show only featured ids.
  // `featured_product_ids` also doubled as a rank, so ranked products
  // come first in declared order, then unranked products in server
  // order.
  const productIds = (() => {
    const valid = new Set(products.map((p) => p.id))
    const scoped =
      featuredMode === 'curated'
        ? featuredIds.filter((id) => valid.has(id))
        : (() => {
            const rank = new Map(featuredIds.map((id, i) => [id, i]))
            const ranked = featuredIds.filter((id) => valid.has(id))
            const unranked = products
              .filter((p) => !rank.has(p.id))
              .map((p) => p.id)
            return [...ranked, ...unranked]
          })()
    return scoped
  })()

  const linkIds = links.map((l) => l.id)

  const productItems: SpaceItem[] = productIds.map((id) => ({
    kind: 'product',
    id,
  }))
  const linkItems: SpaceItem[] = linkIds.map((id) => ({ kind: 'link', id }))

  const out: SpaceItem[] = []
  for (const kind of blockOrder) {
    if (kind === 'products') out.push(...productItems)
    else if (kind === 'links') out.push(...linkItems)
    // 'forms' isn't shipping yet
  }
  // Defense: any kind not in blockOrder (shouldn't happen, but the
  // type allows it) falls through after the loop.
  return out
}

// ── Mutations ───────────────────────────────────────────────────────
//
// Each mutator takes the current settings + catalog/link context and
// returns a Partial<settings> patch ready to feed to setValue or
// updateOrganization. Mutators always materialise the derived order
// onto `space_items` before applying changes so legacy fields never
// silently override a subsequent edit.

export const withSpaceItems = (
  settings:
    | schemas['OrganizationStorefrontSettings']
    | null
    | undefined,
  next: SpaceItem[],
): { space_items: SpaceItem[] } => ({
  // We only patch `space_items` here. Legacy fields stay untouched so
  // older client builds that still read them don't see a sudden order
  // change before they pick up this module.
  space_items: next,
})

// Materialise `space_items` from the current resolver output. Used by
// every mutator below so the first write after migration locks the
// derived order in.
const materialise = ({
  settings,
  products,
  links,
}: {
  settings:
    | schemas['OrganizationStorefrontSettings']
    | null
    | undefined
  products: schemas['ProductStorefront'][]
  links: StorefrontLinkItem[]
}): SpaceItem[] => {
  const persisted = readSpaceItems(settings)
  if (persisted.length > 0) return persisted.map((i) => ({ ...i }))
  // Same derivation the resolver uses — but we keep hidden=false on
  // every derived item (legacy mode had no hide state).
  return deriveLegacySpaceItems({ settings, products, links })
}

export const reorderSpaceItem = ({
  settings,
  products,
  links,
  fromId,
  toId,
}: {
  settings:
    | schemas['OrganizationStorefrontSettings']
    | null
    | undefined
  products: schemas['ProductStorefront'][]
  links: StorefrontLinkItem[]
  fromId: string
  toId: string
}): { space_items: SpaceItem[] } | null => {
  if (fromId === toId) return null
  const list = materialise({ settings, products, links })
  const from = list.findIndex((i) => itemKey(i) === fromId)
  const to = list.findIndex((i) => itemKey(i) === toId)
  if (from < 0 || to < 0) return null
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return withSpaceItems(settings, next)
}

export const removeSpaceItem = ({
  settings,
  products,
  links,
  key,
}: {
  settings:
    | schemas['OrganizationStorefrontSettings']
    | null
    | undefined
  products: schemas['ProductStorefront'][]
  links: StorefrontLinkItem[]
  key: string
}): { space_items: SpaceItem[] } => {
  const list = materialise({ settings, products, links })
  return withSpaceItems(
    settings,
    list.filter((i) => itemKey(i) !== key),
  )
}

export const setItemHidden = ({
  settings,
  products,
  links,
  key,
  hidden,
}: {
  settings:
    | schemas['OrganizationStorefrontSettings']
    | null
    | undefined
  products: schemas['ProductStorefront'][]
  links: StorefrontLinkItem[]
  key: string
  hidden: boolean
}): { space_items: SpaceItem[] } => {
  const list = materialise({ settings, products, links })
  return withSpaceItems(
    settings,
    list.map((i) => (itemKey(i) === key ? { ...i, hidden } : i)),
  )
}

export const appendSpaceItem = ({
  settings,
  products,
  links,
  item,
}: {
  settings:
    | schemas['OrganizationStorefrontSettings']
    | null
    | undefined
  products: schemas['ProductStorefront'][]
  links: StorefrontLinkItem[]
  item: SpaceItem
}): { space_items: SpaceItem[] } => {
  const list = materialise({ settings, products, links })
  // If the item is already in the list, unhide it and float it to the
  // end so the creator sees "I just added this" in a predictable spot.
  const existing = list.findIndex((i) => itemKey(i) === itemKey(item))
  if (existing >= 0) {
    const next = [...list]
    const [found] = next.splice(existing, 1)
    next.push({ ...found, hidden: false })
    return withSpaceItems(settings, next)
  }
  return withSpaceItems(settings, [...list, { ...item }])
}

// Bulk add/remove for the product picker. Adds go to the end (in the
// order they were toggled on); removes drop matching ids in place.
export const reconcileSpaceProducts = ({
  settings,
  products,
  links,
  addIds,
  removeIds,
}: {
  settings:
    | schemas['OrganizationStorefrontSettings']
    | null
    | undefined
  products: schemas['ProductStorefront'][]
  links: StorefrontLinkItem[]
  addIds: string[]
  removeIds: string[]
}): { space_items: SpaceItem[] } => {
  let list = materialise({ settings, products, links })
  const removed = new Set(removeIds)
  list = list.filter(
    (i) => !(i.kind === 'product' && removed.has(i.id)),
  )
  const presentProductIds = new Set(
    list.filter((i) => i.kind === 'product').map((i) => i.id),
  )
  for (const id of addIds) {
    if (presentProductIds.has(id)) continue
    list.push({ kind: 'product', id })
    presentProductIds.add(id)
  }
  return withSpaceItems(settings, list)
}

// A stable string key for an item — used by dnd-kit, React keys, and
// any "find by item" lookup. `kind:id` so the same id under a
// different kind (extremely unlikely, but possible) never collides.
export const itemKey = (item: SpaceItem | ResolvedSpaceItem): string =>
  `${item.kind}:${item.id}`
