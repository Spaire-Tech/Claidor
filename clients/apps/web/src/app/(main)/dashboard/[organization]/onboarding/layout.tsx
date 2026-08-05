export default async function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className=" flex h-full flex-row">{children}</div>
  )
}
