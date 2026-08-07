/**
 * Full-viewport group for the v1 design, exactly as designed. No shell,
 * no chrome of ours around it: the design carries its own sidebar and
 * navigation. Auth and workspace membership are enforced by the
 * [organization] layout above this one.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="h-full w-full">{children}</div>
}
