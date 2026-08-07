import revalidate from '@/app/actions'
import { Client, schemas } from '@claidor/client'

/**
 * The creator-onboarding funnel — "choose your plan", connect payouts,
 * integrate — is inherited from the upstream payments platform. Claidor
 * sells no plans, so that gate stands in front of a step with nothing on
 * the other side of it: it can be entered but never meaningfully
 * completed, and it holds a signed-in user out of their own dashboard.
 *
 * The flow stays in the tree rather than being deleted, because the
 * billing model is not settled. It is simply off unless asked for:
 * set `CLAIDOR_CREATOR_ONBOARDING=true` to bring it back.
 */
export const creatorOnboardingEnabled = (): boolean =>
  process.env.CLAIDOR_CREATOR_ONBOARDING === 'true'

/** Used when the email local part has nothing slug-shaped left in it. */
const FALLBACK_SLUG = 'workspace'

/** Enough retries to get past a collision, few enough to fail visibly. */
const MAX_SLUG_ATTEMPTS = 5

/**
 * Email local part → a slug the API will accept.
 *
 * The server requires lowercase, at least three characters, and slug-safe
 * punctuation, so "Bxss.Fall@example.com" has to become "bxss-fall" before
 * it is worth sending.
 */
export const workspaceSlugFor = (email: string): string => {
  const local = email.split('@')[0] ?? ''
  const slug = local
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length >= 3 ? slug : FALLBACK_SLUG
}

/** A 422 naming the slug — i.e. "that one is taken", not "you are broken". */
const isSlugTaken = (error: unknown): boolean => {
  const detail = (error as { detail?: unknown } | undefined)?.detail
  if (!Array.isArray(detail)) {
    return false
  }
  return (detail as schemas['ValidationError'][]).some((item) =>
    item.loc?.includes('slug'),
  )
}

/**
 * Give a user who has no organization one, without asking.
 *
 * Everything in Claidor hangs off an organization — a dossier belongs to
 * one, and so does every document in it — so the record genuinely has to
 * exist. What does not have to exist is a form asking someone to invent a
 * name for a workspace they are the only member of. So we derive a name
 * from their email and move on; it is renameable in settings afterwards.
 *
 * Returns null when creation failed for a reason a different name would
 * not fix, so the caller can fall back to the manual form instead of
 * looping on an error that will repeat.
 */
export const provisionWorkspace = async (
  api: Client,
  user: schemas['UserRead'],
): Promise<schemas['Organization'] | null> => {
  const base = workspaceSlugFor(user.email)

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`
    const { data, error } = await api.POST('/v1/organizations/', {
      body: {
        name: slug,
        slug,
        // Server-side default; the generated schema marks it required.
        default_tax_behavior: 'location',
      },
    })

    if (data) {
      await revalidate(`organizations:${data.id}`)
      await revalidate(`organizations:${data.slug}`)
      await revalidate(`users:${user.id}:organizations`, { expire: 0 })
      return data
    }

    // A taken slug is the one failure a retry can fix — someone reached
    // that name first. Anything else (unauthenticated, API down, a
    // validation rule we are not satisfying) fails identically five times
    // over, so stop and let the caller show the real form.
    if (!isSlugTaken(error)) {
      return null
    }
  }

  return null
}
