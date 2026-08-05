'use client'

import {
  GeneratedPortalPage,
  type GeneratedGroup,
} from '@/components/Courses/editor/GeneratedPortalPage'

// Faithful reproduction of the public storefront layout chain that frames
// the course page (PublicLayout max-w-7xl px-4 + py + two-column profile
// card column). Used to verify the full-bleed escape reaches both side
// gutters and the top, exactly as PublicPortalView applies it.
const EPISODES: [string, string][] = [
  ['The Wager', 'Pebble Beach, dawn. Jack bets a stranger he can fix any swing in one round — and explains why he always wins.'],
  ['The Grip Is a Lie', 'Everything you were taught about holding a club, unlearned. Shot in the workshop where Jack rebuilds grips.'],
  ['Eighteen Inches', 'The takeaway, filmed at 1,000 frames a second. The first move that decides every shot.'],
  ['The Lake at Sawgrass', 'Why great players aim at trouble. A walk through the most feared par 3 in golf.'],
  ['Smooth Is Fast', 'Tempo, filmed with orchestra conductors and tour pros side by side.'],
  ['The Short Game Heist', 'Inside 100 yards, where rounds are stolen. Wedges, spin, and nerve.'],
]

export default function FullbleedTestPage() {
  let flat = 0
  const groups: GeneratedGroup[] = [
    {
      title: null,
      lessons: EPISODES.map(([title, description]) => {
        const flatIdx = flat++
        const locked = flatIdx >= 3
        return { title, description, flatIdx, free: !locked, locked }
      }),
    },
  ]

  return (
    // L1 — (header) layout root
    <div className="min-h-screen bg-white text-gray-900">
      {/* L3 — PublicLayout container (wide) */}
      <div className="mx-auto mb-16 mt-12 flex w-full max-w-7xl flex-col space-y-8 px-4 py-4 md:space-y-12 md:py-8">
        {/* L4 — two-column */}
        <div className="flex flex-col gap-8 md:flex-row md:gap-12">
          <aside
            data-profile-card
            className="w-full shrink-0 md:w-[420px]"
            style={{ display: 'none' }}
          />
          {/* L5 — main, L6 — flex grow */}
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-full grow flex-col">
              {/* PublicPortalView's full-bleed wrapper */}
              <div className="gpp-fullbleed" data-gpp-fullbleed>
                <GeneratedPortalPage
                  brand=""
                  title="The Golfer’s Blueprint"
                  eyebrow="Documentary Series · Golf"
                  badge="New Series"
                  desc="A two-time major champion takes you inside the scoring game — the swing, the short game, and the mind that wins the shots that matter."
                  byline="Two-time major champion and former world No. 1."
                  instructorName="Jack Reeves"
                  heroVariant="marquee"
                  cardVariant="catalog"
                  structure="episodic"
                  trialMode="free_preview"
                  paywallEnabled
                  freeLessons={3}
                  playLabel="Play Episode 1 Free"
                  buyLabel="Subscribe — $89"
                  freeLine="First 3 episodes free · cancel anytime"
                  groups={groups}
                  lessonCount={flat}
                  unit="episode"
                  dark={false}
                />
              </div>

              <style jsx global>{`
                body:has([data-gpp-fullbleed]) {
                  overflow-x: clip;
                }
                .gpp-fullbleed {
                  width: 100vw;
                  position: relative;
                  left: 50%;
                  right: 50%;
                  margin-left: -50vw;
                  margin-right: -50vw;
                }
                :has(> [data-gpp-fullbleed]),
                :has(> div > [data-gpp-fullbleed]),
                :has(> main > div > [data-gpp-fullbleed]),
                :has(> div > main > div > [data-gpp-fullbleed]) {
                  padding-top: 0 !important;
                  margin-top: 0 !important;
                }
              `}</style>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
