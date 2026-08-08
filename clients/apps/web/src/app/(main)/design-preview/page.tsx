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
 * a product that holds clients' files, so it 404s — unless
 * CLAIDOR_DESIGN_PREVIEW=1 is set explicitly, which the harnesses use to
 * drive a *production* build locally.
 *
 * That escape hatch is not a convenience. React's development mode mounts
 * every component twice, and the second componentDidMount sees the first
 * one's state already applied — which masked a loader that read `live`
 * before setState had been flushed. It passed every check on the dev
 * server and failed for every real user. A harness that only ever runs
 * against `next dev` cannot see that class of bug at all.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; orgDelay?: string }>
}) {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.CLAIDOR_DESIGN_PREVIEW !== '1'
  ) {
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
