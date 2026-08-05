// Brick 14 — the course data that the Course blocks bind to. The editor is
// handed a CourseData (a real course in the app, a sample in the harness);
// every Course block auto-fills from it and live-syncs when it changes. Shapes
// map onto the Polar models — course.title / thumbnail_url / trailer_url,
// course_lesson.title / duration_seconds, the org's instructor.

export interface CourseLessonData {
  title: string
  duration: string // pre-formatted, e.g. "14 min"
}

export interface CourseInstructor {
  name: string
  role: string
  bio: string
  avatar: string | null
}

export interface CourseData {
  title: string
  eyebrow: string // series / category line
  tagline: string // short description
  heroImage: string | null
  trailerImage: string | null
  // Mux playback id for the trailer video — the editor plays it inline; the
  // sent email shows the poster (trailerImage) linking out to watch it.
  trailerPlaybackId: string | null
  instructor: CourseInstructor
  lessons: CourseLessonData[]
  level: string
  totalDuration: string // e.g. "3h 40m"
  progress: { completed: number; total: number }
  welcomeHeading?: string // welcome-note headline (AI may override)
  welcome: string[] // welcome-note paragraphs
  ctaText: string
  ctaHref: string
}

/** "PT" → "14 min" / "1h 05m". Used when mapping real lesson durations. */
export const formatDuration = (seconds: number): string => {
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${String(r).padStart(2, '0')}m` : `${h}h`
}

/** Sum lesson seconds → "3h 40m". */
export const totalDurationOf = (lessonSeconds: number[]): string => {
  const total = lessonSeconds.reduce((a, b) => a + b, 0)
  const m = Math.round(total / 60)
  const h = Math.floor(m / 60)
  const r = m % 60
  return h ? `${h}h ${String(r).padStart(2, '0')}m` : `${r}m`
}

// The sample course used by the harness — mirrors the design's content so the
// blocks render exactly as designed before a real course is wired (brick 15).
export const SAMPLE_COURSE: CourseData = {
  title: 'Southern Cooking',
  eyebrow: 'The Kitchen Series',
  tagline:
    'Heritage technique, soul food, and the stories behind every dish.',
  heroImage: null,
  trailerImage: null,
  trailerPlaybackId: null,
  instructor: {
    name: 'Adaeze Bello',
    role: 'Chef & Instructor',
    bio: 'Adaeze runs a Charleston kitchen rooted in Gullah Geechee tradition, where the recipes carry as much history as flavour.',
    avatar: null,
  },
  lessons: [
    { title: 'The Southern Pantry', duration: '14 min' },
    { title: 'Cornbread, Three Ways', duration: '22 min' },
    { title: 'Low & Slow Braises', duration: '31 min' },
    { title: 'Sunday Greens & Gravy', duration: '26 min' },
    { title: 'Plating with Intention', duration: '18 min' },
  ],
  level: 'All levels',
  totalDuration: '3h 40m',
  progress: { completed: 3, total: 12 },
  welcome: [
    'I’m glad you’re here. This is everything my grandmother taught me, and everything I’ve learned in the twenty years since. Take it one lesson at a time.',
  ],
  ctaText: 'Begin the first lesson',
  ctaHref: '#',
}
