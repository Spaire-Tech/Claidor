import { getServerURL } from '@/utils/api'

/**
 * Plain typed fetches against `/v1/dossiers/*` — same base URL and cookie
 * credentials as the librarian and the corpus reading room.
 */

export type DossierStatus = 'open' | 'closed' | 'archived'
export type DossierRole = 'lead' | 'member'

export type DocumentCategory =
  | 'pleading'
  | 'exhibit'
  | 'contract'
  | 'statement'
  | 'correspondence'
  | 'decision'
  | 'other'

export type ExtractionStatus =
  | 'pending'
  | 'extracted'
  | 'unextractable'
  | 'failed'

export type QuestionStatus = 'answered' | 'clarification_requested' | 'failed'

export type CitationNature = 'fact' | 'law'
export type CitationSourceKind = 'document' | 'article' | 'decision'

export interface DossierListItem {
  id: string
  name: string
  reference: string | null
  client_name: string | null
  status: DossierStatus
  document_count: number
  member_count: number
  created_at: string
  modified_at: string | null
}

export interface DossierMember {
  id: string
  user_id: string
  email: string
  role: DossierRole
}

export interface DossierDocument {
  id: string
  title: string
  category: DocumentCategory
  piece_number: number | null
  extraction_status: ExtractionStatus
  file_name: string
  mime_type: string
  size: number
  created_at: string
  readable: boolean
}

export interface Dossier {
  id: string
  name: string
  reference: string | null
  client_name: string | null
  status: DossierStatus
  notes: string | null
  created_at: string
  members: DossierMember[]
  documents: DossierDocument[]
}

export interface DossierCitation {
  id: string
  nature: CitationNature
  source_kind: CitationSourceKind
  source_id: string | null
  title: string
  quote: string
}

export interface DossierQuestion {
  id: string
  question: string
  answer: string | null
  status: QuestionStatus
  versions_used: string[] | null
  authority_label: string | null
  authority_count: number | null
  asked_by: string | null
  created_at: string
  answered_at: string | null
  facts: DossierCitation[]
  law: DossierCitation[]
}

export class DossierRequestError extends Error {
  constructor(public readonly status?: number) {
    super(`Dossier request failed${status ? ` (${status})` : ''}`)
  }
}

const request = async <T>(
  path: string,
  init?: RequestInit,
  signal?: AbortSignal,
): Promise<T> => {
  const response = await fetch(getServerURL(`/v1/dossiers${path}`), {
    credentials: 'include',
    signal,
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    throw new DossierRequestError(response.status)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export const fetchDossiers = (
  organizationId: string,
  signal?: AbortSignal,
): Promise<DossierListItem[]> =>
  request(`?organization_id=${organizationId}`, undefined, signal)

export const fetchDossier = (
  dossierId: string,
  signal?: AbortSignal,
): Promise<Dossier> => request(`/${dossierId}`, undefined, signal)

export const createDossier = (
  organizationId: string,
  body: { name: string; reference?: string; client_name?: string },
): Promise<Dossier> =>
  request(`?organization_id=${organizationId}`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const fetchQuestions = (
  dossierId: string,
  signal?: AbortSignal,
): Promise<DossierQuestion[]> =>
  request(`/${dossierId}/questions`, undefined, signal)

export const askInDossier = (
  dossierId: string,
  body: { question: string; answer_both_versions?: boolean },
): Promise<DossierQuestion> =>
  request(`/${dossierId}/ask`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const addDocument = (
  dossierId: string,
  body: {
    file_id: string
    title: string
    category: DocumentCategory
  },
): Promise<DossierDocument> =>
  request(`/${dossierId}/documents`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const removeDocument = (
  dossierId: string,
  documentId: string,
): Promise<void> =>
  request(`/${dossierId}/documents/${documentId}`, { method: 'DELETE' })

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  pleading: 'Écriture',
  exhibit: 'Pièce',
  contract: 'Contrat',
  statement: 'Relevé',
  correspondence: 'Courrier',
  decision: 'Décision',
  other: 'Autre',
}

export const STATUS_LABELS: Record<DossierStatus, string> = {
  open: 'En cours',
  closed: 'Clos',
  archived: 'Archivé',
}

/**
 * What the file list says about a piece the machine could not read. Shown
 * plainly: a document that contributes nothing to answers should never look
 * like one that does.
 */
export const EXTRACTION_LABELS: Record<ExtractionStatus, string> = {
  pending: 'Lecture en cours',
  extracted: 'Lisible',
  unextractable: 'Non lisible (scan sans texte)',
  failed: 'Lecture échouée',
}
