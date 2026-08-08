import { DesignApp } from '@/components/ClaidorDesign/DesignApp'
import { notFound } from 'next/navigation'

/**
 * The design port, mounted without a workspace — the side the parity
 * harness compares against the designed original
 * (dev/design_port/parity.mjs). It carries no organization context, so it
 * renders in scripted mode: exactly the state the original is in.
 *
 * Development only. In production this is a demo surface with no place in
 * a product that holds clients' files, so it 404s.
 */
export default function Page() {
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }
  return <DesignApp />
}
