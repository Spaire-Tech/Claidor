'use client'

import { OrganizationContext } from '@/providers/maintainerOrganization'
import dynamic from 'next/dynamic'
import { useContext } from 'react'

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
export const DesignApp = () => {
  // The workspace the dashboard is mounted under — uploads and dossier
  // creation are scoped to it.
  const { organization } = useContext(OrganizationContext)
  return (
    <div className="claidor-design h-dvh w-full overflow-hidden">
      <ClaidorDesignApp organization={organization} />
    </div>
  )
}
