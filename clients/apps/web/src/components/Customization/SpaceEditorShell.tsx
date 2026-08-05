'use client'

import { ProfileCard } from '@/components/Profile/ProfileCard'
import { useProducts } from '@/hooks/queries'
import { DEFAULT_FORM_STYLE, FormPublic, useForms } from '@/hooks/queries/forms'
import { schemas } from '@spaire/client'
import { DraggableBlocks } from './InlineEdit/DraggableBlocks'
import { EditableProfileCard } from './InlineEdit/EditableProfileCard'

// Renders the live preview of the user's Spaire Space inside the
// editor canvas. Both children subscribe to form state directly via
// useFormContext, so we DON'T watch here — otherwise every keystroke
// in the profile card would re-render the entire product/links grid.

export const SpaceEditorCanvas = ({
  organization: org,
  hasSettingsPanel,
  onAddToSpace,
}: {
  organization: schemas['Organization']
  hasSettingsPanel: boolean
  onAddToSpace?: () => void
}) => {
  // Bumped limit so the canvas + picker show the full catalog instead
  // of paginating at 10. 100 covers the long tail; users with more
  // than that can curate via the picker.
  const { data: productsData } = useProducts(org.id, {
    is_archived: false,
    limit: 100,
  })
  const products = (productsData?.items ?? []) as unknown as schemas['ProductStorefront'][]

  // All of the org's forms (draft + published) so a just-added form shows on
  // the canvas immediately. Mapped to the public shape the resolver/blocks
  // expect.
  const { data: formsData } = useForms(org.id, { limit: 100 })
  const forms: FormPublic[] = (formsData?.items ?? []).map((f) => ({
    id: f.id,
    organization_id: f.organization_id,
    title: f.title,
    subtitle: f.subtitle,
    button_label: f.button_label,
    success_message: f.success_message,
    has_lead_magnet: f.file_id != null,
    lead_magnet_name: null,
    image_url: f.image_url ?? null,
    style: f.style ?? DEFAULT_FORM_STYLE,
    attached_custom_fields: f.attached_custom_fields,
  }))

  return (
    <div className={`canvas-wrap${hasSettingsPanel ? ' has-panel' : ''}`}>
      <div className="canvas">
        <aside className="col-left">
          <div className="canvas-card">
            <EditableProfileCard organization={org} products={products} />
          </div>
        </aside>
        <main className="col-right">
          <DraggableBlocks
            organization={org}
            products={products}
            forms={forms}
            onAddToSpace={onAddToSpace}
          />
          <div className="footer-note">That&apos;s everything on your Space.</div>
        </main>
      </div>
    </div>
  )
}

// Re-exported so we don't accidentally tree-shake out the read-only
// ProfileCard (used by the published-preview branch elsewhere).
export { ProfileCard }

