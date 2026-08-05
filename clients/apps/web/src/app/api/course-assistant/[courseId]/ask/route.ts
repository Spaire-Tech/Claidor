import { getServerURL } from '@/utils/api'

// Same-origin streaming proxy for the Course TA answer stream.
//
// The browser streams from this route (same origin as the app, which is the
// transport our other chats use and which streams token-by-token), while this
// handler talks to the backend over the internal API URL — bypassing the
// browser-facing API edge that buffers SSE and made answers arrive all at once.
// It's a transparent passthrough: the backend's SSE frames (text, citations,
// general, follow, done) flow straight through unchanged.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(
  req: Request,
  ctx: { params: Promise<{ courseId: string }> },
): Promise<Response> {
  const { courseId } = await ctx.params
  const authorization = req.headers.get('authorization')
  if (!authorization) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await req.text()

  const upstream = await fetch(
    getServerURL(`/v1/course-assistant/${courseId}/ask`),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
        Accept: 'text/event-stream',
      },
      body,
      // Don't let the platform buffer the upstream response.
      cache: 'no-store',
    },
  )

  if (!upstream.ok || !upstream.body) {
    return new Response('The assistant is temporarily unavailable.', {
      status: upstream.status || 502,
    })
  }

  // Stream the upstream body straight back, with headers that keep proxies from
  // buffering the SSE.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
