'use client'

import { useForms } from '@/hooks/queries/forms'
import { schemas } from '@spaire/client'
import Link from 'next/link'

export type FormPickPayload = {
  id: string
  title: string
}

// Card grid mirroring CourseTab / the product picker: each lead magnet is a
// tile with its cover art + title, plus a "New form" create tile. Picking a
// tile adds that form to the Space.
export const FormTab = ({
  organization,
  onPick,
}: {
  organization: schemas['Organization']
  onPick: (payload: FormPickPayload) => void
}) => {
  const { data, isLoading } = useForms(organization.id, { limit: 100 })
  const forms = data?.items ?? []

  return (
    <div className="wg-tab">
      <p className="wg-help">
        Add a lead-capture form to your Space. Only published forms show to
        visitors.
      </p>

      {isLoading ? (
        <div className="wg-grid three">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="wg-skeleton" />
          ))}
        </div>
      ) : (
        <div className="wg-grid three">
          <Link
            href={`/dashboard/${organization.slug}/forms/new`}
            className="wg-tile create"
          >
            <div className="wg-tile-art empty">+</div>
            <div className="wg-tile-meta">
              <div className="wg-tile-title">New form</div>
            </div>
          </Link>

          {forms.map((form) => {
            const title = form.title || 'Untitled form'
            return (
              <button
                key={form.id}
                type="button"
                className="wg-tile"
                onClick={() => onPick({ id: form.id, title: form.title })}
              >
                <div
                  className="wg-tile-art"
                  style={{
                    backgroundImage: form.image_url
                      ? `url(${form.image_url})`
                      : 'linear-gradient(135deg, #0054b1, #4998fe)',
                  }}
                >
                  {!form.image_url && (title[0]?.toUpperCase() ?? '·')}
                </div>
                <div className="wg-tile-meta">
                  <div className="wg-tile-title">{title}</div>
                  {form.subtitle ? (
                    <div className="wg-tile-sub">{form.subtitle}</div>
                  ) : null}
                </div>
                <span className="wg-tile-check" aria-hidden>
                  +
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
