import { DesignApp } from '@/components/ClaidorDesign/DesignApp'
import { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Claidor' }
}

/**
 * The v1 design, native. Verified against the designed original
 * (public/design/claidor-v1.html) by headless side-by-side sweep: all nine
 * views and the deep interactions render identical text, zero page errors
 * (dev/design_port/). Being real code rather than a framed file, this is
 * the version the corpus and dossiers wire into, screen by screen.
 */
export default function Page() {
  return <DesignApp />
}
