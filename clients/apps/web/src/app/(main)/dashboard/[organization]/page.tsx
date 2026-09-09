import { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Claidor' }
}

/**
 * The root of an organization.
 *
 * The Swens workspace (model review for finance) that lived here is
 * archived: its screens under `components/Workspace` and its engine
 * under `server/polar/tieout` are kept as a record and are no longer
 * mounted. The last working state is the git tag `swens-final`.
 */
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
        The model review workspace is archived. Its code and record remain in
        this repository at the tag <code>swens-final</code>.
      </p>
    </main>
  )
}
