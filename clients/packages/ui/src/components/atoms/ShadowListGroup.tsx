const ShadowListGroup: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div className=" w-full overflow-hidden rounded-2xl bg-transparent ring-1 ring-gray-200">
    {children}
  </div>
)

const ShadowListGroupItem: React.FC<React.PropsWithChildren> = ({
  children,
}) => (
  <div className=" border-t border-gray-200 p-5 first:border-t-0">
    {children}
  </div>
)

export default Object.assign(ShadowListGroup, {
  Item: ShadowListGroupItem,
})
