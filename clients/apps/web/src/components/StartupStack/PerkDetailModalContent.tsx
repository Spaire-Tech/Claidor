'use client'

import { InlineModalHeader } from '@/components/Modal/InlineModal'
import { type ContentBlock, type Perk, type PerkSection } from '@/constants/perksData'
import ArrowOutwardOutlined from '@mui/icons-material/ArrowOutwardOutlined'

import Button from '@spaire/ui/components/atoms/Button'
import Link from 'next/link'
import { useEffect, useRef } from 'react'

const BlockRenderer = ({ block }: { block: ContentBlock }) => {
  if (block.type === 'paragraph') {
    return (
      <p className=" text-sm leading-relaxed text-gray-600">
        {block.text}
      </p>
    )
  }

  if (block.type === 'note') {
    return (
      <div className=" rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
        <p className="text-xs leading-relaxed text-amber-700">
          <span className="font-semibold">Important: </span>
          {block.text}
        </p>
      </div>
    )
  }

  if (block.type === 'ordered-list' || block.type === 'unordered-list') {
    const isOrdered = block.type === 'ordered-list'
    return (
      <div className="flex flex-col gap-y-1.5">
        {block.label && (
          <p className=" text-sm text-gray-500">
            {block.label}
          </p>
        )}
        {isOrdered ? (
          <ol className="flex flex-col gap-y-1.5 pl-1">
            {block.items.map((item, i) => (
              <li key={i} className="flex items-start gap-x-2.5">
                <span className=" mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                  {i + 1}
                </span>
                <span className=" text-sm leading-relaxed text-gray-700">
                  {item}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <ul className="flex flex-col gap-y-1.5 pl-1">
            {block.items.map((item, i) => (
              <li key={i} className="flex items-start gap-x-2.5">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span className=" text-sm leading-relaxed text-gray-700">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return null
}

const SectionRenderer = ({ section }: { section: PerkSection }) => (
  <div className="flex flex-col gap-y-3">
    <h3 className="text-sm font-semibold">{section.heading}</h3>
    <div className="flex flex-col gap-y-3">
      {section.blocks.map((block, i) => (
        <BlockRenderer key={i} block={block} />
      ))}
    </div>
  </div>
)

interface PerkDetailModalContentProps {
  perk: Perk
  hideModal: () => void
  perksUnlocked?: boolean
}

const PerkDetailModalContent = ({
  perk,
  hideModal,
  perksUnlocked = false,
}: PerkDetailModalContentProps) => {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  if (!perk.details) return null

  return (
    <div className="flex h-full flex-col">
      <InlineModalHeader hide={hideModal}>
        <div className="flex items-center gap-x-2.5">
          <img
            src={perk.logo}
            alt={perk.name}
            className="h-6 w-6 rounded object-cover"
          />
          <span>{perk.name}</span>
        </div>
      </InlineModalHeader>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-y-8 overflow-y-auto px-8 pb-10">
        {/* Hero */}
        <div className="flex flex-col items-center gap-y-4 rounded-2xl bg-gray-50 px-6 py-8 text-center">
          <img
            src={perk.logo}
            alt={perk.name}
            className="h-16 w-16 rounded-2xl object-cover shadow-sm"
          />
          <div className="flex flex-col gap-y-1">
            <h2 className="text-xl font-semibold">
              {perk.name}
            </h2>
            <span className="text-base font-medium text-emerald-500">
              {perk.incentive}
            </span>
          </div>
        </div>

        {/* Sections */}
        <div className=" flex flex-col divide-y divide-gray-100">
          {perk.details.sections.map((section, i) => (
            <div key={i} className="py-6 first:pt-0 last:pb-0">
              <SectionRenderer section={section} />
            </div>
          ))}
        </div>

        {/* CTA */}
        {perksUnlocked ? (
          <Link
            href={perk.details.claimUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="lg" fullWidth>
              <span>Claim Now</span>
              <ArrowOutwardOutlined className="ml-2" fontSize="small" />
            </Button>
          </Link>
        ) : (
          <div className="flex flex-col gap-y-3">
            <Button size="lg" fullWidth disabled>
              
              <span>Claim Now</span>
            </Button>
            <p className="text-center text-xs text-gray-500">
              Complete your first sale through Spaire to unlock this perk.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default PerkDetailModalContent
