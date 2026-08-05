'use client'

import {
  SubscriberRow,
  useBulkCreateEmailSubscribers,
  useImportEmailSubscribersCsv,
  useCreateEmailSubscriber,
  useEmailSubscribers,
  useEmailSubscriberStats,
  usePermanentlyDeleteEmailSubscriber,
  useUpdateEmailSubscriber,
} from '@/hooks/queries/emailMarketing'
import { getServerURL } from '@/utils/api'
import { schemas } from '@spaire/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Tiny in-file debounce so the search input doesn't fire a list query on
 * every keystroke. We keep this colocated rather than promoting it to a
 * shared util for now; if a second screen needs the same shape we can
 * lift it.
 */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(t)
  }, [value, delayMs])
  return debounced
}
import { ActionMenu } from '../ActionMenu'
import { useDialogs } from '../dialogs'
import { Icon } from '../Icon'
import { Modal } from '../Modal'
import { MetricTile } from '../shared'

const FILTERS = [
  { id: 'All', api: undefined },
  { id: 'Active', api: 'active' },
  { id: 'Unsubscribed', api: 'unsubscribed' },
  { id: 'Archived', api: 'archived' },
] as const
type Filter = (typeof FILTERS)[number]['id']

const PAGE_SIZE = 20

const initials = (name: string | null, email: string) => {
  const source = name?.trim() || email
  return source
    .split(/\s+|@/)
    .map((p) => p[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

const sourceLabel = (source: string, importSource: string | null) => {
  if (importSource) return importSource
  switch (source) {
    case 'space_signup':
      return 'Newsletter form'
    case 'purchase':
      return 'Purchase'
    case 'manual':
      return 'Manual'
    case 'import':
      return 'CSV import'
    default:
      return source
  }
}

const formatDateTime = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const SubscribersScreen = ({
  organization,
}: {
  organization: schemas['Organization']
}) => {
  const orgId = organization.id
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('All')
  const [page, setPage] = useState(1)
  const [showAdd, setShowAdd] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Debounce the search input by 300ms (audit issue #36 / fix-list #36).
  // The previous implementation only reset the page on each keystroke
  // and re-issued the API request immediately, so a five-character search
  // fired five subscriber-list queries before the user finished typing.
  const debouncedQuery = useDebouncedValue(query, 300)

  const apiStatus = FILTERS.find((f) => f.id === filter)?.api

  const subscribersQuery = useEmailSubscribers(orgId, {
    status: apiStatus,
    q: debouncedQuery.trim() || undefined,
    page,
    limit: PAGE_SIZE,
  })
  const statsQuery = useEmailSubscriberStats(orgId)

  const updateMutation = useUpdateEmailSubscriber()
  const createMutation = useCreateEmailSubscriber(orgId)
  const deleteForeverMutation = usePermanentlyDeleteEmailSubscriber()
  const dialogs = useDialogs()
  const bulkMutation = useBulkCreateEmailSubscribers(orgId)
  const importCsvMutation = useImportEmailSubscribersCsv(orgId)

  const items = subscribersQuery.data?.items ?? []
  const totalCount = subscribersQuery.data?.pagination.total_count ?? 0
  const maxPage = subscribersQuery.data?.pagination.max_page ?? 1
  const stats = statsQuery.data

  const onSearch = useCallback((v: string) => {
    setQuery(v)
    setPage(1)
  }, [])

  const onFilter = useCallback((f: Filter) => {
    setFilter(f)
    setPage(1)
  }, [])

  const setStatus = (id: string, status: SubscriberRow['status']) => {
    // Audit issue #35 / fix-list #34: status changes used to fire-and-
    // forget. Surface API failures via the dialog instead of silently
    // letting the cache re-fetch and revert.
    updateMutation
      .mutateAsync({ subscriberId: id, body: { status } })
      .catch((err: unknown) =>
        dialogs.alert({
          title: "Couldn't update subscriber",
          message: err instanceof Error ? err.message : 'Please try again.',
          tone: 'danger',
        }),
      )
  }

  const onDeleteForever = async (s: SubscriberRow) => {
    const ok = await dialogs.confirm({
      title: 'Delete forever?',
      message: (
        <>
          Permanently delete <strong>{s.email}</strong>? This frees the email
          slot and can&rsquo;t be undone.
        </>
      ),
      confirmLabel: 'Delete forever',
      tone: 'danger',
    })
    if (!ok) return
    deleteForeverMutation
      .mutateAsync(s.id)
      .catch((err: unknown) =>
        dialogs.alert({
          title: "Couldn't delete subscriber",
          message: err instanceof Error ? err.message : 'Please try again.',
          tone: 'danger',
        }),
      )
  }

  const onExport = () => {
    window.open(
      getServerURL(`/v1/email-subscribers/export?organization_id=${orgId}`),
      '_blank',
    )
  }

  const onImportClick = () => fileInputRef.current?.click()

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      // The previous client-side parser (text.split(/\r?\n/).split(','))
      // silently dropped any row with quoted fields, embedded newlines,
      // or a BOM (audit #36 / fix-list #36). Hand the whole file to the
      // server, which uses csv.DictReader and returns per-row errors.
      const result = await importCsvMutation.mutateAsync(file)
      const summary = `${result.created} created · ${result.updated} updated · ${result.skipped} skipped`
      if (result.errors.length > 0) {
        const preview = result.errors
          .slice(0, 5)
          .map((err) => `· Row ${err.row}: ${err.message}`)
          .join('\n')
        const more =
          result.errors.length > 5
            ? `\n…and ${result.errors.length - 5} more.`
            : ''
        await dialogs.alert({
          title: 'Import finished with issues',
          message: (
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {summary}
              {'\n\n'}
              {preview}
              {more}
            </div>
          ),
        })
      } else {
        await dialogs.alert({
          title: 'Import complete',
          message: summary,
        })
      }
    } catch (err: unknown) {
      await dialogs.alert({
        title: "Couldn't import that file",
        message: err instanceof Error ? err.message : 'Please try again.',
        tone: 'danger',
      })
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="fade-up">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          marginBottom: 40,
        }}
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            Audience
          </div>
          <h1 className="h-display">Subscribers</h1>
          <p
            className="muted"
            style={{ fontSize: 15, marginTop: 12, maxWidth: 520 }}
          >
            Everyone who&apos;s opted in to hear from you. Segment, search, and
            grow your list.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-secondary"
            onClick={onImportClick}
            disabled={importing}
          >
            <Icon name="upload" size={15} />
            {importing ? 'Importing…' : 'Import'}
          </button>
          <button className="btn btn-secondary" onClick={onExport}>
            <Icon name="download" size={15} />
            Export
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Icon name="plus" size={15} />
            Add subscriber
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={onImportFile}
          />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          marginBottom: 56,
        }}
      >
        <MetricTile
          value={(stats?.total ?? 0).toLocaleString()}
          label="Total subscribers"
          delta={stats ? `+${stats.added_30d}` : undefined}
          deltaLabel="last 30 days"
        />
        <MetricTile
          value={(stats?.active ?? 0).toLocaleString()}
          label="Active"
          delta={
            stats && stats.total
              ? `${((stats.active / stats.total) * 100).toFixed(1)}%`
              : undefined
          }
          deltaLabel="of list"
          subtle
        />
        <MetricTile
          value={stats ? `+${stats.avg_daily_growth_30d.toFixed(1)}` : '0'}
          label="Avg. daily growth"
          delta={stats ? `+${stats.added_30d}` : undefined}
          deltaLabel="net new / 30d"
          subtle
        />
        <MetricTile
          value={stats ? `${stats.unsub_rate_30d.toFixed(2)}%` : '0%'}
          label="Unsub rate"
          delta={stats ? `${stats.unsubs_30d}` : undefined}
          deltaLabel="last 30d"
          down
        />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div style={{ position: 'relative', flex: 1 }}>
          <Icon
            name="search"
            size={16}
            style={{
              position: 'absolute',
              left: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--ink-4)',
            }}
          />
          <input
            className="input"
            style={{ paddingLeft: 42, height: 44 }}
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        <div className="tabs">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`tab ${filter === f.id ? 'tab-active' : ''}`}
              onClick={() => onFilter(f.id)}
            >
              {f.id}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflow: 'visible' }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ paddingLeft: 24 }}>Subscriber</th>
              <th>Source</th>
              <th>Subscribed</th>
              <th>Status</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {subscribersQuery.isLoading && items.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 40, textAlign: 'center' }}>
                  Loading…
                </td>
              </tr>
            )}
            {!subscribersQuery.isLoading && items.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: 40,
                    textAlign: 'center',
                    color: 'var(--ink-3)',
                  }}
                >
                  No subscribers match these filters.
                </td>
              </tr>
            )}
            {items.map((s) => (
              <tr key={s.id}>
                <td style={{ paddingLeft: 24 }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <div
                      className="avatar"
                      style={{
                        background: '#fff',
                        color: 'var(--ink-2)',
                        border: '1px solid var(--line)',
                        fontWeight: 500,
                      }}
                    >
                      {initials(s.name, s.email)}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 500,
                          color: 'var(--ink)',
                        }}
                      >
                        {s.name || s.email}
                      </div>
                      <div
                        style={{
                          fontSize: 12.5,
                          color: 'var(--ink-3)',
                          marginTop: 2,
                        }}
                      >
                        {s.name ? s.email : ' '}
                      </div>
                    </div>
                  </div>
                </td>
                <td>{sourceLabel(s.source, s.import_source)}</td>
                <td>{formatDateTime(s.created_at)}</td>
                <td>
                  {s.status === 'active' && (
                    <span className="chip chip-success">
                      <span className="dot" />
                      Active
                    </span>
                  )}
                  {s.status === 'unsubscribed' && (
                    <span className="chip">
                      <span
                        className="dot"
                        style={{ background: 'var(--ink-4)' }}
                      />
                      Unsubscribed
                    </span>
                  )}
                  {s.status === 'archived' && (
                    <span className="chip">
                      <span
                        className="dot"
                        style={{ background: 'var(--ink-4)' }}
                      />
                      Archived
                    </span>
                  )}
                  {s.status === 'invalid' && (
                    <span className="chip chip-error">
                      <span className="dot" />
                      Invalid
                    </span>
                  )}
                </td>
                <td>
                  <ActionMenu
                    items={[
                      {
                        label: 'Resubscribe',
                        icon: 'rotate',
                        hidden: s.status === 'active' || s.status === 'invalid',
                        onClick: () => setStatus(s.id, 'active'),
                      },
                      {
                        label: 'Unsubscribe',
                        icon: 'minus',
                        hidden: s.status !== 'active',
                        onClick: () => setStatus(s.id, 'unsubscribed'),
                      },
                      {
                        label: 'Archive',
                        icon: 'package',
                        hidden: s.status === 'archived',
                        onClick: () => setStatus(s.id, 'archived'),
                      },
                      {
                        label: 'Delete forever',
                        icon: 'trash',
                        destructive: true,
                        onClick: () => onDeleteForever(s),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 16,
          fontSize: 12.5,
          color: 'var(--ink-3)',
        }}
      >
        <div>
          Showing {items.length} of {totalCount.toLocaleString()} subscribers
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-ghost btn-sm"
            disabled={page <= 1}
            style={{ opacity: page <= 1 ? 0.4 : 1 }}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={page >= maxPage}
            style={{ opacity: page >= maxPage ? 0.4 : 1 }}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>

      <AddSubscriberModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSubmit={async ({ email, name }) => {
          try {
            await createMutation.mutateAsync({ email, name })
            setShowAdd(false)
          } catch (err: unknown) {
            await dialogs.alert({
              title: "Couldn't add subscriber",
              message:
                err instanceof Error ? err.message : 'Please try again.',
              tone: 'danger',
            })
          }
        }}
        submitting={createMutation.isPending}
      />
    </div>
  )
}

const AddSubscriberModal = ({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (v: { email: string; name?: string }) => Promise<void>
  submitting: boolean
}) => {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const valid = useMemo(
    () => /[^@\s]+@[^@\s]+\.[^@\s]+/.test(email.trim()),
    [email],
  )

  return (
    <Modal open={open} onClose={onClose} title="Add subscriber">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!valid) return
          await onSubmit({
            email: email.trim(),
            name: name.trim() || undefined,
          })
          setEmail('')
          setName('')
        }}
      >
        <label className="label">Email</label>
        <input
          className="input"
          type="email"
          required
          autoFocus
          placeholder="reader@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ marginBottom: 14 }}
        />
        <label className="label">Name (optional)</label>
        <input
          className="input"
          placeholder="Jane Doe"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ marginBottom: 22 }}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!valid || submitting}
            style={{ opacity: !valid || submitting ? 0.5 : 1 }}
          >
            {submitting ? 'Adding…' : 'Add subscriber'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
