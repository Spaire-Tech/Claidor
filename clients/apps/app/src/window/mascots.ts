// The bots' mascots cut out of their grounds (`assets/mascots/<icon>.png`;
// the Mac's and the iPhone's `Mascots/<icon>`), drawn on Connect apps' tile
// so a tile stays white in light mode and #2c2c2e in dark: the three bots in
// their makers' clouds, and the founder's Claude Code and Codex (11 November
// 2026).

const files = import.meta.glob<string>('../assets/mascots/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})

const byIcon = new Map(
  Object.entries(files).map(([path, url]) => [
    path.slice(path.lastIndexOf('/') + 1, -'.png'.length),
    url,
  ]),
)

/** A mascot's address, as the built app serves it; none for an icon that has no mascot. */
export function mascotURL(icon: string): string | undefined {
  return byIcon.get(icon)
}
