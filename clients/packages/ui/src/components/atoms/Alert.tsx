import { useMemo } from 'react'

interface AlertProps {
  color: 'blue' | 'gray' | 'red' | 'green'
}

const Alert: React.FC<React.PropsWithChildren<AlertProps>> = ({
  children,
  color,
}) => {
  const colorClasses = useMemo(() => {
    switch (color) {
      case 'blue':
        return 'bg-blue-50 border border-blue-100 text-blue-500'
      case 'gray':
        return 'bg-gray-50 border border-gray-200 text-gray-600'
      case 'red':
        return 'bg-red-50 border border-red-100 text-red-600'
      case 'green':
        return 'bg-green-50 border border-green-100 text-green-600'
    }
  }, [color])

  return <div className={`rounded-lg p-2 ${colorClasses}`}>{children}</div>
}

export default Alert
