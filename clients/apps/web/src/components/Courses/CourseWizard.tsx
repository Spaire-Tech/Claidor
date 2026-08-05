'use client'

// CourseWizard — portal-first onboarding for a Spaire Original.
//
// The old flow generated an AI sales landing page; that's gone. The portal
// (the same surface buyers and students see) IS the landing now, so the
// wizard collects presentation choices instead of generating copy:
//
//   intro → structure (Seasons/Limited Series) → instructor → details →
//   cover + pricing → trial (Free Preview / Lesson Sample) →
//   hero (Marquee/Cover) → lesson card (Spotlight/Catalog) →
//   AI outline → portal preview → create.
//
// Every choice is load-bearing:
//   • structure   → Course.format ('course' | 'series') + AI prompt branch
//   • trial       → Course.trial_mode + paywall_position + AI guidance
//   • hero        → Course.hero_variant → portal hero layout
//   • lesson card → Course.lesson_card_variant → portal tile layout
//   • pricing     → product prices + AI billing context
// All of them are passed to the outline AI as context and persisted on the
// course row at create.

import {
  useCreateCourse,
  type HeroVariant,
  type LessonCardVariant,
  type TrialMode,
} from '@/hooks/queries/courses'
import {
  useArchitectAnalysis,
  useSetArchitectFaq,
  useStartArchitectAnalysis,
  type ArchitectFailureReason,
  type ArchitectProposal,
} from '@/hooks/queries/masterclassArchitect'
import { useCreateProduct } from '@/hooks/queries/products'
import { ProductEditOrCreateForm } from '@/utils/product'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { schemas } from '@spaire/client'
import { Form } from '@spaire/ui/components/ui/form'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from '../Toast/use-toast'
import {
  ArchitectStyles,
  StepArchitectMirror,
  StepArchitectProposals,
  StepArchitectSource,
} from './CourseWizard.architect'
import { EpisodicOutlineScreen } from './CourseWizard.episodicOutline'
import { ModuleOutlineScreen } from './CourseWizard.moduleOutline'
import { CreatingScreen, GeneratingScreen } from './CourseWizard.status'
import {
  Intro,
  SpaireOnboardingStyles,
  StepCourse,
  StepInstructor,
  StepPricingWizard,
  type WizardFormat,
  type WizardPaywallState,
} from './CourseWizard.steps'
import { FreeTrialPicker, type TrialStyle } from './editor/FreeTrialPicker'
import { HeroPicker, type HeroStyle } from './editor/HeroPicker'
import {
  LessonCardPicker,
  type LessonCardStyle,
} from './editor/LessonCardPicker'
import { StructurePicker, type StructureStyle } from './editor/StructurePicker'
import {
  WizardPortalPreview,
  type WizardPortalDraft,
} from './editor/WizardPortalPreview'
import { outlineSchema } from './schemas'

type WizardStep =
  | 'intro'
  | 'source'
  | 'mirror'
  | 'proposals'
  | 'structure'
  | 'instructor'
  | 'course'
  | 'pricing'
  | 'trial'
  | 'hero'
  | 'lessonCard'
  | 'generating-outline'
  | 'outline'
  | 'portal'
  | 'creating'

type InstructorState = { name: string; bio: string }
type CourseState = {
  title: string
  desc: string
  targetAudience: string
  differentiator: string
}

type PartialLesson = {
  title?: string
  content_type?: 'text' | 'video'
  description?: string
}
type PartialModule = {
  kicker?: string
  title?: string
  description?: string
  lessons?: PartialLesson[]
}
type PartialHero = {
  eyebrow?: string
  badge?: string
  description?: string
  byline?: string
  titleLines?: string[]
}
type PartialInstructor = { sub?: string; bio?: string[] }
type PartialFaqItem = { q?: string; a?: string }
type PartialOutline = {
  arc?: string
  modules?: PartialModule[]
  hero?: PartialHero
  instructor?: PartialInstructor
  faq?: PartialFaqItem[]
}

// Masterclass Architect kill switch. The evidence path (source → mirror →
// proposals) is fully built but hidden until the product direction firms up:
// set NEXT_PUBLIC_MASTERCLASS_ARCHITECT=1 to re-enable. While off, the wizard
// runs the original manual flow (intro → structure → …) and the Architect
// screens are unreachable; the backend endpoints stay dormant and cost
// nothing unused.
const ARCHITECT_ENABLED = process.env.NEXT_PUBLIC_MASTERCLASS_ARCHITECT === '1'

// ─── Main wizard ─────────────────────────────────────────────────────────────

export default function CourseWizard({
  organization,
}: {
  organization: schemas['Organization']
}) {
  const router = useRouter()
  const createProduct = useCreateProduct(organization)
  const createCourse = useCreateCourse()

  const [screen, setScreen] = useState<WizardStep>('intro')

  // ── Masterclass Architect ─────────────────────────────────────────────────
  // 'architect' = the creator pasted their channel and rides the evidence
  // path (source → mirror → taste steps → proposals). 'manual' = the quiet
  // "I already know what I'm making" fork, which is also the warm landing
  // for every analysis failure — the original structure→details flow.
  const [path, setPath] = useState<'architect' | 'manual'>(
    ARCHITECT_ENABLED ? 'architect' : 'manual',
  )
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [sourceFailure, setSourceFailure] =
    useState<ArchitectFailureReason | null>(null)
  const [architectFaq, setArchitectFaq] = useState('')
  const [proposalIndex, setProposalIndex] = useState<number | null>(null)
  const startAnalysis = useStartArchitectAnalysis()
  const setFaqMutation = useSetArchitectFaq()
  // Polls while the engine works (2.5s), stops on completed/failed — so the
  // mirror lands mid-step and the proposals are usually waiting by the time
  // the creator finishes the taste steps.
  const { data: analysis } = useArchitectAnalysis(analysisId)

  const handleArchitectSubmit = async (ref: string) => {
    setSourceFailure(null)
    try {
      const created = await startAnalysis.mutateAsync({
        organization_id: organization.id,
        ref,
      })
      if (created.status === 'failed') {
        // Resolve failed (bad link, unknown channel …): stay on the source
        // step with a warm line — the fork is right there.
        setSourceFailure(created.failure_reason ?? 'channel_not_found')
        return
      }
      setAnalysisId(created.id)
      setProposalIndex(null)
      setScreen('mirror')
    } catch {
      // Engine unreachable (503 not configured, network): the fork carries.
      setSourceFailure('upstream_unavailable')
    }
  }

  const handleFork = () => {
    setPath('manual')
    setScreen('structure')
  }

  const handleMirrorNext = () => {
    // Fire-and-forget: the deep pass re-reads the row right before building
    // evidence, so an answer saved now makes it into the proposals.
    if (analysisId && architectFaq.trim()) {
      setFaqMutation.mutate({
        analysisId,
        faqAnswer: architectFaq.trim(),
      })
    }
    // Pre-draft the bio from the channel's own about page — shown for a
    // quick edit instead of a blank box.
    if (!instructor.bio && analysis?.channel?.about) {
      setInstructor((prev) => ({
        ...prev,
        name: prev.name || analysis.channel?.title || '',
        bio: analysis.channel?.about ?? '',
      }))
    }
    setScreen('instructor')
  }

  // ── Onboarding choices ─────────────────────────────────────────────────
  // Structure replaces the old Course/Series question. Internally it still
  // maps to the format discriminator ('course' | 'series') that drives the
  // AI prompt branch and downstream portal behavior.
  const [structure, setStructure] = useState<StructureStyle>('Seasons')
  const format: WizardFormat =
    structure === 'LimitedSeries' ? 'series' : 'course'

  const [instructor, setInstructor] = useState<InstructorState>({
    name: organization.name ?? '',
    bio: '',
  })
  const [course, setCourse] = useState<CourseState>({
    title: '',
    desc: '',
    targetAudience: '',
    differentiator: '',
  })

  // Paywall flag is synced by the pricing step (free price model → off).
  // The free-lesson count is owned by the trial step, NOT pricing.
  const [paywall, setPaywall] = useState<WizardPaywallState>({
    paywallEnabled: true,
    freePreviewLessons: 3,
  })
  const [trialStyle, setTrialStyle] = useState<TrialStyle>('Free Preview')
  const [heroStyle, setHeroStyle] = useState<HeroStyle>('Marquee')
  const [cardStyle, setCardStyle] = useState<LessonCardStyle>('Spotlight')

  // Creator edits to the AI-generated outline (title / description rewrites in
  // the outline screen) overlay the streamed object. When present they win at
  // create time. Reset whenever a fresh outline is generated.
  const [editedOutline, setEditedOutline] = useState<PartialOutline | null>(
    null,
  )

  const heroVariant: HeroVariant = heroStyle === 'Marquee' ? 'marquee' : 'cover'
  const cardVariant: LessonCardVariant =
    cardStyle === 'Spotlight' ? 'spotlight' : 'catalog'
  const trialMode: TrialMode =
    trialStyle === 'Free Preview' ? 'free_preview' : 'lesson_sample'

  // Pricing/currency/billing-cycle live exclusively on the shared form —
  // same primitives as the regular product create flow.
  const defaultCurrency = organization.default_presentment_currency ?? 'usd'
  const form = useForm<ProductEditOrCreateForm>({
    defaultValues: {
      name: '',
      description: '',
      recurring_interval: null,
      visibility: 'public',
      prices: [
        {
          amount_type: 'fixed',
          price_amount: 0,
          price_currency: defaultCurrency,
        } as schemas['ProductCreate']['prices'][number],
      ],
      medias: [],
      full_medias: [],
      organization_id: organization.id,
      metadata: [],
    },
  })

  // ── Outline streaming ─────────────────────────────────────────────────────
  const {
    object: partialOutline,
    submit: submitOutline,
    isLoading: isOutlineStreaming,
    error: outlineError,
    stop: stopOutline,
  } = useObject({
    api: `/dashboard/${organization.slug}/courses/outline`,
    schema: outlineSchema,
    onFinish: () => setScreen('outline'),
    onError: () => {
      toast({
        title: 'Outline generation failed',
        description: 'Please try again.',
      })
      setScreen(path === 'architect' ? 'proposals' : 'lessonCard')
    },
  })

  const handleClose = () => {
    stopOutline()
    // Course-only reposition: /products is hidden, so closing the wizard
    // returns to the MasterClass (courses) list rather than the catalog.
    router.push(`/dashboard/${organization.slug}/courses`)
  }

  // ── Price helpers (preview labels + AI billing context) ──────────────────
  const priceInfo = () => {
    const recurringInterval = form.getValues('recurring_interval')
    const prices = form.getValues('prices') ?? []
    const first = prices[0] as
      | {
          amount_type?: string
          price_amount?: number | null
          price_currency?: string
        }
      | undefined
    // Free means a free PRICE — the paywall toggle only controls which
    // lessons are watchable before purchase, never what checkout charges.
    const isFree = first?.amount_type === 'free'
    const currency = (first?.price_currency ?? defaultCurrency).toUpperCase()
    let priceLabel = 'Free'
    if (!isFree) {
      const cents = first?.price_amount ?? 0
      try {
        priceLabel = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency,
          minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
        }).format(cents / 100)
      } catch {
        priceLabel = `${(cents / 100).toFixed(0)} ${currency}`
      }
      if (recurringInterval) priceLabel = `${priceLabel} / ${recurringInterval}`
    }
    const billingType: 'one_time' | 'subscription' | null = isFree
      ? null
      : recurringInterval
        ? 'subscription'
        : 'one_time'
    return { priceLabel, billingType, isFree, recurringInterval }
  }

  // ── Outline submission — runs AFTER every choice is made, so the AI sees
  //    the full context: structure, trial, hero, cards, billing. In the
  //    Architect path the picked proposal rides along as the skeleton the
  //    generator must follow (overrides win over state because setState
  //    hasn't flushed when the pick triggers generation). ──────────────────
  const lastOutlinePayloadRef = useRef<Record<string, unknown> | null>(null)

  const startOutlineGeneration = (overrides?: {
    title?: string
    desc?: string
    format?: WizardFormat
    architect?: Record<string, unknown>
  }) => {
    const effectiveTitle = overrides?.title ?? course.title
    const effectiveDesc = overrides?.desc ?? course.desc
    const effectiveFormat = overrides?.format ?? format
    form.setValue('name', effectiveTitle)
    form.setValue('description', effectiveDesc)
    const { billingType, priceLabel } = priceInfo()

    // A new generation supersedes any edits made to the previous outline.
    setEditedOutline(null)
    setScreen('generating-outline')
    const payload = {
      title: effectiveTitle,
      description: effectiveDesc || '',
      targetAudience: course.targetAudience || null,
      differentiator: course.differentiator || null,
      instructorName: instructor.name || null,
      instructorBio: instructor.bio || null,
      format: effectiveFormat,
      paywallEnabled: paywall.paywallEnabled,
      trialMode: paywall.paywallEnabled ? trialMode : null,
      freePreviewLessons:
        paywall.paywallEnabled && trialMode === 'free_preview'
          ? paywall.freePreviewLessons
          : null,
      heroVariant,
      lessonCardVariant: cardVariant,
      billingType,
      priceLabel: billingType ? priceLabel : null,
      architect: overrides?.architect ?? null,
    }
    lastOutlinePayloadRef.current = payload
    submitOutline(payload)
  }

  // The picked proposal becomes the course: its title and promise fill the
  // details the manual path would have typed, its shape decides the format,
  // and the whole thing (episode list, footage statuses, receipts) seeds the
  // outline generator as a skeleton to follow.
  const handleProposalContinue = () => {
    const picked: ArchitectProposal | undefined =
      proposalIndex !== null
        ? analysis?.proposals?.proposals?.[proposalIndex]
        : undefined
    if (!picked) return
    const pickedFormat: WizardFormat =
      picked.format === 'chapters' ? 'course' : 'series'
    // Post seasons-rename StructureStyle values: an episodic proposal maps
    // to 'LimitedSeries', a chaptered one to 'Seasons'.
    setStructure(pickedFormat === 'series' ? 'LimitedSeries' : 'Seasons')
    setCourse((prev) => ({
      ...prev,
      title: picked.title,
      desc: picked.promise,
    }))
    startOutlineGeneration({
      title: picked.title,
      desc: picked.promise,
      format: pickedFormat,
      architect: {
        proposal: picked,
        channel_title: analysis?.channel?.title ?? null,
        mirror_pattern: analysis?.proposals?.mirror_pattern ?? null,
      },
    })
  }

  // ── Create ────────────────────────────────────────────────────────────────
  // Reuse the product across retries: if course creation fails after the
  // product was created, clicking Create again must not mint a second
  // (public!) product.
  const createdProductRef = useRef<schemas['Product'] | null>(null)
  const creatingRef = useRef(false)

  const finalizeCourse = async () => {
    // Prefer the creator's edited outline over the raw stream when they've
    // rewritten any AI titles/descriptions.
    const outline =
      editedOutline ?? (partialOutline as PartialOutline | undefined)
    if (!outline?.modules?.length) {
      toast({
        title: 'No outline yet',
        description: 'Generate an outline before creating.',
      })
      return
    }
    if (creatingRef.current) return
    creatingRef.current = true
    stopOutline()
    setScreen('creating')

    try {
      // The generated page ships as the empty state: the hero shows the
      // liquid-glass placeholder, NOT the product media. The course cover is
      // a deliberate choice the creator makes later in the editor, so we do
      // not auto-derive thumbnail_url from full_medias here. (The product
      // still keeps its own media via mediaIds below.)
      const thumbnailUrl = null

      const formValues = form.getValues()
      const { full_medias, metadata, ...rest } = formValues
      const mediaIds = full_medias.map((m) => m.id)

      let product = createdProductRef.current
      if (!product) {
        const productResult = await createProduct.mutateAsync({
          ...rest,
          name: course.title || 'Untitled Original',
          description: course.desc || null,
          // Tag the underlying product as a course so the public Spaire
          // Space buckets it under "Courses" and the editor's Course tab
          // can filter the catalog.
          category: 'course',
          medias: mediaIds,
          metadata: metadata.reduce<Record<string, string | number | boolean>>(
            (acc, { key, value }) => ({ ...acc, [key]: value }),
            {},
          ),
        } as schemas['ProductCreate'])
        if (productResult.error || !productResult.data) {
          throw new Error(
            `Product creation failed: ${JSON.stringify(productResult.error)}`,
          )
        }
        product = productResult.data
        createdProductRef.current = product
      }

      const outlineModules = outline.modules
      const totalLessons = outlineModules.reduce(
        (acc, m) => acc + (m?.lessons?.filter((l) => l?.title).length ?? 0),
        0,
      )
      // AI-written hero copy (eyebrow / badge / description / byline /
      // titleLines). Only persist non-empty fields so a partial generation
      // doesn't wipe a slot the renderer can fall back on.
      const h = outline.hero ?? {}
      const heroCopy =
        h.eyebrow ||
        h.description ||
        h.byline ||
        h.badge ||
        h.titleLines?.length
          ? {
              eyebrow: h.eyebrow ?? null,
              badge: h.badge ?? null,
              description: h.description ?? null,
              byline: h.byline ?? null,
              titleLines: h.titleLines ?? null,
            }
          : null
      // free_preview → first N lessons open; lesson_sample → nothing opens
      // in full (paywall sits before lesson 1, the sample clip is the only
      // taste); free course → no paywall at all.
      const paywallPosition = paywall.paywallEnabled
        ? trialMode === 'free_preview'
          ? Math.max(0, Math.min(totalLessons, paywall.freePreviewLessons))
          : 0
        : null
      // The creator's light/dark pick from the preview's theme toggle.
      let themeMode: 'light' | 'dark' = 'light'
      try {
        if (window.localStorage.getItem('spaire_theme') === 'dark')
          themeMode = 'dark'
      } catch {
        /* ignore */
      }

      const created = await createCourse.mutateAsync({
        product_id: product.id,
        organization_id: organization.id,
        title:
          course.title ||
          (format === 'series' ? 'Untitled Series' : 'Untitled Original'),
        course_type: 'evergreen',
        format,
        paywall_enabled: paywall.paywallEnabled,
        paywall_position: paywallPosition,
        hero_variant: heroVariant,
        lesson_card_variant: cardVariant,
        trial_mode: trialMode,
        ai_generated: true,
        description: course.desc || null,
        thumbnail_url: thumbnailUrl,
        instructor_name: instructor.name || null,
        instructor_bio: instructor.bio || null,
        instructor_name_italic: false,
        instructor_name_bold: true,
        instructor_name_uppercase: true,
        // Persist the AI-written hero copy so the course page renders it
        // (instead of the creator's raw description blob), plus the creator's
        // light/dark choice from the preview's theme toggle.
        landing_overrides: {
          ...(heroCopy ? { ai_hero: heroCopy } : {}),
          ...(outline.instructor?.sub || outline.instructor?.bio?.length
            ? {
                ai_instructor: {
                  sub: outline.instructor.sub ?? null,
                  bio: (outline.instructor.bio ?? []).filter(Boolean),
                  caption:
                    [instructor.name, course.title]
                      .filter(Boolean)
                      .join(' · ') || null,
                },
              }
            : {}),
          ...((outline.faq ?? []).filter((f) => f?.q && f?.a).length
            ? {
                ai_faq: (outline.faq ?? [])
                  .filter((f): f is { q: string; a: string } =>
                    Boolean(f?.q && f?.a),
                  )
                  .map((f) => ({ q: f.q, a: f.a })),
              }
            : {}),
          theme_mode: themeMode,
        },
        modules: outlineModules
          .filter((m): m is PartialModule & { title: string } =>
            Boolean(m?.title),
          )
          .map((mod, i) => ({
            title: mod.title,
            description: mod.description ?? null,
            position: i,
            lessons: (mod.lessons ?? [])
              .filter((l): l is PartialLesson & { title: string } =>
                Boolean(l?.title),
              )
              .map((lesson, j) => ({
                title: lesson.title,
                content_type: lesson.content_type ?? 'text',
                position: j,
                // The AI-written lesson/episode description — persisted so the
                // catalog cards and lesson pages show real copy, not blanks.
                description: lesson.description ?? null,
              })),
          })),
      })

      toast({
        title: 'Original Created',
        description: `"${course.title}" is ready to edit`,
      })
      router.replace(
        `/dashboard/${organization.slug}/courses/${created.id}?tab=outline`,
      )
    } catch (err) {
      console.error('[CourseWizard] create error:', err)
      toast({
        title: 'Something went wrong',
        description: 'Could not create your Original. Please try again.',
      })
      creatingRef.current = false
      // Return to the outline (not the retired landing preview) so the
      // creator can fix things and retry "Looks good — continue".
      setScreen('outline')
    }
  }

  const partialOutlineSafe = (partialOutline as PartialOutline) ?? {
    modules: [],
  }

  // Build the preview draft from live wizard state so the portal preview is
  // exactly what gets persisted.
  const buildPortalDraft = (): WizardPortalDraft => {
    const { priceLabel, billingType, isFree } = priceInfo()
    const unitCap = format === 'series' ? 'Episode' : 'Lesson'
    const unit = unitCap.toLowerCase()
    const cadence =
      billingType === 'subscription' ? 'cancel anytime' : 'one-time purchase'
    // Prefer the AI-written hero copy; fall back to the creator's inputs only
    // if a field is still streaming/empty. The hero description must NOT be the
    // raw course.desc blob — show the synthesised line, else nothing.
    const o = editedOutline ?? (partialOutline as PartialOutline | undefined)
    const aiHero = o?.hero ?? {}
    // Clamp the advertised free-preview count to the lessons that actually
    // exist, matching what finalizeCourse persists — otherwise the preview can
    // claim "5 lessons free" when the outline only has 3.
    const totalOutlineLessons = (o?.modules ?? []).reduce(
      (n, m) => n + (m?.lessons?.length ?? 0),
      0,
    )
    const freePreviewClamped = Math.max(
      0,
      Math.min(totalOutlineLessons, paywall.freePreviewLessons),
    )
    return {
      instructorSub: o?.instructor?.sub ?? '',
      instructorBioParas: (o?.instructor?.bio ?? []).filter((b): b is string =>
        Boolean(b),
      ),
      portraitCaption:
        [instructor.name, course.title].filter(Boolean).join(' · ') || '',
      faq: (o?.faq ?? [])
        .filter((f): f is { q: string; a: string } => Boolean(f?.q && f?.a))
        .map((f) => ({ q: f.q, a: f.a })),
      title: course.title,
      desc: aiHero.description ?? '',
      eyebrow: aiHero.eyebrow ?? null,
      badge: aiHero.badge ?? null,
      byline: aiHero.byline ?? null,
      titleLines: aiHero.titleLines ?? null,
      instructorName: instructor.name,
      instructorBio: aiHero.byline ?? instructor.bio,
      heroVariant,
      cardVariant,
      structure: format === 'series' ? 'episodic' : 'modules',
      trialMode,
      freeLessons: freePreviewClamped,
      paywallEnabled: paywall.paywallEnabled && !isFree,
      priceLabel,
      buyLabel: isFree
        ? 'Enroll Free'
        : billingType === 'subscription'
          ? `Subscribe — ${priceLabel}`
          : `Buy — ${priceLabel}`,
      playLabel: isFree
        ? 'Start Watching'
        : trialMode === 'free_preview'
          ? `Play ${unitCap} 1 Free`
          : 'Play Sample',
      freeLine: isFree
        ? 'Free for everyone'
        : trialMode === 'free_preview'
          ? `${freePreviewClamped} ${unit}${
              freePreviewClamped === 1 ? '' : 's'
            } free · ${cadence}`
          : `Sample clip free · ${cadence}`,
      // No hero cover by default — the generated page is the empty state
      // (glass placeholder). A real cover is added later in the editor.
      heroImageUrl: null,
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => e.preventDefault()}
        className="spaire-onboarding"
        style={{ minHeight: '100vh' }}
      >
        <SpaireOnboardingStyles />
        <ArchitectStyles />
        <div className="spaire-shell">
          {screen === 'intro' && (
            <Intro
              onNext={() =>
                setScreen(ARCHITECT_ENABLED ? 'source' : 'structure')
              }
              onClose={handleClose}
            />
          )}
          {screen === 'source' && (
            <StepArchitectSource
              onSubmit={handleArchitectSubmit}
              submitting={startAnalysis.isPending}
              failureReason={sourceFailure}
              onFork={handleFork}
              onBack={() => setScreen('intro')}
              onClose={handleClose}
            />
          )}
          {screen === 'mirror' && (
            <StepArchitectMirror
              analysis={analysis ?? null}
              faq={architectFaq}
              onFaqChange={setArchitectFaq}
              onNext={handleMirrorNext}
              onBack={() => setScreen('source')}
              onClose={handleClose}
              onFork={handleFork}
            />
          )}
          {screen === 'proposals' && (
            <StepArchitectProposals
              analysis={analysis ?? null}
              selectedIndex={proposalIndex}
              onSelect={setProposalIndex}
              onContinue={handleProposalContinue}
              onBack={() => setScreen('lessonCard')}
              onClose={handleClose}
              onFork={handleFork}
            />
          )}
          {screen === 'structure' && (
            <StructurePicker
              value={structure}
              onChange={setStructure}
              onContinue={() => setScreen('instructor')}
              onBack={() => setScreen(ARCHITECT_ENABLED ? 'source' : 'intro')}
            />
          )}
          {screen === 'instructor' && (
            <StepInstructor
              data={instructor}
              onChange={setInstructor}
              onNext={() =>
                setScreen(path === 'architect' ? 'pricing' : 'course')
              }
              onBack={() =>
                setScreen(path === 'architect' ? 'mirror' : 'structure')
              }
              onClose={handleClose}
              format={format}
            />
          )}
          {screen === 'course' && (
            <StepCourse
              data={course}
              onChange={setCourse}
              onNext={() => setScreen('pricing')}
              onBack={() => setScreen('instructor')}
              onClose={handleClose}
              format={format}
            />
          )}
          {screen === 'pricing' && (
            <StepPricingWizard
              organization={organization}
              paywall={paywall}
              onPaywallChange={setPaywall}
              // Free-preview lives in the trial step now, not pricing.
              hideAccessSection
              nextLabel="Continue"
              onNext={() =>
                setScreen(paywall.paywallEnabled ? 'trial' : 'hero')
              }
              onBack={() =>
                setScreen(path === 'architect' ? 'instructor' : 'course')
              }
              onClose={handleClose}
              courseTitle={course.title || analysis?.channel?.title || ''}
              courseDesc={course.desc}
              courseLessons={12}
              format={format}
            />
          )}
          {screen === 'trial' && (
            <FreeTrialPicker
              value={trialStyle}
              onChange={setTrialStyle}
              freeCount={paywall.freePreviewLessons}
              onFreeCountChange={(n) =>
                setPaywall((p) => ({ ...p, freePreviewLessons: n }))
              }
              onContinue={() => setScreen('hero')}
              onBack={() => setScreen('pricing')}
            />
          )}
          {screen === 'hero' && (
            <HeroPicker
              value={heroStyle}
              onChange={setHeroStyle}
              onContinue={() => setScreen('lessonCard')}
              onBack={() =>
                setScreen(paywall.paywallEnabled ? 'trial' : 'pricing')
              }
            />
          )}
          {screen === 'lessonCard' && (
            <LessonCardPicker
              value={cardStyle}
              onChange={setCardStyle}
              // Architect path: the taste steps were filling the deep-pass
              // wait — the proposals are (usually) ready and waiting now.
              onContinue={() =>
                path === 'architect'
                  ? setScreen('proposals')
                  : startOutlineGeneration()
              }
              onBack={() => setScreen('hero')}
            />
          )}
          {screen === 'generating-outline' && (
            <GeneratingScreen onClose={handleClose} format={format} />
          )}
          {screen === 'outline' &&
            (() => {
              const outlineErrorMsg = outlineError
                ? 'Failed to generate outline. Tap Regenerate to try again.'
                : !isOutlineStreaming &&
                    (partialOutlineSafe.modules?.length ?? 0) === 0
                  ? 'The generator came back empty this time. Tap Regenerate to try again.'
                  : null
              const onRegenerate = () => {
                stopOutline()
                // Re-run with the exact payload of the last generation so an
                // Architect-seeded outline regenerates with its proposal
                // skeleton intact (state-derived rebuild would lose it).
                const last = lastOutlinePayloadRef.current
                if (last) {
                  setEditedOutline(null)
                  setScreen('generating-outline')
                  submitOutline(last)
                } else {
                  startOutlineGeneration()
                }
              }
              // Seasons → timeline outline; limited series → episode grid in
              // the card style chosen at the lesson-card step.
              return format === 'course' ? (
                <ModuleOutlineScreen
                  title={course.title}
                  partialOutline={partialOutlineSafe}
                  isStreaming={isOutlineStreaming}
                  error={outlineErrorMsg}
                  onRegenerate={onRegenerate}
                  onOutlineChange={setEditedOutline}
                  // "Looks good — continue" creates the course and drops the
                  // creator straight into the editor (no landing preview step).
                  onCreate={finalizeCourse}
                  onClose={handleClose}
                />
              ) : (
                <EpisodicOutlineScreen
                  title={course.title}
                  partialOutline={partialOutlineSafe}
                  isStreaming={isOutlineStreaming}
                  error={outlineErrorMsg}
                  cardVariant={cardVariant}
                  onRegenerate={onRegenerate}
                  onOutlineChange={setEditedOutline}
                  // "Looks good — continue" creates the course and drops the
                  // creator straight into the editor (no landing preview step).
                  onCreate={finalizeCourse}
                  onClose={handleClose}
                />
              )
            })()}
          {screen === 'portal' && (
            <WizardPortalPreview
              organization={organization}
              draft={buildPortalDraft()}
              outline={partialOutlineSafe}
              onBack={() => setScreen('outline')}
              onPublish={finalizeCourse}
              publishing={false}
            />
          )}
          {screen === 'creating' && <CreatingScreen onClose={handleClose} />}
        </div>
      </form>
    </Form>
  )
}
