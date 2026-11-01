// The window. Until step 1's window lands (docs/web-app/PROGRESS.md) it shows
// only the mark, so the address, the build and the website's headers can be
// checked on their own.
export function App() {
  return (
    <main className="splash">
      <img
        className="mark"
        src={`${import.meta.env.BASE_URL}favicon.svg`}
        alt="Simeon"
      />
    </main>
  )
}
