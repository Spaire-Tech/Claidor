import { getServerURL } from '@/utils/api'
import { getQueryClient } from '@/utils/api/query'
import { schemas } from '@spaire/client'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { defaultRetry } from './retry'

// The generated OpenAPI client doesn't (yet) include the /v1/forms endpoints,
// so — like the rest of the email-marketing surface — we talk to them with a
// thin typed fetch wrapper.
const fetchApi = async <T>(path: string): Promise<T> => {
  const res = await fetch(getServerURL(path), { credentials: 'include' })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

const fetchApiWrite = async <T>(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> => {
  const res = await fetch(getServerURL(path), {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let detail = `API error: ${res.status}`
    try {
      const data = (await res.json()) as { detail?: unknown }
      if (typeof data.detail === 'string') detail = data.detail
    } catch {
      // keep the status-based message
    }
    throw new Error(detail)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export type FormStatus = 'draft' | 'published'

export type FormStyle = {
  accent: string
  corner: 'sharp' | 'rounded' | 'pill'
  media_side: 'left' | 'right'
  show_consent: boolean
  // object-position of the cover image (CSS value, e.g. "50% 50%"). Drives
  // the drag-to-reposition focal point on the cover.
  media_position: string
}

export const DEFAULT_FORM_STYLE: FormStyle = {
  accent: '#3b49f4',
  corner: 'sharp',
  media_side: 'left',
  show_consent: true,
  media_position: '50% 50%',
}

export type FormAttachedCustomField = {
  custom_field_id: string
  custom_field: schemas['CustomField']
  order: number
  required: boolean
}

export type FormResource = {
  id: string
  organization_id: string
  slug: string
  title: string
  subtitle: string | null
  button_label: string
  success_message: string | null
  status: FormStatus
  file_id: string | null
  image_url: string | null
  style: FormStyle
  attached_custom_fields: FormAttachedCustomField[]
  created_at: string
  modified_at: string | null
}

export type FormAttachedCustomFieldCreate = {
  custom_field_id: string
  required: boolean
}

export type FormCreatePayload = {
  title: string
  subtitle?: string | null
  button_label?: string
  success_message?: string | null
  status?: FormStatus
  slug?: string | null
  file_id?: string | null
  image_url?: string | null
  style?: FormStyle
  attached_custom_fields?: FormAttachedCustomFieldCreate[]
  organization_id?: string | null
}

export type FormUpdatePayload = Partial<{
  title: string
  subtitle: string | null
  button_label: string
  success_message: string | null
  status: FormStatus
  slug: string | null
  file_id: string | null
  image_url: string | null
  style: FormStyle
  attached_custom_fields: FormAttachedCustomFieldCreate[]
}>

export type FormPublic = {
  id: string
  organization_id: string
  title: string
  subtitle: string | null
  button_label: string
  success_message: string | null
  has_lead_magnet: boolean
  lead_magnet_name: string | null
  image_url: string | null
  style: FormStyle
  attached_custom_fields: FormAttachedCustomField[]
}

export type FormSubmitPayload = {
  email: string
  name?: string | null
  custom_field_data?: Record<string, string | number | boolean | null>
}

export type FormSubmitResult = {
  success: boolean
  success_message: string | null
  download: { url: string; expires_at: string } | null
}

type FormListResponse = {
  items: FormResource[]
  pagination: { total_count: number; max_page: number }
}

export const useForms = (
  organizationId: string,
  parameters?: {
    status?: FormStatus
    query?: string
    page?: number
    limit?: number
  },
) =>
  useQuery({
    queryKey: ['forms', { organizationId, ...(parameters || {}) }],
    queryFn: () => {
      const qs = new URLSearchParams({ organization_id: organizationId })
      if (parameters?.status) qs.set('status', parameters.status)
      if (parameters?.query) qs.set('query', parameters.query)
      if (parameters?.page) qs.set('page', String(parameters.page))
      if (parameters?.limit) qs.set('limit', String(parameters.limit))
      return fetchApi<FormListResponse>(`/v1/forms/?${qs}`)
    },
    retry: defaultRetry,
    placeholderData: keepPreviousData,
    enabled: !!organizationId,
  })

export const useFormById = (id?: string) =>
  useQuery({
    queryKey: ['forms', 'detail', id],
    queryFn: () => fetchApi<FormResource>(`/v1/forms/${id}`),
    retry: defaultRetry,
    enabled: !!id,
  })

// Anonymous, published-only read used by the embed + Space render paths.
export const useFormPublic = (id?: string) =>
  useQuery({
    queryKey: ['forms', 'public', id],
    queryFn: () => fetchApi<FormPublic>(`/v1/forms/${id}/public`),
    retry: defaultRetry,
    enabled: !!id,
  })

export type FormSubmissionRow = {
  id: string
  form_id: string
  email: string
  name: string | null
  email_subscriber_id: string | null
  custom_field_data: Record<string, string | number | boolean | null>
  created_at: string
  modified_at: string | null
}

export const useFormSubmissions = (
  formId?: string,
  parameters?: { page?: number; limit?: number },
) =>
  useQuery({
    queryKey: ['forms', 'submissions', formId, { ...(parameters || {}) }],
    queryFn: () => {
      const qs = new URLSearchParams()
      if (parameters?.page) qs.set('page', String(parameters.page))
      if (parameters?.limit) qs.set('limit', String(parameters.limit))
      return fetchApi<{
        items: FormSubmissionRow[]
        pagination: { total_count: number; max_page: number }
      }>(`/v1/forms/${formId}/submissions?${qs}`)
    },
    enabled: !!formId,
    retry: defaultRetry,
    placeholderData: keepPreviousData,
  })

// Published forms are also embedded in the storefront payload
// (`/v1/storefronts/{slug}` → `forms`), which the Space preview renders
// from. Invalidate that cache too so a form edit (e.g. a new thumbnail)
// shows up in the preview without a hard refresh — not just in the editor
// canvas, which reads from the `['forms']` list.
const invalidateForms = () => {
  const queryClient = getQueryClient()
  queryClient.invalidateQueries({ queryKey: ['forms'] })
  queryClient.invalidateQueries({ queryKey: ['storefront'] })
}

export const useCreateForm = () =>
  useMutation({
    mutationFn: (body: FormCreatePayload) =>
      fetchApiWrite<FormResource>('/v1/forms/', 'POST', body),
    onSuccess: invalidateForms,
  })

export const useUpdateForm = () =>
  useMutation({
    mutationFn: ({ id, body }: { id: string; body: FormUpdatePayload }) =>
      fetchApiWrite<FormResource>(`/v1/forms/${id}`, 'PATCH', body),
    onSuccess: invalidateForms,
  })

export const useDeleteForm = () =>
  useMutation({
    mutationFn: (id: string) =>
      fetchApiWrite<void>(`/v1/forms/${id}`, 'DELETE'),
    onSuccess: invalidateForms,
  })

// Public submission — anonymous visitors POST their email (+ any custom
// fields) and get back an immediate download link when the form has a
// lead magnet.
export const useSubmitForm = (formId: string) =>
  useMutation({
    mutationFn: (body: FormSubmitPayload) =>
      fetchApiWrite<FormSubmitResult>(
        `/v1/forms/${formId}/submit`,
        'POST',
        body,
      ),
  })
