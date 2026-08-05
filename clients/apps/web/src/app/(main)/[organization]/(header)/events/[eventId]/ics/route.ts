import { NextRequest, NextResponse } from 'next/server'

// Same-origin proxy for the event .ics file. The browser ignores the
// HTML5 `download` attribute on cross-origin links (the backend lives
// on api.spairehq.com while this page is on the app domain), so a
// direct <a download href="https://api..."> would navigate/preview
// instead of saving — especially on Safari. Routing the download
// through this same-origin handler makes `download` work everywhere.
//
// We just pipe the backend response through, preserving the calendar
// content-type and forcing an attachment disposition with a readable
// filename.

const getBaseURL = () =>
  process.env.POLAR_API_URL || process.env.NEXT_PUBLIC_API_URL

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ organization: string; eventId: string }> },
) {
  const { eventId } = await params
  const base = getBaseURL()
  if (!base) {
    return new NextResponse('Calendar service unavailable', { status: 502 })
  }

  const upstream = await fetch(
    `${base}/v1/community/public/events/${eventId}/ics`,
    { next: { revalidate: 10 } },
  )

  if (!upstream.ok) {
    return new NextResponse('Event not found', { status: upstream.status })
  }

  const body = await upstream.text()
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="event-${eventId}.ics"`,
      'Cache-Control': 'public, max-age=10',
    },
  })
}
