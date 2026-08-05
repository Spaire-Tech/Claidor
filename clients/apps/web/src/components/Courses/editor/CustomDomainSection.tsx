'use client'

import {
  CustomDomainStatus,
  useCustomDomain,
  useRemoveCustomDomain,
  useSetCustomDomain,
  useVerifyCustomDomain,
} from '@/hooks/queries/customDomain'
import { schemas } from '@spaire/client'
import { useState } from 'react'
import { FeatureGate } from '../../Entitlements/FeatureGate'
import { toast } from '../../Toast/use-toast'

// Custom (hosted) domain for the course landing + student portal.
// Rendered as a section inside the course editor's Settings tab and
// styled to match its sibling sections. The domain is org-level (like
// the Auth tab's portal sign-in image): one domain serves the whole
// masterclass.

const STATUS_CHIP: Record<
  NonNullable<CustomDomainStatus['status']>,
  { label: string; className: string }
> = {
  pending: {
    label: 'Waiting for DNS',
    className: 'bg-amber-50 text-amber-700',
  },
  active: { label: 'Live', className: 'bg-green-50 text-green-700' },
  failed: {
    label: 'Attention needed',
    className: 'bg-red-50 text-red-600',
  },
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      title="Copy to clipboard"
      className="max-w-full truncate rounded-lg border border-gray-200 bg-white px-2 py-1 text-left font-mono text-xs text-gray-700 transition-colors hover:border-gray-300"
    >
      {copied ? 'Copied!' : value}
    </button>
  )
}

function DomainForm({
  organizationId,
  initialDomain,
}: {
  organizationId: string
  initialDomain?: string
}) {
  const [domain, setDomain] = useState(initialDomain ?? '')
  const setCustomDomain = useSetCustomDomain(organizationId)

  const trimmed = domain.trim()
  const handleConnect = async () => {
    if (!trimmed) return
    try {
      await setCustomDomain.mutateAsync(trimmed)
      toast({
        title: 'Domain saved',
        description: 'Add the DNS records below to finish connecting it.',
      })
    } catch (err) {
      toast({
        title: 'Could not save that domain',
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-900">
        Your subdomain
      </label>
      <p className="mt-0.5 text-xs text-gray-500">
        Use a subdomain of a domain you own, like learn.yourdomain.com. Root
        domains (yourdomain.com) aren’t supported yet.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConnect()
          }}
          className="focus:border-ce-accent focus:ring-ce-accent-ring w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 focus:ring-2 focus:outline-none"
          placeholder="learn.yourdomain.com"
          spellCheck={false}
          autoCapitalize="none"
        />
        <button
          type="button"
          disabled={!trimmed || setCustomDomain.isPending}
          onClick={handleConnect}
          className="shrink-0 rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
        >
          {setCustomDomain.isPending ? 'Saving…' : 'Connect domain'}
        </button>
      </div>
    </div>
  )
}

function ConnectedDomain({
  organizationId,
  status,
}: {
  organizationId: string
  status: CustomDomainStatus
}) {
  const verify = useVerifyCustomDomain(organizationId)
  const remove = useRemoveCustomDomain(organizationId)
  const [editing, setEditing] = useState(false)

  const chip = status.status ? STATUS_CHIP[status.status] : null

  const handleVerify = async () => {
    try {
      const result = await verify.mutateAsync()
      if (result.status === 'active') {
        toast({
          title: 'Your domain is live',
          description: `${result.domain} now serves your masterclass.`,
        })
      } else {
        const missing = [
          !result.checks?.cname_ok && 'the CNAME record',
          !result.checks?.txt_ok && 'the TXT record',
        ]
          .filter(Boolean)
          .join(' and ')
        toast({
          title: 'Not verified yet',
          description: `We couldn’t find ${missing}. DNS changes can take up to an hour to propagate.`,
        })
      }
    } catch (err) {
      toast({
        title: 'Verification failed',
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const handleRemove = async () => {
    if (
      !window.confirm(
        `Remove ${status.domain}? Your masterclass immediately falls back to its Spaire address; links you already shared keep working.`,
      )
    ) {
      return
    }
    try {
      await remove.mutateAsync()
      toast({ title: 'Domain removed' })
    } catch (err) {
      toast({
        title: 'Failed to remove domain',
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-gray-900">
              {status.domain}
            </span>
            {chip && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}
              >
                {chip.label}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-gray-500">
            {status.status === 'active' ? (
              <a
                href={`https://${status.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-700 hover:underline"
              >
                Open your masterclass ↗
              </a>
            ) : status.status === 'failed' ? (
              'The DNS records below stopped resolving — restore them and check again.'
            ) : (
              'Add the records below, then check again. We also re-check automatically.'
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={verify.isPending || remove.isPending}
            onClick={handleVerify}
            className="rounded-full border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            {verify.isPending ? 'Checking…' : 'Check now'}
          </button>
          <button
            type="button"
            disabled={verify.isPending || remove.isPending}
            onClick={handleRemove}
            className="rounded-full border border-gray-300 px-4 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            {remove.isPending ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>

      {status.status !== 'active' && status.dns_records.length > 0 && (
        <div>
          <div className="text-sm font-medium text-gray-900">
            Add these DNS records
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            At the registrar where you manage your domain (GoDaddy, Namecheap,
            Cloudflare, …). Changes usually apply within minutes but can take up
            to an hour.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {status.dns_records.map((record) => {
              const ok =
                status.checks == null
                  ? null
                  : record.type === 'CNAME'
                    ? status.checks.cname_ok
                    : status.checks.txt_ok
              return (
                <div
                  key={record.type}
                  className="grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-gray-900">
                      {record.type}
                    </span>
                    {ok != null && (
                      <span
                        className={
                          'text-xs ' + (ok ? 'text-green-600' : 'text-red-500')
                        }
                        title={ok ? 'Record found' : 'Record not found yet'}
                      >
                        {ok ? '✓' : '✗'}
                      </span>
                    )}
                  </div>
                  <CopyValue value={record.name} />
                  <CopyValue value={record.value} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {editing ? (
        <DomainForm
          organizationId={organizationId}
          initialDomain={status.domain ?? undefined}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="self-start text-xs font-medium text-gray-500 transition-colors hover:text-gray-700"
        >
          Use a different domain
        </button>
      )}
    </div>
  )
}

export function CustomDomainSection({
  organization,
}: {
  organization: schemas['Organization']
}) {
  const { data: status, isLoading } = useCustomDomain(organization.id)

  return (
    <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6">
      <div className="mb-4">
        <h2 className="text-lg font-medium text-gray-900">Custom domain</h2>
        <p className="mt-1 text-gray-500">
          Serve your landing page and student portal from your own domain — like
          learn.yourdomain.com. Emails and share links switch over automatically
          once it’s live.
        </p>
      </div>

      <FeatureGate
        feature="custom_storefront_domain"
        organizationId={organization.id}
        organizationSlug={organization.slug}
        variant="inline"
      >
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-xl bg-gray-100" />
        ) : status?.domain ? (
          <ConnectedDomain organizationId={organization.id} status={status} />
        ) : (
          <DomainForm organizationId={organization.id} />
        )}
      </FeatureGate>
    </section>
  )
}
