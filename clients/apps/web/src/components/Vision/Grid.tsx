import React from 'react'
import { twMerge } from 'tailwind-merge'

type GridProps = {
  items: React.ReactNode[]
  className?: string
}

export const Grid: React.FC<GridProps> = ({ items, className }) => {
  return (
    <div
      className={twMerge(
        'bg-claidor-200 border-claidor-200 grid gap-px border',
        className,
      )}
    >
      {items.map((item, index) => (
        <div
          key={index}
          className="bg-claidor-900 relative flex h-full w-full flex-row items-center p-4"
        >
          {item}
        </div>
      ))}
    </div>
  )
}
