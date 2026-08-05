'use client'

// Direct harness for the "Reposition in portal" overlay after it was
// retargeted from the lesson CARD to the portal HERO (the now-playing
// marquee). Mounts RepositionInPortal with a real wide image so dragging
// visibly moves the focal point, and renders the last saved position so the
// onReposition wiring can be asserted headlessly.

import { RepositionInPortal } from '@/components/Courses/watch/RepositionInPortal'
import { useState } from 'react'

// A real landscape image (object-position is meaningful on it).
const IMG =
  'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=1200&q=60'

export default function RepositionHeroHarness() {
  const [pos, setPos] = useState('50.0% 50.0%')
  return (
    <div style={{ height: '100vh', background: '#0c0c0e' }}>
      <div
        data-testid="saved-pos"
        style={{ position: 'fixed', top: 6, left: 6, color: '#fff', zIndex: 9 }}
      >
        {pos}
      </div>
      <RepositionInPortal
        imageUrl={IMG}
        position={pos}
        title="The Plate"
        lessonLabel="Episode 3 of 6"
        description="A walk through a week of his food: what's on the plate, what isn't, and the cheap, repeatable meals that survived the move."
        instructorName="Zedan Mutlu"
        onReposition={setPos}
        onReplace={() => undefined}
        onClose={() => undefined}
      />
    </div>
  )
}
