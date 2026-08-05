import { schemas } from '@spaire/client'
import { ChevronDown, ChevronUp, Plus } from 'lucide-react'
import React, { ReactNode, useState } from 'react'
import { resolveBenefitIcon } from '../Benefit/utils'

type BenefitListItem = {
  id: string
  type: string
  description: string
}

const AMOUNT_SHOWN = 15

const BenefitRow = ({
  icon,
  children,
}: {
  icon: ReactNode
  children: ReactNode
}) => {
  return (
    <div className=" flex flex-row items-center gap-x-2 text-gray-600">
      <span className=" flex h-4 w-4 items-center justify-center text-2xl text-gray-600">
        {icon}
      </span>
      <span className="text-sm">{children}</span>
    </div>
  )
}

export const BenefitList = ({
  benefits,
  toggle = false,
}: {
  benefits: BenefitListItem[] | undefined
  toggle?: boolean
}) => {
  const [showAll, setShowAll] = useState(false)

  if (!benefits) return <></>

  const shown = benefits.slice(0, AMOUNT_SHOWN)
  const toggled = benefits.slice(AMOUNT_SHOWN)

  const onToggle = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    setShowAll(!showAll)
  }

  return (
    <>
      {shown.map((benefit) => (
        <BenefitRow
          key={benefit.id}
          icon={resolveBenefitIcon(benefit.type as schemas['BenefitType'], 'h-4 w-4')}
        >
          {benefit.description}
        </BenefitRow>
      ))}
      {toggled.length > 0 && (
        <>
          {showAll &&
            toggled.map((benefit) => (
              <BenefitRow
                key={benefit.id}
                icon={resolveBenefitIcon(benefit.type as schemas['BenefitType'], 'h-4 w-4')}
              >
                {benefit.description}
              </BenefitRow>
            ))}

          {!toggle && (
            <BenefitRow key="show" icon={<Plus className="h-3 w-3" />}>
              {toggled.length} more benefits
            </BenefitRow>
          )}

          {toggle && (
            <a href="#" onClick={onToggle}>
              {showAll && (
                <BenefitRow key="hide" icon={<ChevronUp className="h-3 w-3" />}>
                  Show less
                </BenefitRow>
              )}
              {!showAll && (
                <BenefitRow
                  key="show"
                  icon={<ChevronDown className="h-3 w-3" />}
                >
                  Show {toggled.length} more benefits
                </BenefitRow>
              )}
            </a>
          )}
        </>
      )}
    </>
  )
}
