'use client'

import ConstructionOutlined from '@mui/icons-material/ConstructionOutlined'
import { SvgIconComponent } from '@mui/icons-material'

export function EmptyTab({
  title,
  description,
  Icon = ConstructionOutlined,
}: {
  title: string
  description: string
  Icon?: SvgIconComponent
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
        <Icon className="text-gray-400" sx={{ fontSize: 28 }} />
      </div>
      <div>
        <p className="text-base font-semibold text-gray-900">{title}</p>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
    </div>
  )
}
