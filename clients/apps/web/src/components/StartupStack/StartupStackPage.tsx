'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { InlineModal } from '@/components/Modal/InlineModal'
import { useModal } from '@/components/Modal/useModal'
import { FEATURED_PERKS, type Perk } from '@/constants/perksData'
import { OrganizationContext } from '@/providers/maintainerOrganization'
import { CONFIG } from '@/utils/config'
import ArrowOutwardOutlined from '@mui/icons-material/ArrowOutwardOutlined'
import Button from '@spaire/ui/components/atoms/Button'
import { useContext, useState } from 'react'
import PerkDetailModalContent from './PerkDetailModalContent'

const FeaturedPerkCard = ({
  perk,
  onLearnMore,
}: {
  perk: Perk
  onLearnMore: (perk: Perk) => void
}) => {
  return (
    <div className=" group flex flex-col gap-y-5 rounded-2xl border border-gray-200 p-6 transition-all hover:border-gray-300 hover:shadow-md ">
      <div className="flex flex-row items-start gap-x-4">
        <img
          src={perk.logo}
          alt={perk.name}
          className="h-14 w-14 shrink-0 rounded-xl object-cover"
        />
        <div className="flex flex-col gap-y-1">
          <h3 className="text-base font-medium">{perk.name}</h3>
          <span className="text-sm font-medium text-emerald-500">
            {perk.incentive}
          </span>
        </div>
      </div>

      <p className=" flex-1 text-sm leading-relaxed text-gray-500">
        {perk.description}
      </p>

      <Button
        fullWidth
        onClick={() => onLearnMore(perk)}
      >
        <span>Learn More</span>
        <ArrowOutwardOutlined className="ml-1 h-4 w-4" fontSize="inherit" />
      </Button>
    </div>
  )
}

export default function StartupStackPage() {
  const { organization } = useContext(OrganizationContext)
  const perksUnlocked =
    !CONFIG.IS_SANDBOX &&
    ((organization.feature_settings as Record<string, boolean>)
      ?.perks_unlocked ?? false)

  const { isShown, show, hide } = useModal(false)
  const [selectedPerk, setSelectedPerk] = useState<Perk | null>(null)

  const handleLearnMore = (perk: Perk) => {
    setSelectedPerk(perk)
    show()
  }

  const handleHide = () => {
    hide()
  }

  return (
    <DashboardBody title="Perks">
      <div className="flex flex-col gap-y-2">
        <p className=" text-sm text-gray-500">
          Everything you need to start and scale your company. Access startup
          perks, credits, and discounts from the tools trusted by founders
          around the world.
        </p>
        {!perksUnlocked && (
          <p className="text-sm text-blue-500">
            Perks unlock after your first successful sale through Spaire. This
            helps ensure the program supports founders who are actively building
            and launching their products.
          </p>
        )}
      </div>

      {/* Featured partners */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {FEATURED_PERKS.map((perk) => (
          <FeaturedPerkCard
            key={perk.name}
            perk={perk}
            onLearnMore={handleLearnMore}
          />
        ))}
      </div>

      <InlineModal
        isShown={isShown}
        hide={handleHide}
        modalContent={
          selectedPerk ? (
            <PerkDetailModalContent
              perk={selectedPerk}
              hideModal={handleHide}
              perksUnlocked={perksUnlocked}
            />
          ) : (
            <></>
          )
        }
      />
    </DashboardBody>
  )
}
