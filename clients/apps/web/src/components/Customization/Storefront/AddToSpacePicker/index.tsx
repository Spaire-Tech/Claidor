'use client'

import { Portal } from '@/components/Customization/InlineEdit/Portal'
import { schemas } from '@spaire/client'
import { useEffect, useState } from 'react'
import { CatalogTab } from './CatalogTab'
import { CourseTab } from './CourseTab'
import { EmbedPickPayload, EmbedTab } from './EmbedTab'
import { FormPickPayload, FormTab } from './FormTab'
import { UrlPickPayload, UrlTab } from './UrlTab'

export type { EmbedPickPayload, FormPickPayload, UrlPickPayload }

export type AddToSpacePickerCallbacks = {
  onAddLink: (payload: UrlPickPayload) => void
  onAddEmbed: (payload: EmbedPickPayload) => void
  // Diff-based product callback: `addIds` are newly-selected items in
  // this picker session, `removeIds` are items that were in
  // `alreadySelectedProductIds` but the creator de-selected. This lets
  // the picker double as a remove-from-Space tool — the displayed
  // selection state reflects what's actually featured.
  onChangeProducts: (addIds: string[], removeIds: string[]) => void
  onCreateProduct: () => void
  onCreateCourse: () => void
  onAddForm: (payload: FormPickPayload) => void
}

const TABS = ['URL', 'Embed', 'Digital Product', 'Course', 'Form'] as const
type Tab = (typeof TABS)[number]

export const AddToSpacePicker = ({
  organization,
  initialTab = 'URL',
  alreadySelectedProductIds = [],
  onClose,
  callbacks,
  dark = false,
}: {
  organization: schemas['Organization']
  initialTab?: Tab
  // Product IDs already featured on the Space — both Catalog and
  // Course tabs seed their selection set with these so creators see
  // what's already in. Toggling off and clicking Save removes them.
  alreadySelectedProductIds?: string[]
  onClose: () => void
  callbacks: AddToSpacePickerCallbacks
  // Mirrors the Space's dark theme. The picker portals to <body> (outside the
  // editor's `.space-dark` root), so it carries its own marker class.
  dark?: boolean
}) => {
  const [tab, setTab] = useState<Tab>(initialTab)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Close + propagate the pick.
  const wrap =
    <T,>(fn: (x: T) => void) =>
    (x: T) => {
      fn(x)
      onClose()
    }

  return (
    <Portal>
      <div className="picker-backdrop" onClick={onClose} />
      <div
        className={`pk-library waterglass${dark ? ' space-dark' : ''}`}
        role="dialog"
        aria-label="Add to your Space"
        aria-modal="true"
      >
        <div className="wg-head">
          <div className="wg-title">Add to your Space</div>
          <button
            type="button"
            className="wg-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="wg-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="wg-body">
          {tab === 'URL' && (
            <UrlTab
              organization={organization}
              onPick={wrap(callbacks.onAddLink)}
            />
          )}
          {tab === 'Embed' && (
            <EmbedTab
              organization={organization}
              onPick={wrap(callbacks.onAddEmbed)}
            />
          )}
          {tab === 'Digital Product' && (
            <CatalogTab
              organization={organization}
              alreadySelectedIds={alreadySelectedProductIds}
              onSubmit={(addIds, removeIds) => {
                callbacks.onChangeProducts(addIds, removeIds)
                onClose()
              }}
              onCreateNew={() => {
                onClose()
                callbacks.onCreateProduct()
              }}
            />
          )}
          {tab === 'Course' && (
            <CourseTab
              organization={organization}
              alreadySelectedIds={alreadySelectedProductIds}
              onSubmit={(addIds, removeIds) => {
                callbacks.onChangeProducts(addIds, removeIds)
                onClose()
              }}
              onCreateNew={() => {
                onClose()
                callbacks.onCreateCourse()
              }}
            />
          )}
          {tab === 'Form' && (
            <FormTab
              organization={organization}
              onPick={wrap(callbacks.onAddForm)}
            />
          )}
        </div>
      </div>
    </Portal>
  )
}
