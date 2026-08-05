'use client'

// Render-only harness for AutomationSequenceBuilder. No organizationId, so
// it runs purely local (no network). ?seeded=1 preloads a branching tree so
// the connectors / branch split / node tools can be verified.

import {
  AutomationSequenceBuilder,
  type Step,
} from '@/components/Courses/automation/AutomationSequenceBuilder'
import type { schemas } from '@spaire/client'
import { useEffect, useState } from 'react'

const LESSONS = [
  { id: 'l1', title: 'Grip & Setup' },
  { id: 'l2', title: 'The Full Swing' },
  { id: 'l3', title: 'The Short Game' },
]
const ORG = {
  id: 'embed-org',
  slug: 'spairehq',
  name: 'Spaire',
  avatar_url: null,
} as unknown as schemas['Organization']

const SEEDED: Step[] = [
  { id: 's1', type: 'email', name: 'Welcome — start here' },
  { id: 's2', type: 'wait', dur: '2 days' },
  {
    id: 's3',
    type: 'branch',
    cond: 'Opened the last email',
    yes: [{ id: 's4', type: 'email', name: 'You’re on a roll' }],
    no: [{ id: 's5', type: 'action', what: 'Add tag “at-risk”' }],
  },
  { id: 's6', type: 'goal', what: 'Completes the course' },
]

export default function AutomationEmbed() {
  const [params, setParams] = useState<URLSearchParams | null>(null)
  useEffect(() => setParams(new URLSearchParams(window.location.search)), [])
  if (!params) return null
  const seeded = params.get('seeded') === '1'
  return (
    <AutomationSequenceBuilder
      // ?org=1 supplies a fake org so the email editor can be exercised
      // (saves no-op against the backend in this harness).
      organization={params.get('org') ? ORG : undefined}
      organizationId={params.get('org') ? 'embed-org' : undefined}
      courseId={params.get('course') ? 'c1' : undefined}
      lessons={params.get('lessons') ? LESSONS : undefined}
      initial={seeded ? { name: 'Onboarding drip', steps: SEEDED } : undefined}
    />
  )
}
