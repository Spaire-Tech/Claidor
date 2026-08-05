'use client'

import { PropsWithChildren } from 'react'

interface BrowserChromeProps {
  url: string
}

export const BrowserChrome = ({
  url,
  children,
}: PropsWithChildren<BrowserChromeProps>) => {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-gray-200 shadow-lg">
      {/* Title bar */}
      <div className="flex flex-row items-center gap-x-3 border-b border-gray-200 bg-gray-100 px-4 py-3">
        {/* Traffic light dots */}
        <div className="flex flex-row gap-x-1.5">
          <div className="h-3 w-3 rounded-full bg-red-400" />
          <div className="h-3 w-3 rounded-full bg-yellow-400" />
          <div className="h-3 w-3 rounded-full bg-green-400" />
        </div>
        {/* URL bar */}
        <div className="flex-1 rounded-md bg-white px-3 py-1">
          <span className="select-none text-xs text-gray-500">
            {url}
          </span>
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-white">
        {children}
      </div>
    </div>
  )
}
