// Shared between the public Storefront renderer and the editor canvas.
// Order matters: it determines the section order on the rendered page.

export const CATEGORY_LABELS: Record<string, string> = {
  ebook: 'eBooks',
  template: 'Templates',
  assets: 'Assets',
  course: 'Courses',
  guide: 'Guides',
  music: 'Music',
  video: 'Video',
  photo: 'Photo',
  software: 'Software',
  coaching: 'Coaching',
  membership: 'Memberships',
  other: 'Other',
}

export const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS)
