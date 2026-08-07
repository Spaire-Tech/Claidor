import { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Claidor' }
}

/**
 * The v1 design, byte-for-byte. The uploaded design file is fully
 * self-contained (its own runtime, fonts, mark, and all nine screens with
 * their scripted content), so it is served exactly as designed and mounted
 * full-viewport here — the whole dashboard IS the design.
 *
 * The plan of record: screens are re-implemented natively one at a time,
 * pixel-identical, with the scripted content replaced by the real corpus
 * and the real dossiers — and this frame shrinks until it disappears. The
 * design file stays in public/design/ as the reference the native screens
 * are diffed against.
 */
export default function Page() {
  return (
    <iframe
      src="/design/claidor-v1.html"
      title="Claidor"
      // Viewport-sized, not h-full: nothing above this guarantees a height
      // chain, and a 0-height iframe renders as a blank page.
      className="h-dvh w-full"
      style={{ border: 'none', display: 'block' }}
    />
  )
}
