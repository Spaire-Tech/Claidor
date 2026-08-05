'use client'

import ModuleOutlineScreen from '@/components/Courses/CourseWizard.moduleOutline'

// Bare preview of the module outline screen (Module Outline Empty State.html)
// with the design's sample data, used to eyeball the clone in isolation.
export default function ModuleOutlinePreviewPage() {
  return (
    <ModuleOutlineScreen
      title="The Golfer’s Blueprint"
      partialOutline={{
        arc: 'a clear arc from setup to the shots that decide a round',
        modules: [
          {
            kicker: 'Foundations',
            title: 'The Setup',
            lessons: [
              { title: 'The Neutral Grip' },
              { title: 'Posture & Spine Angle' },
              { title: 'Ball Position by Club' },
              { title: 'Aim & Alignment' },
              { title: 'The Athletic Stance' },
            ],
          },
          {
            kicker: 'The Engine',
            title: 'The Full Swing',
            lessons: [
              { title: 'The One-Piece Takeaway' },
              { title: 'Loading the Backswing' },
              { title: 'The Transition' },
              { title: 'Lag & Release' },
              { title: 'Through Impact' },
              { title: 'Tempo & Rhythm' },
            ],
          },
          {
            kicker: 'Scoring',
            title: 'The Short Game',
            lessons: [
              { title: 'The Basic Chip' },
              { title: 'Distance Control' },
              { title: 'The Pitch Shot' },
              { title: 'Greenside Bunkers' },
              { title: 'The Flop Shot' },
              { title: 'Reading the Lie' },
            ],
          },
          {
            kicker: 'The Mind',
            title: 'Playing the Round',
            lessons: [
              { title: 'Course Management' },
              { title: 'The Pre-Shot Routine' },
              { title: 'Playing in Wind' },
              { title: 'Scoring Under Pressure' },
              { title: 'The Mental Reset' },
            ],
          },
        ],
      }}
      isStreaming={false}
      error={null}
      onRegenerate={() => {}}
      onCreate={() => {}}
      onClose={() => {}}
    />
  )
}
