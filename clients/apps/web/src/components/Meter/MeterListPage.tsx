'use client'

import CreateMeterModalContent from '@/components/Meter/CreateMeterModalContent'
import { MeterDetailPanel } from '@/components/Meter/MeterDetailPanel'
import { MeterIngestionGuide } from '@/components/Meter/MeterIngestionGuide'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { InlineModal } from '@/components/Modal/InlineModal'
import { useModal } from '@/components/Modal/useModal'
import Spinner from '@/components/Shared/Spinner'
import { useMetersInfinite } from '@/hooks/queries/meters'
import { useInViewport } from '@/hooks/utils'
import AddOutlined from '@mui/icons-material/AddOutlined'
import ArrowDownward from '@mui/icons-material/ArrowDownward'
import ArrowUpward from '@mui/icons-material/ArrowUpward'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import FilterList from '@mui/icons-material/FilterList'
import Search from '@mui/icons-material/Search'
import { schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import Input from '@spaire/ui/components/atoms/Input'
import { Status } from '@spaire/ui/components/atoms/Status'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@spaire/ui/components/ui/dropdown-menu'
import {
  parseAsStringLiteral,
  parseAsString,
  useQueryState,
} from 'nuqs'
import { useEffect, useMemo, useState } from 'react'
import { twMerge } from 'tailwind-merge'

interface MeterListPageProps {
  organization: schemas['Organization']
}

export const MeterListPage = ({ organization }: MeterListPageProps) => {
  const [sorting, setSorting] = useQueryState(
    'sorting',
    parseAsStringLiteral([
      'created_at',
      '-created_at',
      'name',
      '-name',
    ] as const).withDefault('-created_at'),
  )

  const [query, setQuery] = useQueryState('query', parseAsString)

  const [archivedFilter, setArchivedFilter] = useQueryState(
    'filter',
    parseAsStringLiteral(['all', 'active', 'archived'] as const).withDefault(
      'active',
    ),
  )

  const { data, hasNextPage, fetchNextPage } = useMetersInfinite(
    organization.id,
    {
      sorting: [sorting],
      query: query ?? '',
      is_archived:
        archivedFilter === 'all' ? undefined : archivedFilter === 'archived',
    },
  )

  const meters = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  )

  const [selectedMeterId, setSelectedMeterId] = useState<string | null>(null)

  const {
    isShown: isCreateModalShown,
    show: showCreateModal,
    hide: hideCreateModal,
  } = useModal()

  const { ref: loadingRef, inViewport } = useInViewport<HTMLDivElement>()

  useEffect(() => {
    if (inViewport && hasNextPage) fetchNextPage()
  }, [inViewport, hasNextPage, fetchNextPage])

  const hasNoMeters = meters.length === 0 && !query && archivedFilter === 'active'

  return (
    <DashboardBody>
      <div className="flex flex-col gap-y-6">
        {hasNoMeters ? (
          <MeterIngestionGuide />
        ) : meters.length > 0 ? (
          <>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-row items-center gap-3">
                <div className="relative w-full md:max-w-64">
                  <Search className=" absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    className="pl-9"
                    placeholder="Search meters"
                    value={query ?? ''}
                    onChange={(e) => setQuery(e.target.value || null)}
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0">
                      <FilterList fontSize="small" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setArchivedFilter('all')}>
                      <CheckOutlined
                        className={twMerge(
                          'h-4 w-4',
                          archivedFilter !== 'all' && 'invisible',
                        )}
                      />
                      <span>All</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setArchivedFilter('active')}>
                      <CheckOutlined
                        className={twMerge(
                          'h-4 w-4',
                          archivedFilter !== 'active' && 'invisible',
                        )}
                      />
                      <span>Active</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setArchivedFilter('archived')}>
                      <CheckOutlined
                        className={twMerge(
                          'h-4 w-4',
                          archivedFilter !== 'archived' && 'invisible',
                        )}
                      />
                      <span>Archived</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
                <span>Create meter</span>
              </Button>
            </div>
          <div className=" flex flex-col divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200">
            {meters.map((meter) => (
              <button
                key={meter.id}
                type="button"
                className=" flex flex-row items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-gray-50"
                onClick={() => setSelectedMeterId(meter.id)}
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-x-2">
                    {meter.archived_at && archivedFilter === 'all' && (
                      <Status
                        className="bg-red-50 text-xs font-medium text-red-500 "
                        status="Archived"
                      />
                    )}
                    <span className="truncate text-sm font-medium">
                      {meter.name}
                    </span>
                  </div>
                  <span className=" truncate text-xs capitalize text-gray-500">
                    {meter.aggregation.func}
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
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className=" text-gray-500">
              No meters found
            </p>
          </div>
        )}
      </div>

      <InlineModal
        isShown={isCreateModalShown}
        hide={hideCreateModal}
        modalContent={
          <CreateMeterModalContent
            organization={organization}
            hideModal={hideCreateModal}
            onSelectMeter={(meter) => {
              hideCreateModal()
              setSelectedMeterId(meter.id)
            }}
          />
        }
      />

      <InlineModal
        isShown={!!selectedMeterId}
        hide={() => setSelectedMeterId(null)}
        className="md:w-[720px]"
        modalContent={
          selectedMeterId ? (
            <MeterDetailPanel
              meterId={selectedMeterId}
              organization={organization}
              onClose={() => setSelectedMeterId(null)}
            />
          ) : (
            <div />
          )
        }
      />
    </DashboardBody>
  )
}
