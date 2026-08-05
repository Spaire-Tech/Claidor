'use client'

import { BenefitDetailPanel } from '@/components/Benefit/BenefitDetailPanel'
import CreateBenefitModalContent from '@/components/Benefit/CreateBenefitModalContent'
import {
  benefitsDisplayNames,
  resolveBenefitIcon,
} from '@/components/Benefit/utils'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { InlineModal } from '@/components/Modal/InlineModal'
import { useModal } from '@/components/Modal/useModal'
import Spinner from '@/components/Shared/Spinner'
import { useInfiniteBenefits } from '@/hooks/queries'
import { useInViewport } from '@/hooks/utils'
import AddOutlined from '@mui/icons-material/AddOutlined'
import ArrowDownward from '@mui/icons-material/ArrowDownward'
import ArrowUpward from '@mui/icons-material/ArrowUpward'
import Search from '@mui/icons-material/Search'
import { schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import Input from '@spaire/ui/components/atoms/Input'
import {
  parseAsBoolean,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from 'nuqs'
import { useEffect, useMemo, useState } from 'react'

interface BenefitListPageProps {
  organization: schemas['Organization']
}

export const BenefitListPage = ({ organization }: BenefitListPageProps) => {
  const [sorting, setSorting] = useQueryState(
    'sorting',
    parseAsStringLiteral([
      '-created_at',
      'created_at',
      'description',
      '-description',
    ] as const).withDefault('-created_at'),
  )

  const [query, setQuery] = useQueryState('query', parseAsString)

  const [createBenefitQuerystring, setCreateBenefitQuerystring] = useQueryState(
    'create_benefit',
    parseAsBoolean.withDefault(false),
  )

  const { data, fetchNextPage, hasNextPage } = useInfiniteBenefits(
    organization.id,
    {
      query: query ?? undefined,
      sorting: [sorting],
    },
  )

  const benefits = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data?.pages],
  )

  const [selectedBenefitId, setSelectedBenefitId] = useState<string | null>(
    null,
  )

  const {
    isShown: isCreateModalShown,
    show: showCreateModal,
    hide: hideCreateModal,
  } = useModal()

  const { ref: loadingRef, inViewport } = useInViewport<HTMLDivElement>()

  useEffect(() => {
    if (inViewport && hasNextPage) fetchNextPage()
  }, [inViewport, hasNextPage, fetchNextPage])

  useEffect(() => {
    if (createBenefitQuerystring) {
      showCreateModal()
      setCreateBenefitQuerystring(null)
    }
  }, [createBenefitQuerystring, setCreateBenefitQuerystring, showCreateModal])

  return (
    <DashboardBody>
      <div className="flex flex-col gap-y-6">
        {benefits.length > 0 ? (
          <>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-row items-center gap-3">
                <div className="relative w-full md:max-w-64">
                  <Search className=" absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    className="pl-9"
                    placeholder="Search benefits"
                    value={query ?? ''}
                    onChange={(e) => setQuery(e.target.value || null)}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() =>
                    setSorting(
                      sorting === '-created_at' ? 'created_at' : '-created_at',
                    )
                  }
                >
                  {sorting === 'created_at' ? (
                    <ArrowUpward fontSize="small" />
                  ) : (
                    <ArrowDownward fontSize="small" />
                  )}
                </Button>
              </div>
              <Button onClick={showCreateModal}>
                <AddOutlined className="h-4 w-4" />
                <span>Create benefit</span>
              </Button>
            </div>
            <div className=" flex flex-col divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200">
            {benefits.map((benefit) => (
              <button
                key={benefit.id}
                type="button"
                className=" flex flex-row items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-gray-50"
                onClick={() => setSelectedBenefitId(benefit.id)}
              >
                <span className=" flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
                  {resolveBenefitIcon(benefit.type, 'h-4 w-4')}
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {benefit.description}
                  </span>
                  <span className=" truncate text-xs text-gray-500">
                    {benefitsDisplayNames[benefit.type]}
                  </span>
                </div>
              </button>
            ))}
            {hasNextPage && (
              <div
                ref={loadingRef}
                className="flex w-full items-center justify-center py-6"
              >
                <Spinner />
              </div>
            )}
          </div>
          </>
        ) : (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-8 text-center">
            <div style={{ isolation: 'isolate' }} className="relative h-[88px] w-[88px]">
              <div style={{ mixBlendMode: 'multiply' }} className="absolute top-0 left-0 h-14 w-14 rounded-2xl bg-orange-300" />
              <div style={{ mixBlendMode: 'multiply' }} className="absolute bottom-0 right-0 h-14 w-14 rounded-full bg-yellow-300" />
            </div>
            <div className="flex max-w-lg flex-col gap-3">
              <h2 className="text-3xl font-bold text-gray-900">
                Attach files to your products
              </h2>
              <p className="text-gray-500">
                Upload the files your customer will receive after purchase
              </p>
            </div>
            <Button size="lg" onClick={showCreateModal} className="gap-2">
              <AddOutlined className="h-4 w-4" />
              Create benefit
            </Button>
          </div>
        )}
      </div>

      <InlineModal
        isShown={isCreateModalShown}
        hide={hideCreateModal}
        modalContent={
          <CreateBenefitModalContent
            organization={organization}
            hideModal={hideCreateModal}
            onSelectBenefit={(benefit) => {
              hideCreateModal()
              setSelectedBenefitId(benefit.id)
            }}
          />
        }
      />

      <InlineModal
        isShown={!!selectedBenefitId}
        hide={() => setSelectedBenefitId(null)}
        className="md:w-[640px]"
        modalContent={
          selectedBenefitId ? (
            <BenefitDetailPanel
              benefitId={selectedBenefitId}
              organization={organization}
              onClose={() => setSelectedBenefitId(null)}
            />
          ) : (
            <div />
          )
        }
      />
    </DashboardBody>
  )
}
