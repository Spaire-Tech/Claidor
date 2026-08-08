'use client'

import { useAuth } from '@/hooks/auth'
import { OrganizationContext } from '@/providers/maintainerOrganization'
import dynamic from 'next/dynamic'
import { useContext, useEffect, useState } from 'react'

const ClaidorDesignApp = dynamic(
  () => import('./logic').then((m) => m.ClaidorDesignApp),
  // Client-only on purpose: the design picks a random greeting at mount,
  // so a server render can never match and would only flash-hydrate.
  { ssr: false },
)

/**
 * The v1 design as native code: the design's own logic and markup,
 * mechanically converted by dev/design_port/convert.py, mounted under the
 * .claidor-design scope that carries the design's stylesheet. Fidelity
 * fixes go into the converter, never into generated/.
 */
export const DesignApp = ({
  previewOrganizationId,
  previewOrganizationDelayMs,
}: {
  /**
   * Stand-in workspace for the development preview only, so the live
   * harnesses can exercise the screens that load nothing without one.
   * Never set on the real dashboard route.
   */
  previewOrganizationId?: string
  /**
   * Deliver that stand-in workspace late, the way the real context does
   * on a cold load. Screens that only ever load on mount look perfectly
   * healthy when the workspace is there from the first render, and show
   * the scripted demo forever when it is not.
   */
  previewOrganizationDelayMs?: number
} = {}) => {
  // The workspace the dashboard is mounted under — uploads and dossier
  // creation are scoped to it.
  const { organization } = useContext(OrganizationContext)
  // Who is looking: Réglages offers « Retirer » only to the cabinet's
  // administrator, and never against their own row.
  const { currentUser } = useAuth()

  const [previewLate, setPreviewLate] = useState(!previewOrganizationDelayMs)
  useEffect(() => {
    if (!previewOrganizationDelayMs) return
    const timer = setTimeout(
      () => setPreviewLate(true),
      previewOrganizationDelayMs,
    )
    return () => clearTimeout(timer)
  }, [previewOrganizationDelayMs])

  const stand_in =
    previewOrganizationId && previewLate
      ? { id: previewOrganizationId, name: 'Aperçu' }
      : undefined
  const mounted = organization ?? stand_in
  return (
    <div className="claidor-design h-dvh w-full overflow-hidden">
      <ClaidorDesignApp organization={mounted} currentUser={currentUser} />
    </div>
  )
}
