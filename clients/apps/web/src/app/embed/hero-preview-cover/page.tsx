import CoverHero from '@/components/Courses/editor/CoverHero'

// Bare full-bleed preview of the Cover hero (Cover Hero.html — The Golfer's
// Blueprint sample), used as the live thumbnail/preview source for the hero
// picker's Cover option.
export default function HeroPreviewCoverPage() {
  return (
    <main style={{ margin: 0, overflow: 'hidden', background: '#000' }}>
      <CoverHero />
    </main>
  )
}
