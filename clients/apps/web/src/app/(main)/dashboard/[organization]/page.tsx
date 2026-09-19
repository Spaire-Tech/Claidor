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
 * mounted.
 *
 * This comment, and the sentence shown to the person below it, used to
 * name a git tag `swens-final`. **That tag does not exist.** The
 * repository has no tags at all (`git ls-remote --tags origin` returns
 * nothing, checked 18 September 2026), so anyone who followed it found
 * nothing. The record is `docs/pierce/` — `swens.md`, `swens-plan.md`
 * and `notes.md` — plus the `swens/*` branches on the remote.
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
        this repository.
      </p>
    </main>
  )
}
