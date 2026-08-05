import SpotlightLessonCard from '@/components/Courses/editor/SpotlightLessonCard'

// Bare preview of the Spotlight lesson card (Lesson 9 Card.html), centered on
// a white page, used as the live preview source for the lesson-card picker.
export default function SpotlightLessonCardPreviewPage() {
  return (
    <main
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '100vh',
        background: '#fff',
      }}
    >
      <SpotlightLessonCard
        imageUrl="/assets/onboarding/spotlight-tennis.jpg"
        imagePosition="center 22%"
      />
    </main>
  )
}
