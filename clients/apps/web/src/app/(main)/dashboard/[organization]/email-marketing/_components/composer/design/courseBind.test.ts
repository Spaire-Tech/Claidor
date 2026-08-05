import { describe, expect, it } from 'vitest'

import type { CourseData } from '../v3/courseData'
import { bindCourse, makeAssetResolver } from './courseBind'
import { REG, THEMES, TEMPLATES } from './emailData'
import type { Block } from './emailEngine'

// Build a real template's blocks the way the engine does (defaults + template props).
function blocksFor(triggerKey: string, themeKey = 'studio'): Block[] {
  const t = THEMES[themeKey]
  return TEMPLATES[triggerKey].blocks.map((s, i) => ({
    id: 'b' + i,
    type: s.type,
    props: Object.assign({}, REG[s.type].defaults(t), s.props),
  }))
}

const course: CourseData = {
  title: 'Italian Home Cooking',
  eyebrow: 'A Spaire Series',
  tagline: 'Pasta from scratch.',
  heroImage: 'https://cdn/hero.jpg',
  trailerImage: 'https://cdn/trailer.jpg',
  trailerPlaybackId: 'muxPB123',
  instructor: { name: 'Marco Rossi', role: 'Head Chef', bio: 'Bologna-trained.', avatar: null },
  lessons: [
    { title: 'Fresh Pasta', duration: '18 min' },
    { title: 'Mother Sauces', duration: '24 min' },
    { title: 'Sunday Ragù', duration: '33 min' },
    { title: 'Risotto', duration: '21 min' },
    { title: 'Tiramisù', duration: '16 min' },
    { title: 'Plating', duration: '12 min' },
  ],
  level: 'All levels',
  totalDuration: '2h 04m',
  progress: { completed: 0, total: 6 },
  welcome: [],
  ctaText: 'Start',
  ctaHref: '#',
}

describe('bindCourse', () => {
  it('binds the enrolment template to the real course', () => {
    const blocks = bindCourse(blocksFor('enrolment'), course, undefined, 'enrolment')
    const cover = blocks.find((b) => b.type === 'coverHero')!
    expect(cover.props.title).toBe('Italian Home Cooking')
    expect(cover.props.instructor).toBe('Taught by Marco Rossi')
    // The cover no longer carries a description paragraph: the template leaves
    // the tagline slot empty and bindCourse doesn't back-fill it from the
    // course. The cover is just title + "Taught by …" + CTA.
    expect(cover.props.tagline).toBe('')
    expect(cover.props.img).toBe('https://cdn/hero.jpg')

    const lessons = blocks.find((b) => b.type === 'lessons')!
    expect(lessons.props.items.map((i: { title: string }) => i.title)).toEqual([
      'Fresh Pasta', 'Mother Sauces', 'Sunday Ragù', 'Risotto', 'Tiramisù', 'Plating',
    ])

    const meta = blocks.find((b) => b.type === 'meta')!
    expect(meta.props.items.map((i: { v: string }) => i.v)).toEqual(['6 lessons', '2h 04m', 'All levels'])

    const instructor = blocks.find((b) => b.type === 'instructor')!
    expect(instructor.props.name).toBe('Marco Rossi')
    expect(instructor.props.role).toBe('Head Chef')
    expect(instructor.props.bio).toBe('Bologna-trained.')

    const note = blocks.find((b) => b.type === 'note')!
    // The welcome-note headline is the course, not "Welcome to the table."
    expect(note.props.heading).toBe('Welcome to Italian Home Cooking.')
    expect(note.props.sign).toBe('Marco Rossi')
    expect(note.props.signRole).toBe('Head Chef')

    // The enrolment template no longer includes a trailer block (trailers
    // don't play in email), so there's nothing to bind here.
    expect(blocks.find((b) => b.type === 'trailer')).toBeUndefined()

    // None of the southern-cooking example copy survives anywhere.
    const json = JSON.stringify(blocks)
    expect(json).not.toContain('grandmother')
    expect(json).not.toContain('Welcome to the table')
    expect(json).not.toContain('Heritage technique')
  })

  it('shows the first lesson in the first-lesson cover byline', () => {
    const blocks = bindCourse(blocksFor('firstLesson'), course, undefined, 'firstLesson')
    const cover = blocks.find((b) => b.type === 'coverHero')!
    expect(cover.props.instructor).toBe('Fresh Pasta')
  })

  it('shows a pivotal lesson in the specific-lesson cover byline', () => {
    const blocks = bindCourse(blocksFor('specificLesson'), course, undefined, 'specificLesson')
    const cover = blocks.find((b) => b.type === 'coverHero')!
    // 6 lessons → pivotal index floor(6/3) = 2 → "Sunday Ragù"
    expect(cover.props.instructor).toBe('Sunday Ragù')
  })

  it('re-bases the halfway progress ratio onto the real lesson count', () => {
    const blocks = bindCourse(blocksFor('halfway'), course, undefined, 'halfway')
    const progress = blocks.find((b) => b.type === 'progress')!
    // template was 6/12 (50%) → 3/6 against a 6-lesson course
    expect(progress.props.total).toBe(6)
    expect(progress.props.value).toBe(3)
    // the hero byline is the real course name
    const cover = blocks.find((b) => b.type === 'coverHero')!
    expect(cover.props.instructor).toBe('Italian Home Cooking')
    // the "still to come" list is the second half of the real curriculum
    const lessons = blocks.find((b) => b.type === 'lessons')!
    expect(lessons.props.items.map((i: { title: string }) => i.title)).toEqual([
      'Risotto', 'Tiramisù', 'Plating',
    ])
  })

  it('falls back to the creator name when the course has no instructor (never the placeholder)', () => {
    const noInstructor: CourseData = {
      ...course,
      instructor: { name: '', role: '', bio: '', avatar: null },
    }
    const blocks = bindCourse(blocksFor('enrolment'), noInstructor, 'Acme Cooking School', 'enrolment')
    const cover = blocks.find((b) => b.type === 'coverHero')!
    expect(cover.props.instructor).toBe('Taught by Acme Cooking School')
    const note = blocks.find((b) => b.type === 'note')!
    expect(note.props.sign).toBe('Acme Cooking School')
    const instructor = blocks.find((b) => b.type === 'instructor')!
    expect(instructor.props.name).toBe('Acme Cooking School')
    // No template still carries the design's placeholder instructor.
    const json = JSON.stringify(blocks)
    expect(json).not.toContain('Adaeze Bello')
  })

  it('leaves blocks untouched when no course is provided', () => {
    const before = blocksFor('enrolment')
    const after = bindCourse(blocksFor('enrolment'), undefined, undefined, 'enrolment')
    expect(after[0].props.title).toBe(before[0].props.title)
  })

  it('fills empty/# CTA button hrefs with the course link', () => {
    const links = { courseUrl: 'https://learn.test/portal/courses/c1', catalogUrl: 'https://learn.test' }
    const blocks = bindCourse(blocksFor('enrolment'), course, undefined, 'enrolment', links)
    const cover = blocks.find((b) => b.type === 'coverHero')!
    expect(cover.props.btn.href).toBe('https://learn.test/portal/courses/c1')
    const cta = blocks.find((b) => b.type === 'cta')
    if (cta) expect(cta.props.btn.href).toBe('https://learn.test/portal/courses/c1')
  })

  it('points the course-complete "what next" CTA at the catalog', () => {
    const links = { courseUrl: 'https://learn.test/portal/courses/c1', catalogUrl: 'https://learn.test' }
    const blocks = bindCourse(blocksFor('courseComplete'), course, undefined, 'courseComplete', links)
    const cta = blocks.find((b) => b.type === 'cta')!
    expect(cta.props.btn.href).toBe('https://learn.test')
  })

  it('never rounds an in-progress bar to 0% or 100%', () => {
    // A 5-lesson course rebasing the first-lesson template (value 1 / total 12).
    const small: CourseData = { ...course, lessons: course.lessons.slice(0, 5), progress: { completed: 0, total: 5 } }
    const blocks = bindCourse(blocksFor('firstLesson'), small, undefined, 'firstLesson')
    const prog = blocks.find((b) => b.type === 'progress')!
    expect(prog.props.value).toBeGreaterThanOrEqual(1)
    expect(prog.props.value).toBeLessThan(prog.props.total)
  })

  it('names the exact trigger lesson on the specific-lesson email', () => {
    const blocks = bindCourse(
      blocksFor('specificLesson'), course, undefined, 'specificLesson', undefined, 'Mother Sauces',
    )
    const cover = blocks.find((b) => b.type === 'coverHero')!
    expect(cover.props.instructor).toBe('Mother Sauces')
  })

  it('turns the still-decorative footer "My courses" into a real portal link', () => {
    const blocks = bindCourse(
      blocksFor('enrolment'), course, undefined, 'enrolment', { portalUrl: 'https://learn.test/portal' },
    )
    const footer = blocks.find((b) => b.type === 'footer')!
    expect(footer.props.links).toContain('href="https://learn.test/portal"')
  })
})

describe('makeAssetResolver', () => {
  it('maps design asset keys to course media, passes real URLs through', () => {
    const r = makeAssetResolver(course)
    expect(r('assets/course-cover.jpg')).toBe('https://cdn/hero.jpg')
    expect(r('assets/course-trailer.jpg')).toBe('https://cdn/trailer.jpg')
    expect(r('https://x/y.png')).toBe('https://x/y.png')
  })
  it('falls back to a neutral placeholder when there is no course media', () => {
    const r = makeAssetResolver(undefined)
    expect(r('assets/course-cover.jpg')).toContain('data:image/svg+xml')
  })
})
