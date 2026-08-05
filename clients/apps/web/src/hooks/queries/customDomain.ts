'use client'

import { getQueryClient } from '@/utils/api/query'
import { useMutation, useQuery } from '@tanstack/react-query'

// Hand-typed like hooks/queries/courses.ts — mirrors the backend's
// polar/organization_custom_domain/schemas.py. Keep in sync.

export type CustomDomainLifecycleStatus = 'pending' | 'active' | 'failed'

export type CustomDomainDNSRecord = {
  type: string
  name: string
  value: string
}

export type CustomDomainChecks = {
  cname_ok: boolean
  txt_ok: boolean
}

export type CustomDomainStatus = {
  domain: string | null
  status: CustomDomainLifecycleStatus | null
  verified_at: string | null
  last_checked_at: string | null
  dns_records: CustomDomainDNSRecord[]
  checks?: CustomDomainChecks | null
}

async function domainApiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
  if (!res.ok) {
    // PolarError responses carry {"error": name, "detail": message} —
    // surface the human message so toasts read well.
    let message = `API ${res.status}`
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') {
        message = body.detail
      }
    } catch {
      // non-JSON body — keep the generic message
    }
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

const queryKey = (organizationId: string) => ['custom_domain', organizationId]

export const useCustomDomain = (organizationId: string) =>
  useQuery({
    queryKey: queryKey(organizationId),
    queryFn: () =>
      domainApiFetch<CustomDomainStatus>(
        `/v1/organizations/${organizationId}/custom-domain`,
      ),
    retry: 1,
  })

export const useSetCustomDomain = (organizationId: string) =>
  useMutation({
    mutationFn: (domain: string) =>
      domainApiFetch<CustomDomainStatus>(
        `/v1/organizations/${organizationId}/custom-domain`,
        { method: 'PUT', body: JSON.stringify({ domain }) },
      ),
    onSuccess: (data) => {
      getQueryClient().setQueryData(queryKey(organizationId), data)
    },
  })

export const useVerifyCustomDomain = (organizationId: string) =>
  useMutation({
    mutationFn: () =>
      domainApiFetch<CustomDomainStatus>(
        `/v1/organizations/${organizationId}/custom-domain/verify`,
        { method: 'POST' },
      ),
    onSuccess: (data) => {
      getQueryClient().setQueryData(queryKey(organizationId), data)
      // Activation flips organization.custom_domain, which link builders
      // read — refresh any cached organization objects.
      getQueryClient().invalidateQueries({ queryKey: ['organizations'] })
    },
  })

export const useRemoveCustomDomain = (organizationId: string) =>
  useMutation({
    mutationFn: () =>
      domainApiFetch<void>(
        `/v1/organizations/${organizationId}/custom-domain`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      getQueryClient().invalidateQueries({
        queryKey: queryKey(organizationId),
      })
      getQueryClient().invalidateQueries({ queryKey: ['organizations'] })
    },
  })
