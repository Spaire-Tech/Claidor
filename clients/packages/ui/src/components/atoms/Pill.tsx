import { twMerge } from 'tailwind-merge'

const Pill = ({
  children,
  color,
  className,
}: {
  children: React.ReactNode
  color: 'gray' | 'blue' | 'purple' | 'yellow' | 'red' | 'green'
  className?: string
}) => {
  return (
    <span
      className={twMerge(
        'inline-flex items-center space-x-1 rounded-full px-1.5 py-0.5 text-xs font-medium whitespace-nowrap transition-all duration-200',

        color === 'blue'
          ? 'bg-blue-50 text-blue-600'
          : '',
        color === 'gray'
          ? ' bg-gray-100 text-gray-600'
          : '',
        color === 'purple'
          ? 'bg-purple-100 text-purple-600'
          : '',
        color === 'yellow'
          ? 'bg-yellow-100 text-yellow-500'
          : '',
        color === 'red'
          ? 'bg-red-100 text-red-600'
          : '',
        color === 'green'
          ? 'bg-emerald-100 text-emerald-600'
          : '',
        className,
      )}
    >
      {children}
    </span>
  )
}

export default Pill
