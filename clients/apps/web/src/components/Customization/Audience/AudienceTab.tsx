'use client'

import { toast } from '@/components/Toast/use-toast'
import {
  SubscriberRow,
  useCreateEmailSubscriber,
  useDeleteEmailSubscriber,
  useEmailSubscriberStats,
  useEmailSubscribers,
  useImportEmailSubscribersCsv,
  useUpdateEmailSubscriber,
} from '@/hooks/queries/emailMarketing'
import { getServerURL } from '@/utils/api'
import { schemas } from '@spaire/client'
import { useCallback, useRef, useState } from 'react'
import './audience.css'
import {
  Icon,
  KebabItem,
  KebabMenu,
  LiquidSeg,
  formatDateTime,
  initial,
  sourceLabel,
  useDebouncedValue,
} from './shared'

const SUB =
  "Everyone who's opted in to hear from you. Segment, search, and grow your list."

const PAGE_SIZE = 20

type Seg = 'all' | 'active' | 'unsub' | 'arch'
const SEG_STATUS: Record<Seg, string | undefined> = {
  all: undefined,
  active: 'active',
  unsub: 'unsubscribed',
  arch: 'archived',
}

export function AudienceTab({
  organization,
  dark,
}: {
  organization: schemas['Organization']
  dark: boolean
}) {
  const orgId = organization.id
  const [query, setQuery] = useState('')
  const [seg, setSeg] = useState<Seg>('all')
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const debouncedQuery = useDebouncedValue(query, 300)

  const subscribersQuery = useEmailSubscribers(orgId, {
    status: SEG_STATUS[seg],
    q: debouncedQuery.trim() || undefined,
    page,
    limit: PAGE_SIZE,
  })
  const statsQuery = useEmailSubscriberStats(orgId)

  const createMutation = useCreateEmailSubscriber(orgId)
  const updateMutation = useUpdateEmailSubscriber()
  const deleteMutation = useDeleteEmailSubscriber()
  const importCsvMutation = useImportEmailSubscribersCsv(orgId)

  const items = subscribersQuery.data?.items ?? []
  const totalCount = subscribersQuery.data?.pagination.total_count ?? 0
  const maxPage = subscribersQuery.data?.pagination.max_page ?? 1
  const stats = statsQuery.data

  const onSearch = useCallback((v: string) => {
    setQuery(v)
    setPage(1)
  }, [])

  const onSeg = useCallback((s: Seg) => {
    setSeg(s)
    setPage(1)
  }, [])

  const setStatus = (id: string, status: SubscriberRow['status']) => {
    updateMutation
      .mutateAsync({ subscriberId: id, body: { status } })
      .catch((err: unknown) =>
        toast({
          title: "Couldn't update subscriber",
          description: err instanceof Error ? err.message : 'Please try again.',
        }),
      )
  }

  const onDelete = (s: SubscriberRow) => {
    if (
      !window.confirm(
        `Permanently delete ${s.email}? This can't be undone.`,
      )
    )
      return
    deleteMutation
      .mutateAsync(s.id)
      .catch((err: unknown) =>
        toast({
          title: "Couldn't delete subscriber",
          description: err instanceof Error ? err.message : 'Please try again.',
        }),
      )
  }

  const onExport = () =>
    window.open(
      getServerURL(`/v1/email-subscribers/export?organization_id=${orgId}`),
      '_blank',
    )

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const result = await importCsvMutation.mutateAsync(file)
      toast({
        title: 'Import complete',
        description: `${result.created} created · ${result.updated} updated · ${result.skipped} skipped`,
      })
    } catch (err: unknown) {
      toast({
        title: "Couldn't import that file",
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const pct =
    stats && stats.total
      ? ((stats.active / stats.total) * 100).toFixed(1)
      : '0.0'

  return (
    <div className={'aud' + (dark ? ' dark' : '')}>
      <div className="a-content">
        <div className="a-head">
          <div>
            <h1 className="a-h1">Subscribers</h1>
            <p className="a-sub">{SUB}</p>
          </div>
          <div className="a-acts">
            <button
              className="a-btn a-btn-quiet"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
            >
              <Icon n="import" w={15} />
              {importing ? 'Importing…' : 'Import'}
            </button>
            <button className="a-btn a-btn-quiet" onClick={onExport}>
              <Icon n="export" w={15} />
              Export
            </button>
            <button
              className="a-btn a-btn-accent"
              onClick={() => setAdding(true)}
            >
              <Icon n="plus" w={15} />
              Add subscriber
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={onImportFile}
            />
          </div>
        </div>

        <div className="a-metrics">
          <div className="a-metric">
            <div className="ml">Total subscribers</div>
            <div className="mv">{(stats?.total ?? 0).toLocaleString()}</div>
            <div className="md">
              <span className="a-up">
                <Icon n="up" w={12} />
                <b>+{stats?.added_30d ?? 0}</b>
              </span>{' '}
              last 30 days
            </div>
          </div>
          <div className="a-metric">
            <div className="ml">Active</div>
            <div className="mv">{(stats?.active ?? 0).toLocaleString()}</div>
            <div className="md">
              <b>{pct}%</b> of list
            </div>
          </div>
          <div className="a-metric">
            <div className="ml">Avg. daily growth</div>
            <div className="mv">
              +{(stats?.avg_daily_growth_30d ?? 0).toFixed(1)}
            </div>
            <div className="md">
              <b>+{stats?.added_30d ?? 0}</b> net new / 30d
            </div>
          </div>
          <div className="a-metric">
            <div className="ml">Unsub rate</div>
            <div className="mv">
              {(stats?.unsub_rate_30d ?? 0).toFixed(2)}
              <span className="unit">%</span>
            </div>
            <div className="md">
              <b>{stats?.unsubs_30d ?? 0}</b> last 30 days
            </div>
          </div>
        </div>

        <div className="a-tools">
          <div className="a-search">
            <Icon n="search" w={16} />
            <input
              placeholder="Search by name or email…"
              value={query}
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>
          <div className="sp" />
          <LiquidSeg<Seg>
            value={seg}
            onChange={onSeg}
            options={[
              ['all', 'All'],
              ['active', 'Active'],
              ['unsub', 'Unsubscribed'],
              ['arch', 'Archived'],
            ]}
          />
        </div>

        <div className="a-table">
          <div className="a-thead">
            <div className="th">Subscriber</div>
            <div className="th">Source</div>
            <div className="th">Subscribed</div>
            <div className="th">Status</div>
            <div className="th" />
          </div>

          {subscribersQuery.isLoading && items.length === 0 && (
            <div
              className="a-foot"
              style={{ justifyContent: 'center', minHeight: 88 }}
            >
              Loading…
            </div>
          )}
          {!subscribersQuery.isLoading && items.length === 0 && (
            <div
              className="a-foot"
              style={{ justifyContent: 'center', minHeight: 88 }}
            >
              No subscribers match these filters.
            </div>
          )}

          {items.map((s) => {
            const active = s.status === 'active'
            const statusLabel =
              s.status === 'active'
                ? 'Active'
                : s.status === 'unsubscribed'
                  ? 'Unsubscribed'
                  : s.status === 'archived'
                    ? 'Archived'
                    : 'Invalid'
            const menu: KebabItem[] = []
            if (!active && s.status !== 'invalid')
              menu.push({
                label: 'Resubscribe',
                onClick: () => setStatus(s.id, 'active'),
              })
            if (active)
              menu.push({
                label: 'Unsubscribe',
                onClick: () => setStatus(s.id, 'unsubscribed'),
              })
            if (s.status !== 'archived')
              menu.push({
                label: 'Archive',
                onClick: () => setStatus(s.id, 'archived'),
              })
            menu.push({
              label: 'Delete forever',
              destructive: true,
              onClick: () => onDelete(s),
            })
            return (
              <div className="a-tr" key={s.id}>
                <div className="a-subcell">
                  <span className="a-ava">{initial(s.name, s.email)}</span>
                  <div className="nm">
                    <b>{s.name || s.email}</b>
                    <span>{s.name ? s.email : ''}</span>
                  </div>
                </div>
                <div>
                  <span className="a-srcpill">
                    <Icon n="person" w={12} />
                    {sourceLabel(s.source, s.import_source)}
                  </span>
                </div>
                <div className="a-when">{formatDateTime(s.created_at)}</div>
                <div>
                  <span className={'a-status' + (active ? '' : ' off')}>
                    <span className="sd" />
                    {statusLabel}
                  </span>
                </div>
                <div>
                  <KebabMenu items={menu} />
                </div>
              </div>
            )
          })}

          <div className="a-foot">
            <span>
              Showing {items.length} of {totalCount.toLocaleString()} subscribers
            </span>
            <span className="pg">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <Icon n="chevL" w={15} />
              </button>
              <button
                disabled={page >= maxPage}
                onClick={() => setPage((p) => p + 1)}
              >
                <Icon n="chevR" w={15} />
              </button>
            </span>
          </div>
        </div>
      </div>

      {adding && (
        <AddSubscriberSheet
          submitting={createMutation.isPending}
          onClose={() => setAdding(false)}
          onSubmit={async ({ name, email }) => {
            try {
              await createMutation.mutateAsync({ email, name })
              setAdding(false)
              toast({ title: 'Subscriber added', description: email })
            } catch (err: unknown) {
              toast({
                title: "Couldn't add subscriber",
                description:
                  err instanceof Error ? err.message : 'Please try again.',
              })
            }
          }}
        />
      )}
    </div>
  )
}

function AddSubscriberSheet({
  onClose,
  onSubmit,
  submitting,
}: {
  onClose: () => void
  onSubmit: (v: { name?: string; email: string }) => Promise<void>
  submitting: boolean
}) {
  const [form, setForm] = useState({ name: '', email: '' })
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }))
  const valid = /\S+@\S+\.\S+/.test(form.email.trim())
  const initialChar = form.name.trim() ? form.name.trim()[0].toUpperCase() : null
  const submit = () => {
    if (!valid || submitting) return
    onSubmit({ name: form.name.trim() || undefined, email: form.email.trim() })
  }
  return (
    <div className="a-ov" onClick={onClose}>
      <div className="a-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="a-sheet-head">
          <button className="a-sheet-x" onClick={onClose} aria-label="Close">
            <Icon n="close" w={16} />
          </button>
          <div className="a-form-ava">
            {initialChar || <Icon n="personadd" w={26} />}
          </div>
          <div className="a-sheet-t">Add subscriber</div>
          <div className="a-sheet-s">
            Add someone to your list by hand. They&apos;ll be marked as a manual,
            active subscriber.
          </div>
        </div>
        <div className="a-sheet-body">
          <div className="a-field">
            <label>Name</label>
            <input
              className="a-input"
              placeholder="Jane Appleseed"
              value={form.name}
              autoFocus
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>
          <div className="a-field">
            <label>Email address</label>
            <input
              className="a-input"
              type="email"
              placeholder="jane@email.com"
              value={form.email}
              onChange={(e) => set({ email: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
            />
          </div>
        </div>
        <div className="a-sheet-foot">
          <span className="sp" />
          <button className="a-btn a-btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            className="a-btn a-btn-accent"
            disabled={!valid || submitting}
            onClick={submit}
          >
            {submitting ? 'Adding…' : 'Add subscriber'}
          </button>
        </div>
      </div>
    </div>
  )
}
