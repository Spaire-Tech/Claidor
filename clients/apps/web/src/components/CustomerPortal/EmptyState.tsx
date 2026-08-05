import { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
}

export const EmptyState = ({ icon, title, description }: EmptyStateProps) => {
  return (
    <div className=" flex flex-col items-center justify-center gap-2 rounded-3xl border border-gray-200 p-12">
      <div className=" text-5xl text-gray-500">{icon}</div>
      <div className="flex flex-col items-center text-center">
        <h3 className=" text-lg text-gray-900">{title}</h3>
        <p className=" text-gray-500">{description}</p>
      </div>
    </div>
  )
}
