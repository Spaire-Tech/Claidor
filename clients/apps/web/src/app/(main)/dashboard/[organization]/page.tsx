import { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Simeon' }
}

/** The root of an organization. Simeon itself runs in the Mac app. */
export default async function Page() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'system-ui, sans-serif',
        color: '#333',
        background: '#fafafa',
      }}
    >
      <p style={{ margin: 0, maxWidth: '36rem', textAlign: 'center' }}>
        Simeon runs in the Mac app. There is nothing to manage here yet.
      </p>
    </main>
  )
}
