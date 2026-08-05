'use client'

import EpisodicOutlineScreen from '@/components/Courses/CourseWizard.episodicOutline'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

// Bare preview of the episodic outline screen (Episodic Outline Empty
// State.html) with the design's sample data. `?card=catalog` switches the
// episode tiles to the catalog vocabulary; default is the design's spotlight.
const SAMPLE = {
  arc: 'a season that builds from the first swing to the round that counts',
  modules: [
    {
      kicker: 'Season',
      title: 'The Golfer’s Blueprint',
      lessons: [
        {
          title: 'The Wager',
          description:
            'A dawn bet at Pebble Beach sets the season in motion — and reveals the one quiet habit that undoes most amateur swings before the ball is ever struck.',
        },
        {
          title: 'The Grip Is a Lie',
          description:
            'Everything you were taught about holding a club, taken apart in the workshop and rebuilt from the hands up, until control stops being something you fight for.',
        },
        {
          title: 'Eighteen Inches',
          description:
            'The takeaway, slowed to a thousand frames a second. The first eighteen inches of the swing quietly decide where every shot you hit will end up.',
        },
        {
          title: 'Smooth Is Fast',
          description:
            'Tempo, studied alongside orchestra conductors and tour pros, until distance stops feeling like effort and starts feeling like rhythm.',
        },
        {
          title: 'The Short Game Heist',
          description:
            'Inside a hundred yards, where rounds are quietly stolen. Wedges, spin, and the nerve to commit to a shot when the green is begging you not to.',
        },
        {
          title: 'The Rematch',
          description:
            'Back to where it began. The stranger from episode one returns to Pebble Beach, and everything learned across the season gets tested for real, one round, no mulligans.',
        },
      ],
    },
  ],
}

function Preview() {
  const params = useSearchParams()
  const cardVariant = params.get('card') === 'catalog' ? 'catalog' : 'spotlight'
  return (
    <EpisodicOutlineScreen
      title="The Golfer’s Blueprint"
      partialOutline={SAMPLE}
      isStreaming={false}
      error={null}
      cardVariant={cardVariant}
      onRegenerate={() => {}}
      onCreate={() => {}}
      onClose={() => {}}
    />
  )
}

export default function EpisodicOutlinePreviewPage() {
  return (
    <Suspense>
      <Preview />
    </Suspense>
  )
}
