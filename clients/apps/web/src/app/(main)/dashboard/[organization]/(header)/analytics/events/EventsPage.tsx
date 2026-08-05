'use client'

import { CustomerSelector } from '@/components/Customer/CustomerSelector'
import { EventCreationGuideModal } from '@/components/Events/EventCreationGuideModal'
import { EventMetadataFilter } from '@/components/Events/EventMetadataFilter'
import { Events } from '@/components/Events/Events'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import DateRangePicker from '@/components/Metrics/DateRangePicker'
import { Modal } from '@/components/Modal'
import { useModal } from '@/components/Modal/useModal'
import { useEventNames, useInfiniteEvents } from '@/hooks/queries/events'
import useDebounce from '@/utils/useDebounce'
import AddOutlined from '@mui/icons-material/AddOutlined'
import RefreshOutlined from '@mui/icons-material/RefreshOutlined'
import Search from '@mui/icons-material/Search'
import { schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import Input from '@spaire/ui/components/atoms/Input'
import { List, ListItem } from '@spaire/ui/components/atoms/List'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@spaire/ui/components/atoms/Select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@spaire/ui/components/ui/tooltip'
import { endOfToday } from 'date-fns'
import { useRouter } from 'next/navigation'
import {
  parseAsArrayOf,
  parseAsIsoDateTime,
  parseAsJson,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from 'nuqs'
import React, { useCallback, useMemo } from 'react'
import z from 'zod'

const PAGE_SIZE = 100

interface ClientPageProps {
  organization: schemas['Organization']
}

const ClientPage: React.FC<ClientPageProps> = ({ organization }) => {
  const [sorting, setSorting] = useQueryState(
    'sorting',
    parseAsStringLiteral(['-timestamp', 'timestamp'] as const).withDefault(
      '-timestamp',
    ),
  )
  const [query, setQuery] = useQueryState('query', parseAsString)
  const [selectedEventTypes, setSelectedEventTypes] = useQueryState(
    'eventTypes',
    parseAsArrayOf(parseAsString),
  )
  const [startDate, setStartDate] = useQueryState(
    'startDate',
    parseAsIsoDateTime.withDefault(new Date(organization.created_at)),
  )
  const [endDate, setEndDate] = useQueryState(
    'endDate',
    parseAsIsoDateTime.withDefault(endOfToday()),
  )
  const [selectedCustomerIds, setSelectedCustomerIds] = useQueryState(
    'customerIds',
    parseAsArrayOf(parseAsString),
  )
  const [metadata, setMetadata] = useQueryState(
    'metadata',
    parseAsJson(
      z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    ),
  )

  const router = useRouter()

  const {
    isShown: isEventCreationGuideShown,
    show: showEventCreationGuide,
    hide: hideEventCreationGuide,
  } = useModal()

  const { data } = useEventNames(organization.id, {
    sorting: ['name'],
    limit: 500,
  })

  const eventTypes = useMemo(
    () =>
      data?.pages
        .flatMap((page) => page.items)
        .reduce(
          (acc, curr) => {
            acc[curr.source] = [...(acc[curr.source] ?? []), curr]
            return acc
          },
          {} as Record<schemas['EventSource'], schemas['EventTypeWithStats'][]>,
        ),
    [data],
  )

  const debouncedQuery = useDebounce(query, 500)
  const debouncedMetadata = useDebounce(metadata, 500)

  const eventParameters = useMemo(() => {
    return {
      name:
        selectedEventTypes && selectedEventTypes.length > 0
          ? selectedEventTypes
          : null,
      customer_id: selectedCustomerIds ?? null,
      limit: PAGE_SIZE,
      sorting: [sorting] as ['-timestamp' | 'timestamp'],
      start_timestamp: startDate.toISOString(),
      end_timestamp: endDate.toISOString(),
      query: debouncedQuery ?? null,
      metadata: debouncedMetadata ?? null,
      cursor_pagination: true as const,
    }
  }, [
    selectedEventTypes,
    startDate,
    endDate,
    sorting,
    debouncedQuery,
    selectedCustomerIds,
    debouncedMetadata,
  ])

  const {
    data: eventsData,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteEvents(organization.id, eventParameters)

  const events = useMemo(() => {
    if (!eventsData) return []
    return eventsData.pages.flatMap((page) => page.items)
  }, [eventsData])

  const onDateRangeChange = useCallback(
    (dateRange: { from: Date; to: Date }) => {
      setStartDate(dateRange.from)
      setEndDate(dateRange.to)
    },
    [setStartDate, setEndDate],
  )

  const dateRange = {
    from: startDate,
    to: endDate,
  }

  return (
    <DashboardBody
      title="Events"
      header={
        <div className="flex items-center gap-2">
          {events.length > 0 && (
            <h3 className=" text-xl text-gray-500">
              {events.length}
              {hasNextPage && '+'} Events
            </h3>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                className="h-6 w-6 rounded-full"
                variant="ghost"
                onClick={() => {
                  router.replace(
                    `/dashboard/${organization.slug}/analytics/events`,
                  )
                }}
              >
                <RefreshOutlined fontSize="inherit" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <span>Reset Filters</span>
            </TooltipContent>
          </Tooltip>
          <Button
            size="icon"
            className="h-6 w-6"
            onClick={showEventCreationGuide}
          >
            <AddOutlined fontSize="small" />
          </Button>
        </div>
      }
      wide
    >
      <div className="flex flex-col gap-y-6">
        {/* Filter toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search Events"
            value={query ?? undefined}
            onChange={(e) => setQuery(e.target.value)}
            preSlot={<Search fontSize="small" />}
            className="w-64"
          />
          <DateRangePicker
            date={dateRange}
            onDateChange={onDateRangeChange}
          />
          <Select
            value={sorting}
            onValueChange={(value) =>
              setSorting(value as '-timestamp' | 'timestamp')
            }
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="-timestamp">Newest</SelectItem>
              <SelectItem value="timestamp">Oldest</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Event type + customer + metadata filters */}
        <div className="flex flex-wrap gap-6">
          {Object.entries(eventTypes ?? {})
            .sort((a) => (a[0] === 'system' ? 1 : -1))
            .map(([source, sourceEventTypes]) => {
              if (sourceEventTypes.length === 0) return null
              return (
                <div className="flex flex-col gap-y-2" key={source}>
                  <h3 className="text-sm capitalize">{source} Events</h3>
                  <List size="small" className="rounded-xl">
                    {sourceEventTypes.map((eventType) => (
                      <ListItem
                        key={eventType.name}
                        size="small"
                        className="justify-between px-3 font-mono text-xs"
                        inactiveClassName="text-gray-500"
                        selected={selectedEventTypes?.includes(eventType.name)}
                        onSelect={() =>
                          setSelectedEventTypes((prev) =>
                            prev && prev.includes(eventType.name)
                              ? prev.filter((name) => name !== eventType.name)
                              : ([
                                  ...(prev ?? []),
                                  eventType.name,
                                ] as string[]),
                          )
                        }
                      >
                        <span className="w-full truncate">
                          {eventType.label}
                        </span>
                        <span className="text-xxs font-mono text-gray-500">
                          {Number(eventType.occurrences).toLocaleString(
                            'en-US',
                            {
                              style: 'decimal',
                              compactDisplay: 'short',
                              notation: 'compact',
                            },
                          )}
                        </span>
                      </ListItem>
                    ))}
                  </List>
                </div>
              )
            })}

          <CustomerSelector
            organizationId={organization.id}
            selectedCustomerIds={selectedCustomerIds}
            onSelectCustomerIds={setSelectedCustomerIds}
          />

          <EventMetadataFilter
            metadata={Object.entries(metadata ?? {}).map(([key, value]) => ({
              key,
              value,
            }))}
            onChange={(metadata) => {
              setMetadata(
                metadata.reduce(
                  (acc, curr) => {
                    acc[curr.key] = curr.value
                    return acc
                  },
                  {} as Record<string, string | number | boolean>,
                ),
              )
            }}
          />
        </div>

        {/* Events list */}
        <div className="flex flex-col gap-y-4">
          {events.length === 0 ? (
            <div className=" flex min-h-96 w-full flex-col items-center justify-center gap-4 rounded-4xl border border-gray-200 p-24">
              <h1 className="text-2xl font-normal">No Events Found</h1>
              <p className=" text-gray-500">
                There are no events matching your current filters
              </p>
            </div>
          ) : (
            <>
              <Events events={events} organization={organization} />
              <div className=" flex justify-center rounded-xl border border-gray-200">
                {hasNextPage ? (
                  <button
                    className="group   relative flex h-10 w-full cursor-pointer items-center justify-center gap-x-2 rounded-xl py-3 text-sm text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
                    onClick={() => fetchNextPage()}
                  >
                    <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-100 transition-all duration-200 group-hover:opacity-0 group-hover:blur-[2px]">
                      Showing {events.length} events
                    </span>
                    <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 blur-[2px] transition-all duration-200 group-hover:opacity-100 group-hover:blur-none">
                      Show more
                    </span>
                  </button>
                ) : (
                  <span className=" flex h-10 w-full items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-400">
                    Showing all {events.length} events
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        title="Create Event"
        isShown={isEventCreationGuideShown}
        hide={hideEventCreationGuide}
        modalContent={
          <EventCreationGuideModal hide={hideEventCreationGuide} />
        }
      />
    </DashboardBody>
  )
}

export default ClientPage
