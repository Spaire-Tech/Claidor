'use client'

import { GenericChart } from '@/components/Charts/GenericChart'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { InlineModal } from '@/components/Modal/InlineModal'
import { useModal } from '@/components/Modal/useModal'
import { getServerURL } from '@/utils/api'
import {
  useCreateEmailSubscriber,
  useEmailSubscribers,
  useEmailSubscriberStats,
  useSubscriberDailyGrowth,
  useUpdateEmailSubscriber,
} from '@/hooks/queries/emailMarketing'
import AddOutlined from '@mui/icons-material/AddOutlined'
import ArrowDownward from '@mui/icons-material/ArrowDownward'
import ArrowUpward from '@mui/icons-material/ArrowUpward'
import Search from '@mui/icons-material/Search'
import { schemas } from '@spaire/client'
import Avatar from '@spaire/ui/components/atoms/Avatar'
import Button from '@spaire/ui/components/atoms/Button'
import Input from '@spaire/ui/components/atoms/Input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@spaire/ui/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@spaire/ui/components/atoms/Select'
import { useCallback, useMemo, useRef, useState } from 'react'

export default function SubscribersPage({
  organization,
}: {
  organization: schemas['Organization']
}) {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const [page, setPage] = useState(1)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')

  const subscribersQuery = useEmailSubscribers(organization.id, {
    status: statusFilter === 'all' ? undefined : statusFilter,
    page,
    limit: 20,
  })
  const statsQuery = useEmailSubscriberStats(organization.id)
  const dailyGrowthQuery = useSubscriberDailyGrowth(organization.id, 30)
  const createSubscriber = useCreateEmailSubscriber(organization.id)
  const updateSubscriber = useUpdateEmailSubscriber()

  const {
    show: showAddModal,
    hide: hideAddModal,
    isShown: isAddModalOpen,
  } = useModal()

  const stats = statsQuery.data
  const subscribers = subscribersQuery.data
  const dailyGrowth = dailyGrowthQuery.data

  // Client-side search filter
  const filteredItems = useMemo(() => {
    const items = subscribers?.items ?? []
    if (!query.trim()) return items
    const q = query.toLowerCase()
    return items.filter(
      (sub: any) =>
        sub.email?.toLowerCase().includes(q) ||
        sub.name?.toLowerCase().includes(q),
    )
  }, [subscribers?.items, query])

  const handleAdd = useCallback(async () => {
    if (!newEmail.trim()) return
    await createSubscriber.mutateAsync({
      email: newEmail.trim(),
      name: newName.trim() || undefined,
    })
    setNewEmail('')
    setNewName('')
    hideAddModal()
  }, [newEmail, newName, createSubscriber, hideAddModal])

  const handleExport = useCallback(() => {
    const url = new URL(
      `${getServerURL()}/v1/email-subscribers/export?organization_id=${organization.id}`,
    )
    window.open(url, '_blank')
  }, [organization.id])

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      setImporting(true)
      try {
        const text = await file.text()
        const lines = text.split('\n').filter((l) => l.trim())
        const startIdx = lines[0]?.toLowerCase().includes('email') ? 1 : 0
        for (let i = startIdx; i < lines.length; i++) {
          const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
          const email = cols[0]
          const name = cols[1] || undefined
          if (email && email.includes('@')) {
            await createSubscriber.mutateAsync({ email, name })
          }
        }
      } finally {
        setImporting(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [createSubscriber],
  )

  const hasSubscribers = (subscribers?.items?.length ?? 0) > 0
  const hasStats = stats && stats.total > 0

  return (
    <DashboardBody title="Subscribers">
      <div className="flex flex-col gap-y-6">
        {/* Analytics chart + stat cards */}
        {hasStats && (
          <>
            <SubscriberChart data={dailyGrowth ?? []} stats={stats} />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <StatCard
                value={stats.total}
                label="Total subscribers"
                accent="bg-blue-500"
              />
              <StatCard
                value={stats.active}
                label="Active subscribers"
                accent="bg-emerald-500"
              />
              <StatCard
                value={stats.unsubscribed}
                label="Unsubscribes"
                accent="bg-gray-400"
              />
            </div>
            <div className=" border-t border-gray-200" />
          </>
        )}

        {hasSubscribers ? (
          <>
            {/* Controls — matches CustomerListPage pattern */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-row items-center gap-3">
                <Input
                  className="w-full md:max-w-64"
                  preSlot={<Search fontSize="small" />}
                  placeholder="Search subscribers by name or email"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() =>
                    setSortDir(sortDir === 'desc' ? 'asc' : 'desc')
                  }
                >
                  {sortDir === 'asc' ? (
                    <ArrowUpward fontSize="small" />
                  ) : (
                    <ArrowDownward fontSize="small" />
                  )}
                </Button>
              </div>
              <div className="flex flex-row items-center gap-2">
                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    setStatusFilter(v)
                    setPage(1)
                  }}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="All Subscribers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Subscribers</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="sm">
                      Actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleExport}>
                      Export subscribers
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleImportClick}>
                      Import CSV
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleImportFile}
                />
                <Button onClick={showAddModal}>
                  <AddOutlined className="h-4 w-4" />
                  <span>Add subscriber</span>
                </Button>
              </div>
            </div>

            {/* Subscriber list — same card style as CustomerListPage */}
            <div className=" flex flex-col divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200">
              {filteredItems.map((sub: any) => (
                <div
                  key={sub.id}
                  className=" flex flex-row items-center gap-4 px-6 py-4 transition-colors hover:bg-gray-50"
                >
                  <Avatar
                    className="h-9 w-9 shrink-0"
                    avatar_url={null}
                    name={sub.name || sub.email}
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {sub.name || sub.email}
                    </span>
                    {sub.name && (
                      <span className=" truncate text-xs text-gray-500">
                        {sub.email}
                      </span>
                    )}
                  </div>
                  <div className=" hidden text-sm text-gray-500 md:block">
                    {sub.created_at
                      ? new Date(sub.created_at).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </div>
                  <div className="hidden md:block">
                    <StatusBadge status={sub.status} />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {sub.status === 'active' && (
                        <DropdownMenuItem
                          onClick={() =>
                            updateSubscriber.mutateAsync({
                              subscriberId: sub.id,
                              body: { status: 'unsubscribed' },
                            })
                          }
                        >
                          Unsubscribe
                        </DropdownMenuItem>
                      )}
                      {sub.status === 'unsubscribed' && (
                        <DropdownMenuItem
                          onClick={() =>
                            updateSubscriber.mutateAsync({
                              subscriberId: sub.id,
                              body: { status: 'active' },
                            })
                          }
                        >
                          Resubscribe
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() =>
                          updateSubscriber.mutateAsync({
                            subscriberId: sub.id,
                            body: { status: 'archived' },
                          })
                        }
                        className="text-red-500"
                      >
                        Archive
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {subscribers?.pagination &&
              subscribers.pagination.total_count > 20 && (
                <div className="flex flex-row items-center justify-between">
                  <p className=" text-sm text-gray-500">
                    {subscribers.pagination.total_count} subscribers
                  </p>
                  <div className="flex flex-row gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={
                        !subscribers.pagination.max_page ||
                        page >= subscribers.pagination.max_page
                      }
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
          </>
        ) : (
          <div className="flex min-h-[70vh] flex-col items-center justify-center gap-8 text-center">
            <div
              style={{ isolation: 'isolate' }}
              className="relative h-[88px] w-[88px]"
            >
              <div
                style={{ mixBlendMode: 'multiply' }}
                className="absolute top-0 left-0 h-14 w-14 rounded-2xl bg-blue-300"
              />
              <div
                style={{ mixBlendMode: 'multiply' }}
                className="absolute bottom-0 right-0 h-14 w-14 rounded-full bg-sky-300"
              />
            </div>
            <div className="flex max-w-lg flex-col gap-3">
              <h2 className="text-3xl font-bold text-gray-900">
                Grow your email list
              </h2>
              <p className=" text-gray-500">
                Collect subscribers through your Space or add them manually.
                Send broadcasts and keep your audience engaged.
              </p>
            </div>
            <Button size="lg" onClick={showAddModal} className="gap-2">
              Add subscriber
            </Button>
          </div>
        )}
      </div>

      {/* Add subscriber modal */}
      <InlineModal
        isShown={isAddModalOpen}
        hide={hideAddModal}
        className="md:w-[480px]"
        modalContent={
          <div className="flex flex-col gap-6 p-6">
            <h2 className="text-lg font-medium">Add subscriber</h2>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Email</label>
                <Input
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="subscriber@example.com"
                  type="email"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Name (optional)</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
            </div>
            <div className="flex flex-row justify-end gap-2">
              <Button variant="secondary" onClick={hideAddModal}>
                Cancel
              </Button>
              <Button
                onClick={handleAdd}
                loading={createSubscriber.isPending}
                disabled={!newEmail.trim()}
              >
                Add subscriber
              </Button>
            </div>
          </div>
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleImportFile}
      />
    </DashboardBody>
  )
}

// ── Components ──

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="3" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="13" cy="8" r="1.5" />
    </svg>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active:
      'bg-green-50 text-green-700 ',
    unsubscribed:
      'bg-gray-100 text-gray-500 ',
    archived:
      'bg-gray-100 text-gray-400 ',
    invalid: 'bg-red-50 text-red-600 ',
  }

  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? styles.active}`}
    >
      {status}
    </span>
  )
}

function StatCard({
  value,
  label,
  accent,
}: {
  value: number
  label: string
  accent: string
}) {
  return (
    <div className=" relative flex flex-col gap-1 rounded-2xl border border-gray-200 bg-white p-5">
      <div
        className={`absolute top-5 left-5 h-10 w-1 rounded-full ${accent}`}
      />
      <span className="pl-4 text-3xl font-bold text-gray-900">
        {value.toLocaleString()}
      </span>
      <span className=" pl-4 text-sm text-gray-500">
        {label}
      </span>
    </div>
  )
}

function SubscriberChart({
  data,
  stats,
}: {
  data: { day: string; count: number }[]
  stats: { total: number; active: number; unsubscribed: number }
}) {
  // Build cumulative subscriber count over time
  // Start from (total - sum of daily new) and accumulate
  const totalNew = data.reduce((s, d) => s + d.count, 0)
  let running = Math.max(stats.total - totalNew, 0)

  const chartData = data.map((d) => {
    running += d.count
    return {
      day: new Date(d.day).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }),
      subscribers: running,
    }
  })

  // If no daily data yet, show a single point with the current total
  if (chartData.length === 0) {
    const today = new Date().toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
    chartData.push({ day: today, subscribers: stats.total })
  }

  return (
    <div className=" overflow-hidden rounded-2xl border border-gray-200 bg-white p-4">
      <GenericChart
        data={chartData}
        series={[
          {
            key: 'subscribers',
            label: 'Subscribers',
            color: '#0066cc',
          },
        ]}
        xAxisKey="day"
        height={200}
        simple
      />
    </div>
  )
}
