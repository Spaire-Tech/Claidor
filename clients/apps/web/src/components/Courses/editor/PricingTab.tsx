'use client'

/**
 * Course editor — Pricing tab.
 *
 * Community-hub grouped-list design (.glist / .grow rows, hub Toggle) so it
 * matches the Settings / Community tabs. The paywall toggle and position
 * persist inline — no save bar, exactly like community settings.
 */
import LegacyRecurringProductPrices from '@/components/Products/LegacyRecurringProductPrices'
import ProductPriceLabel from '@/components/Products/ProductPriceLabel'
import { CourseRead, useUpdateCourse } from '@/hooks/queries/courses'
import { useOrganizationPaymentStatus } from '@/hooks/queries/org'
import { useProduct } from '@/hooks/queries/products'
import { getQueryClient } from '@/utils/api/query'
import { hasLegacyRecurringPrices } from '@/utils/product'
import { schemas } from '@spaire/client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { toast } from '../../Toast/use-toast'
import { Toggle } from '../../Community/hub/atoms'
import '../../Community/hub/hub.css'
import '../../Community/hub/hub-extra.css'
import { EditPricingModal } from './EditPricingModal'
import { CourseSettingsEdits } from './SettingsTab'

export type { CourseSettingsEdits }

export function PricingTab({
  organization,
  course,
}: {
  organization: schemas['Organization']
  course: CourseRead
  onSave?: (edits: CourseSettingsEdits) => void
  isSaving?: boolean
}) {
  const { data: paymentStatus } = useOrganizationPaymentStatus(organization.id)
  const { data: product } = useProduct(course.product_id)
  const updateCourse = useUpdateCourse()

  const [enabled, setEnabled] = useState(course.paywall_enabled)
  const [position, setPosition] = useState<number | null>(
    course.paywall_position ?? 0,
  )
  const [editingPrice, setEditingPrice] = useState(false)

  const allLessons = course.modules.flatMap((m) => m.lessons)

  useEffect(() => {
    setEnabled(course.paywall_enabled)
    setPosition(course.paywall_position ?? 0)
  }, [course.id, course.paywall_enabled, course.paywall_position])

  const flaggedAfterPaywall = useMemo(() => {
    const cut = Math.min(position ?? 0, allLessons.length)
    return allLessons.slice(cut).filter((l) => l.is_free_preview).length
  }, [allLessons, position])

  const lockedCount =
    enabled && position != null
      ? Math.max(0, allLessons.length - position - flaggedAfterPaywall)
      : 0

  const showPayoutBanner = paymentStatus && !paymentStatus.payment_ready

  // Silent inline persist (matches community settings).
  const persist = async (body: {
    paywall_enabled?: boolean
    paywall_position?: number | null
  }) => {
    try {
      await updateCourse.mutateAsync({ courseId: course.id, body })
      getQueryClient().invalidateQueries({
        queryKey: ['courses', { courseId: course.id }],
      })
    } catch {
      setEnabled(course.paywall_enabled)
      setPosition(course.paywall_position ?? 0)
      toast({ title: 'Could not save the paywall' })
    }
  }

  const toggleEnabled = () => {
    const next = !enabled
    setEnabled(next)
    persist({
      paywall_enabled: next,
      paywall_position: next ? (position ?? 0) : null,
    })
  }

  const commitPosition = (raw: string) => {
    const parsed = raw === '' ? 0 : parseInt(raw, 10)
    if (!Number.isFinite(parsed)) return
    const clamped = Math.max(0, Math.min(allLessons.length, parsed))
    setPosition(clamped)
    if (clamped !== (course.paywall_position ?? 0))
      persist({ paywall_enabled: true, paywall_position: clamped })
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-8">
      <div className="spaire-hub dark hub-embed">
        <div className="cr-head">
          <div>
            <div className="h">Pricing</div>
            <div className="s">The price and where the paywall sits.</div>
          </div>
        </div>

        {showPayoutBanner && (
          <div className="card glist" style={{ marginBottom: 26 }}>
            <div className="grow">
              <div className="grow-main">
                <div className="gl">Set up payouts</div>
                <div className="gs">
                  Finish your payout account to get paid.
                </div>
              </div>
              <div className="grow-ctl">
                <Link
                  href={`/dashboard/${organization.slug}/finance/account`}
                  className="btn btn-primary btn-sm"
                >
                  Set up
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Price */}
        <div className="glist-label">Price</div>
        <div className="card glist" style={{ marginBottom: 26 }}>
          <div className="grow">
            <div className="grow-main">
              <div className="gl">
                {product ? (
                  hasLegacyRecurringPrices(product) ? (
                    <LegacyRecurringProductPrices product={product} />
                  ) : (
                    <ProductPriceLabel product={product} />
                  )
                ) : (
                  '—'
                )}
              </div>
              <div className="gs">What students pay at checkout.</div>
            </div>
            <div className="grow-ctl">
              {product && (
                <button
                  className="btn btn-quiet btn-sm"
                  onClick={() => setEditingPrice(true)}
                >
                  Edit price
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Paywall */}
        <div className="glist-label">Paywall</div>
        <div className="card glist">
          <div className="grow">
            <div className="grow-main">
              <div className="gl">Paywall</div>
              <div className="gs">
                Free preview above, locked below.
              </div>
            </div>
            <div className="grow-ctl">
              <Toggle on={enabled} onClick={toggleEnabled} />
            </div>
          </div>

          {enabled && (
            <div className="grow">
              <div className="grow-main">
                <div className="gl">Free lessons</div>
                <div className="gs">
                  {lockedCount === 0
                    ? 'Every lesson is a free preview.'
                    : `${lockedCount} of ${allLessons.length} locked` +
                      (flaggedAfterPaywall > 0
                        ? ` · ${flaggedAfterPaywall} more free by tag`
                        : '')}
                </div>
              </div>
              <div className="grow-ctl">
                <input
                  className="input num"
                  type="number"
                  min={0}
                  max={allLessons.length}
                  value={position ?? ''}
                  onChange={(e) => setPosition(
                    e.target.value === '' ? null : parseInt(e.target.value, 10),
                  )}
                  onBlur={(e) => commitPosition(e.target.value)}
                  style={{ width: 90, minWidth: 90, textAlign: 'center' }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {editingPrice && product && (
        <EditPricingModal
          organization={organization}
          product={product}
          onClose={() => setEditingPrice(false)}
        />
      )}
    </div>
  )
}
