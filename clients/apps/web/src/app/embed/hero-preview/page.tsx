import MarqueeHero from '@/components/Courses/editor/MarqueeHero'

// Bare full-bleed preview of the Marquee hero (The Golfer's Blueprint sample),
// used as the live thumbnail/preview source for the hero picker.
export default function HeroPreviewPage() {
  return (
    <main style={{ margin: 0, overflow: 'hidden' }}>
      <MarqueeHero imageUrl="/assets/onboarding/cover-hero.jpg" />
    </main>
  )
}
