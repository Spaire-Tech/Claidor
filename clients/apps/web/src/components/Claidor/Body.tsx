'use client'

/**
 * Drop-in replacement for the old chrome's DashboardBody, for screens that
 * live in the ClaidorShell. Same name and prop shape on purpose: the pages
 * that migrated only had to change one import. Chrome-specific props
 * (tabs, contextView) are accepted and ignored — the new shell has no
 * header tabs, and side panels are the screen's own concern in the v1
 * design.
 */
export interface DashboardBodyProps {
  children?: React.ReactNode
  className?: string
  wrapperClassName?: string
  title?: React.ReactNode
  contextView?: React.ReactNode
  contextViewClassName?: string
  contextViewPlacement?: 'left' | 'right'
  header?: React.ReactNode
  tabs?: unknown
  wide?: boolean
}

export const DashboardBody = ({
  children,
  className,
  title,
  header,
  wide = false,
}: DashboardBodyProps) => {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div
        className={`mx-auto flex w-full flex-col px-8 py-10 ${
          wide ? '' : 'max-w-[980px]'
        } ${className ?? ''}`}
      >
        {title != null && typeof title === 'string' ? (
          <h1 className="claidor-serif mb-6 text-[24px] font-semibold">
            {title}
          </h1>
        ) : (
          title
        )}
        {header}
        {children}
      </div>
    </div>
  )
}
