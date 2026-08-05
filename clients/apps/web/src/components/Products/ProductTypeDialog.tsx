'use client'

import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined'
import { schemas } from '@spaire/client'
import { cn } from '@spaire/ui/lib/utils'
import { useRouter } from 'next/navigation'
import { ElementType } from 'react'

type TileType = {
  id: 'digital' | 'course'
  label: string
  description: string
  Icon: ElementType
}

const PRODUCT_TYPES: TileType[] = [
  {
    id: 'digital',
    label: 'Digital Product',
    description:
      'Sell eBooks, templates, presets, software licenses, downloadable assets, and any one-off file your audience pays for.',
    Icon: DigitalProductIcon,
  },
  {
    id: 'course',
    label: 'Course',
    description:
      'Build a structured learning experience with modules, video lessons, downloadable resources, and quizzes.',
    Icon: CourseIcon,
  },
]

export const ProductTypeDialog = ({
  organization,
}: {
  organization: schemas['Organization']
}) => {
  const router = useRouter()

  const handleSelect = (tile: TileType) => {
    router.push(`/dashboard/${organization.slug}/products/new?type=${tile.id}`)
  }

  const handleBack = () => router.back()

  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-5xl flex-col px-6 py-8">
      <div className="mb-12 flex items-center justify-between">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <ArrowBackOutlined sx={{ fontSize: 18 }} />
          Back
        </button>
      </div>

      <div className="mb-12 flex flex-col items-center gap-3 text-center">
        <h2 className="text-4xl font-bold tracking-tight text-gray-900">
          What are you creating?
        </h2>
        <p className="max-w-md text-gray-500">
          Pick the format that fits what you sell. You can always add more
          later.
        </p>
      </div>

      <div className="relative mx-auto grid w-full max-w-4xl grid-cols-1 items-stretch gap-6 md:grid-cols-[1fr_auto_1fr]">
        <Tile tile={PRODUCT_TYPES[0]} onSelect={handleSelect} />

        <div className="relative hidden items-center justify-center md:flex">
          <div className="absolute inset-y-8 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-gray-200 to-transparent" />
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-[11px] font-semibold tracking-wider text-gray-400 uppercase shadow-sm">
            or
          </div>
        </div>

        <Tile tile={PRODUCT_TYPES[1]} onSelect={handleSelect} />
      </div>
    </div>
  )
}

function Tile({
  tile,
  onSelect,
}: {
  tile: TileType
  onSelect: (tile: TileType) => void
}) {
  return (
    <button
      onClick={() => onSelect(tile)}
      className={cn(
        'group relative flex h-full flex-col items-start gap-6 overflow-hidden rounded-3xl border border-gray-200 bg-white p-8 text-left transition-all hover:border-gray-300 hover:shadow-lg active:scale-[0.995]',
      )}
    >
      <div className="relative flex flex-col gap-6">
        <tile.Icon />
        <div className="flex flex-col gap-2">
          <span className="text-xl font-bold text-gray-900">{tile.label}</span>
          <span className="max-w-md text-sm leading-relaxed text-gray-500">
            {tile.description}
          </span>
        </div>
        <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 transition-transform group-hover:translate-x-0.5">
          Get started
          <ArrowForwardOutlined sx={{ fontSize: 16 }} />
        </span>
      </div>
    </button>
  )
}

function DigitalProductIcon() {
  return (
    <svg
      width="72"
      height="72"
      viewBox="0 0 72 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="dpBgGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F2F3F5" />
        </linearGradient>
        <linearGradient id="dpBlueGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7AB7FF" />
          <stop offset="100%" stopColor="#2C6FE2" />
        </linearGradient>
        <linearGradient id="dpAmberGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFC560" />
          <stop offset="55%" stopColor="#FF8A3D" />
          <stop offset="100%" stopColor="#E8463A" />
        </linearGradient>
        <linearGradient id="dpGreenGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7BE26A" />
          <stop offset="100%" stopColor="#1F9B3E" />
        </linearGradient>
        <linearGradient id="dpHighlight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="dpPillBase" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#ECEEF1" />
        </linearGradient>
      </defs>

      <rect
        x="2"
        y="2"
        width="68"
        height="68"
        rx="18"
        fill="url(#dpBgGradient)"
        stroke="#E5E7EB"
        strokeWidth="1"
      />

      {/* Pill 1 — blue */}
      <g>
        <rect
          x="14"
          y="14"
          width="44"
          height="12"
          rx="6"
          fill="url(#dpPillBase)"
        />
        <rect
          x="14"
          y="14"
          width="22"
          height="12"
          rx="6"
          fill="url(#dpBlueGradient)"
        />
        <rect
          x="14"
          y="14.6"
          width="22"
          height="5"
          rx="2.5"
          fill="url(#dpHighlight)"
        />
        <circle cx="36" cy="20" r="3" fill="#FFFFFF" />
      </g>

      {/* Pill 2 — amber/red */}
      <g>
        <rect
          x="14"
          y="30"
          width="44"
          height="12"
          rx="6"
          fill="url(#dpPillBase)"
        />
        <rect
          x="14"
          y="30"
          width="22"
          height="12"
          rx="6"
          fill="url(#dpAmberGradient)"
        />
        <rect
          x="14"
          y="30.6"
          width="22"
          height="5"
          rx="2.5"
          fill="url(#dpHighlight)"
        />
        <circle cx="36" cy="36" r="3" fill="#FFFFFF" />
        <path
          d="M34.6 36.1l1 1 1.8-1.9"
          stroke="#E8881F"
          strokeWidth="0.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>

      {/* Pill 3 — green */}
      <g>
        <rect
          x="14"
          y="46"
          width="44"
          height="12"
          rx="6"
          fill="url(#dpPillBase)"
        />
        <rect
          x="14"
          y="46"
          width="22"
          height="12"
          rx="6"
          fill="url(#dpGreenGradient)"
        />
        <rect
          x="14"
          y="46.6"
          width="22"
          height="5"
          rx="2.5"
          fill="url(#dpHighlight)"
        />
        <circle cx="36" cy="52" r="3" fill="#FFFFFF" />
      </g>
    </svg>
  )
}

function CourseIcon() {
  return (
    <svg
      width="72"
      height="72"
      viewBox="0 0 72 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cBgGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F2F3F5" />
        </linearGradient>
        <linearGradient id="cFan1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#B5EE5C" />
          <stop offset="100%" stopColor="#84D32A" />
        </linearGradient>
        <linearGradient id="cFan2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7CC73C" />
          <stop offset="100%" stopColor="#4FA51F" />
        </linearGradient>
        <linearGradient id="cFan3" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3D8B22" />
          <stop offset="100%" stopColor="#1F5E14" />
        </linearGradient>
      </defs>

      <rect
        x="2"
        y="2"
        width="68"
        height="68"
        rx="18"
        fill="url(#cBgGradient)"
        stroke="#E5E7EB"
        strokeWidth="1"
      />

      {/* Back fan */}
      <path d="M16 24 H44 A20 20 0 0 1 44 60 H16 Z" fill="url(#cFan3)" />
      {/* Mid fan */}
      <path d="M14 20 H38 A22 22 0 0 1 38 56 H14 Z" fill="url(#cFan2)" />
      {/* Front fan */}
      <path d="M12 16 H32 A24 24 0 0 1 32 52 H12 Z" fill="url(#cFan1)" />

      {/* Eye/circle accent on top page */}
      <circle cx="20" cy="22" r="4.5" fill="#FFF6DC" />
      <circle cx="22" cy="22" r="2.5" fill="#0E2433" />
    </svg>
  )
}
