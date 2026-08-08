import { getServerURL } from '@/utils/api'

export interface LibrarianCitation {
  title: string
  quote: string
  source_kind: 'article' | 'decision'
  source_id: string
}

export interface LibrarianUsage {
  input_tokens: number
  output_tokens: number
}

/**
 * The librarian needs a date before it can answer: the clarifying question
 * arrives instead of any answer text.
 */
export interface LibrarianClarification {
  message: string
  /** ISO date separating the 1998 and 2023 regimes, e.g. "2024-02-16". */
  cutoff: string
}

export interface LibrarianAuthorityDecision {
  id: string
  number: string
  decided_on: string
}

/**
 * Authority signal emitted after the answer text, before `done` — replaces
 * the old « Autorité : » line the model used to write in the markdown.
 */
export interface LibrarianAuthority {
  label: string
  count: number
  decisions: LibrarianAuthorityDecision[]
}

export interface LibrarianDone extends LibrarianUsage {
  /** Acte uniforme versions the answer relied on, e.g. ["1998", "2023"]. */
  versions_used: string[]
}

export interface LibrarianStreamCallbacks {
  onText: (delta: string) => void
  onCitation: (citation: LibrarianCitation) => void
  onClarification: (clarification: LibrarianClarification) => void
  onAuthority: (authority: LibrarianAuthority) => void
  onDone: (done: LibrarianDone) => void
  onError: (message: string) => void
}

/** The backend answered 503: the librarian is not configured. */
export class LibrarianNotConfiguredError extends Error {
  constructor() {
    super('Librarian is not configured')
  }
}

/** Any other non-OK response or missing body. */
export class LibrarianRequestError extends Error {
  constructor(status?: number) {
    super(`Librarian request failed${status ? ` (${status})` : ''}`)
  }
}

interface RawSSEEvent {
  event: string
  data: string
}

const parseRawEvent = (raw: string): RawSSEEvent | null => {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
    } else if (line.startsWith('data:')) {
      let value = line.slice('data:'.length)
      if (value.startsWith(' ')) {
        value = value.slice(1)
      }
      dataLines.push(value)
    }
  }
  if (dataLines.length === 0) {
    return null
  }
  return { event, data: dataLines.join('\n') }
}

/**
 * POST the question to `/v1/librarian/ask` and hand-parse the SSE response
 * from the ReadableStream. The native EventSource API cannot POST and we
 * don't want the auto-reconnect semantics of event-source-plus here (a
 * reconnect would re-submit the question), so a small purpose-built parser
 * is the simplest correct tool.
 */
export const askLibrarian = async (
  question: string,
  callbacks: LibrarianStreamCallbacks,
  signal: AbortSignal,
  answerBothVersions: boolean = false,
  organizationId: string | null = null,
): Promise<void> => {
  const response = await fetch(getServerURL('/v1/librarian/ask'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      question,
      answer_both_versions: answerBothVersions,
      // Given, the question and its answer are kept in Historique.
      organization_id: organizationId ?? null,
    }),
    signal,
  })

  if (response.status === 503) {
    throw new LibrarianNotConfiguredError()
  }
  if (!response.ok || !response.body) {
    throw new LibrarianRequestError(response.status)
  }

  const dispatch = (raw: string) => {
    const parsed = parseRawEvent(raw)
    if (!parsed) {
      return
    }
    let data: any
    try {
      data = JSON.parse(parsed.data)
    } catch {
      return
    }
    switch (parsed.event) {
      case 'text':
        callbacks.onText(typeof data.delta === 'string' ? data.delta : '')
        break
      case 'citation':
        callbacks.onCitation(data as LibrarianCitation)
        break
      case 'clarification':
        callbacks.onClarification({
          message: typeof data.message === 'string' ? data.message : '',
          cutoff: typeof data.cutoff === 'string' ? data.cutoff : '',
        })
        break
      case 'authority':
        callbacks.onAuthority({
          label: typeof data.label === 'string' ? data.label : '',
          count: typeof data.count === 'number' ? data.count : 0,
          decisions: Array.isArray(data.decisions) ? data.decisions : [],
        })
        break
      case 'done':
        callbacks.onDone({
          ...data,
          versions_used: Array.isArray(data.versions_used)
            ? data.versions_used
            : [],
        } as LibrarianDone)
        break
      case 'error':
        callbacks.onError(
          typeof data.message === 'string' ? data.message : 'Unknown error',
        )
        break
    }
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const drain = () => {
    // Hold back a trailing \r: its \n half may come in the next chunk, and
    // normalizing it to \n now would fabricate an event boundary.
    let carry = ''
    if (buffer.endsWith('\r')) {
      carry = '\r'
      buffer = buffer.slice(0, -1)
    }
    buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    let boundary: number
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      dispatch(raw)
    }
    buffer += carry
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    buffer += decoder.decode(value, { stream: true })
    drain()
  }
  buffer += decoder.decode()
  drain()
  if (buffer.trim()) {
    dispatch(buffer)
  }
}
