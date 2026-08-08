import { DesignApp } from '@/components/ClaidorDesign/DesignApp'
import { notFound } from 'next/navigation'

/**
 * The design port, mounted without a workspace — the side the parity
 * harness compares against the designed original
 * (dev/design_port/parity.mjs). It carries no organization context, so it
 * renders in scripted mode: exactly the state the original is in.
 *
 * With `?org=<id>` it mounts under a stand-in workspace instead, which is
 * what the live harnesses need: several screens load nothing at all
 * without one, so a preview that never has an organization can only ever
 * test the scripted half of the dashboard. That blind spot is how
 * Historique shipped failing to load on every page load
 * (dev/design_port/history-audit.mjs).
 *
 * Development only. In production this is a demo surface with no place in
 * a product that holds clients' files, so it 404s.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; orgDelay?: string }>
}) {
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }
  const { org, orgDelay } = await searchParams
  return (
    <DesignApp
      previewOrganizationId={org}
      previewOrganizationDelayMs={orgDelay ? Number(orgDelay) : undefined}
    />
  )
}
