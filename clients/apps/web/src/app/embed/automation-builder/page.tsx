'use client'

// Harness for the automation builder's save behavior:
//   - typing must NOT auto-create a sequence (no POST on keystroke)
//   - status reads "Unsaved" while a new automation has pending edits
//   - "back" with unsaved edits opens the leave prompt instead of exiting
//   - the prompt's "Save as draft" performs the write
// Network is stubbed by the test (Playwright route interception).

import { AutomationSequenceBuilder } from '@/components/Courses/automation/AutomationSequenceBuilder'
import type { schemas } from '@spaire/client'
import { useState } from 'react'

export default function AutomationBuilderHarness() {
  const [backCount, setBackCount] = useState(0)
  const organization = {
    id: 'org_test',
    slug: 'spairehq',
    name: 'Spaire',
  } as unknown as schemas['Organization']
  return (
    <>
      <div
        data-testid="back-count"
        style={{ position: 'fixed', top: 4, right: 8, zIndex: 9, color: '#f00' }}
      >
        back:{backCount}
      </div>
      <AutomationSequenceBuilder
        organization={organization}
        organizationId="org_test"
        courseId="course_test"
        lessons={[{ id: 'l1', title: 'Lesson 1' }]}
        initial={{ trigger: { type: 'enrol' } as never }}
        onBack={() => setBackCount((n) => n + 1)}
      />
    </>
  )
}
