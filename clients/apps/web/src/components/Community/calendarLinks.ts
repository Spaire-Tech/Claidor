// Calendar deep-link builders for the event detail modal + public
// event page. Google and Outlook use their long-standing URL formats;
// Apple/iCal users just download the .ics file the backend serves.
//
// We don't link to a single .ics URL for Google/Outlook because their
// URL formats embed the event metadata directly — that way the user
// lands on a pre-filled "create event" form and can tweak before
// saving, which matches the calendar-add UX everywhere else.

const pad = (n: number): string => (n < 10 ? `0${n}` : String(n))

// Format a Date in the YYYYMMDDTHHMMSSZ shape both Google and Outlook
// accept (and Apple via the .ics fallback). Explicit instead of
// `toISOString().replace(/[-:.]/g, '')` so the intent is obvious.
const fmtUtc = (d: Date): string =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
  `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`

export type CalendarSource = {
  title: string
  startAt: string | Date
  durationMinutes: number
  description?: string | null
  location?: string | null
  meetingUrl?: string | null
}

export type CalendarLinks = {
  google: string
  outlook: string
  // The backend .ics endpoint. Browsers hand the download to the
  // Calendar app (iOS/macOS) or to Outlook's import dialog.
  ics: string
}

// Description body for the Google/Outlook deep-link. Meeting URL on
// its own line so the calendar app auto-linkifies it.
const composeDescription = (src: CalendarSource): string => {
  const parts: string[] = []
  if (src.description) parts.push(src.description.trim())
  if (src.meetingUrl) parts.push(`Join: ${src.meetingUrl}`)
  return parts.join('\n\n')
}

// Prefer a meeting URL over freetext location — calendar apps render
// URL-shaped locations as a join button. If both are set, the URL wins
// and the location text lives in the description.
const composeLocation = (src: CalendarSource): string =>
  (src.meetingUrl || src.location || '').trim()

export function calendarLinksFor(
  src: CalendarSource,
  icsUrl: string,
): CalendarLinks {
  const start =
    src.startAt instanceof Date ? src.startAt : new Date(src.startAt)
  const end = new Date(start.getTime() + src.durationMinutes * 60_000)
  const dates = `${fmtUtc(start)}/${fmtUtc(end)}`
  const description = composeDescription(src)
  const location = composeLocation(src)

  const googleParams = new URLSearchParams({
    action: 'TEMPLATE',
    text: src.title,
    dates,
    details: description,
    location,
  })
  const outlookParams = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: src.title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body: description,
    location,
  })

  return {
    google: `https://calendar.google.com/calendar/render?${googleParams.toString()}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?${outlookParams.toString()}`,
    ics: icsUrl,
  }
}
