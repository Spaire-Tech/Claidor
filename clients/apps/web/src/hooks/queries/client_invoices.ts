import { getQueryClient } from '@/utils/api/query'
import { api } from '@/utils/client'
import { unwrap } from '@spaire/client'
import { useMutation, useQuery } from '@tanstack/react-query'
import { defaultRetry } from './retry'

// Local types until API client is regenerated
export interface ClientInvoiceLineItemCreate {
  description: string
  quantity: number
  unit_amount: number
}

export interface ClientInvoiceCreate {
  customer_id: string
  currency: string
  line_items: ClientInvoiceLineItemCreate[]
  due_date?: string | null
  memo?: string | null
  po_number?: string | null
  on_behalf_of_label?: string | null
  discount_amount?: number
  discount_label?: string | null
  include_payment_link?: boolean
  show_logo?: boolean
  show_mor_attribution?: boolean
  user_metadata?: Record<string, string> | null
}

export interface ClientInvoiceLineItem {
  id: string
  created_at: string
  modified_at: string | null
  client_invoice_id: string
  stripe_invoice_item_id: string | null
  description: string
  quantity: number
  unit_amount: number
  currency: string
  amount: number
  tax_amount: number
}

export interface ClientInvoice {
  id: string
  number?: string | null
  created_at: string
  modified_at: string | null
  organization_id: string
  customer_id: string
  stripe_invoice_id: string | null
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  currency: string
  subtotal_amount: number
  discount_amount: number
  tax_amount: number
  total_amount: number
  memo: string | null
  po_number: string | null
  due_date: string | null
  on_behalf_of_label: string | null
  discount_label: string | null
  include_payment_link: boolean
  show_logo: boolean
  show_mor_attribution: boolean
  stripe_hosted_invoice_url: string | null
  invoice_pdf_url: string | null
  checkout_link: string | null
  user_metadata: Record<string, string> | null
  order_id: string | null
  line_items: ClientInvoiceLineItem[]
}

export interface ClientInvoiceList {
  items: ClientInvoice[]
  pagination: { total_count: number; max_page: number }
}

export interface ClientInvoiceListParams {
  page?: number
  limit?: number
  sorting?: string[]
}

export interface ClientInvoicePreviewRequest {
  organization_id: string
  customer_id?: string | null
  currency: string
  line_items: ClientInvoiceLineItemCreate[]
  due_date?: string | null
  memo?: string | null
  po_number?: string | null
  on_behalf_of_label?: string | null
  discount_amount?: number
  discount_label?: string | null
  include_payment_link?: boolean
  checkout_link_url?: string | null
  show_logo: boolean
  show_mor_attribution: boolean
  billing_name?: string | null
  billing_line1?: string | null
  billing_line2?: string | null
  billing_city?: string | null
  billing_state?: string | null
  billing_postal_code?: string | null
  billing_country?: string | null
}

export async function fetchInvoicePreviewPdf(
  body: ClientInvoicePreviewRequest,
): Promise<string> {
  const response = await (api as any).POST('/v1/client-invoices/preview-pdf', {
    body,
    parseAs: 'arrayBuffer',
  })
  if (response.error) {
    throw new Error('Preview failed')
  }
  const blob = new Blob([response.data as ArrayBuffer], {
    type: 'application/pdf',
  })
  return URL.createObjectURL(blob)
}

export const useClientInvoices = (
  organizationId?: string,
  parameters?: ClientInvoiceListParams,
) =>
  useQuery({
    queryKey: ['client_invoices', { organizationId, ...(parameters || {}) }],
    queryFn: async () => {
      const { data, error } = await (api as any).GET('/v1/client-invoices/', {
        params: {
          query: {
            organization_id: organizationId,
            ...parameters,
          },
        },
      })
      if (error) {
        // Return empty data on error rather than throwing so the UI doesn't
        // enter an infinite retry loop while the endpoint is being set up.
        return { items: [], pagination: { total_count: 0, max_page: 1 } } as ClientInvoiceList
      }
      return data as ClientInvoiceList
    },
    retry: false,
    enabled: !!organizationId,
  })

export const useClientInvoice = (id: string, initialData?: ClientInvoice) =>
  useQuery({
    queryKey: ['client_invoices', { id }],
    queryFn: async () => {
      const { data, error } = await (api as any).GET('/v1/client-invoices/{id}', {
        params: { path: { id } },
      })
      if (error) throw error
      return data as ClientInvoice
    },
    retry: defaultRetry,
    initialData,
  })

export const useCreateClientInvoice = (organizationId: string) =>
  useMutation({
    mutationFn: async (body: ClientInvoiceCreate) => {
      const { data, error } = await (api as any).POST('/v1/client-invoices/', {
        body,
      })
      if (error) throw error
      return data as ClientInvoice
    },
    onSuccess: () => {
      const queryClient = getQueryClient()
      queryClient.invalidateQueries({
        queryKey: ['client_invoices', { organizationId }],
      })
    },
  })

export const useSendClientInvoice = (id: string) =>
  useMutation({
    mutationFn: async () => {
      const { data, error } = await (api as any).POST(
        '/v1/client-invoices/{id}/send',
        { params: { path: { id } } },
      )
      if (error) throw error
      return data as ClientInvoice
    },
    onSuccess: (updated) => {
      const queryClient = getQueryClient()
      queryClient.setQueriesData<ClientInvoice>(
        { queryKey: ['client_invoices', { id }] },
        updated,
      )
    },
  })

export const useVoidClientInvoice = (id: string) =>
  useMutation({
    mutationFn: async () => {
      const { data, error } = await (api as any).POST(
        '/v1/client-invoices/{id}/void',
        { params: { path: { id } } },
      )
      if (error) throw error
      return data as ClientInvoice
    },
    onSuccess: (updated) => {
      const queryClient = getQueryClient()
      queryClient.setQueriesData<ClientInvoice>(
        { queryKey: ['client_invoices', { id }] },
        updated,
      )
    },
  })

export const useFinalizeClientInvoice = (id: string) =>
  useMutation({
    mutationFn: async () => {
      const { data, error } = await (api as any).POST(
        '/v1/client-invoices/{id}/finalize',
        { params: { path: { id } } },
      )
      if (error) throw error
      return data as ClientInvoice
    },
    onSuccess: (updated) => {
      const queryClient = getQueryClient()
      queryClient.setQueriesData<ClientInvoice>(
        { queryKey: ['client_invoices', { id }] },
        updated,
      )
    },
  })

export const useMarkClientInvoicePaid = (id: string) =>
  useMutation({
    mutationFn: async () => {
      const { data, error } = await (api as any).POST(
        '/v1/client-invoices/{id}/mark-paid',
        { params: { path: { id } } },
      )
      if (error) throw error
      return data as ClientInvoice
    },
    onSuccess: (updated) => {
      const queryClient = getQueryClient()
      queryClient.setQueriesData<ClientInvoice>(
        { queryKey: ['client_invoices', { id }] },
        updated,
      )
      queryClient.invalidateQueries({ queryKey: ['client_invoices'] })
    },
  })
