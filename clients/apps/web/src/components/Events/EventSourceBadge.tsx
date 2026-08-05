import { schemas } from '@spaire/client'
import { twMerge } from 'tailwind-merge'

const getEventSourceStyle = (source: schemas['Event']['source']) => {
  switch (source) {
    case 'system':
      return 'text-blue-500 bg-blue-50 '
    case 'user':
      return 'text-emerald-500 bg-emerald-50 '
    default:
      return ''
  }
}

export const EventSourceBadge = ({
  source,
}: {
  source: schemas['Event']['source']
}) => {
  return (
    <div
      className={twMerge(
        'text-xxs! rounded-sm px-2 py-1 font-mono capitalize',
        getEventSourceStyle(source),
      )}
    >
      {source}
    </div>
  )
}
