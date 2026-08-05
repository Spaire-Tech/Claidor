import CatalogCard from '@/components/Courses/editor/CatalogCard'

// Bare, centered preview of the Catalog lesson card (Catalog Card.html), used
// as the live preview source for the lesson-card picker's Catalog option.
export default function LessonCardCatalogPreviewPage() {
  return (
    <main
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '100vh',
        background: '#fff',
      }}
    >
      <CatalogCard />
    </main>
  )
}
