// Frosted-pill section label shared between Storefront.tsx (category
// section headings) and StorefrontLinks.tsx (Featured / Links).

export const SectionLabel = ({
  children,
  count,
}: {
  children: React.ReactNode
  count?: number
}) => (
  <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/60 bg-white/40 px-3.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-xl">
    <span className="text-[11px] font-semibold tracking-[0.14em] text-gray-700 uppercase">
      {children}
    </span>
    {typeof count === 'number' && (
      <span className="text-[11px] font-medium text-gray-400 tabular-nums">
        {count}
      </span>
    )}
  </div>
)
