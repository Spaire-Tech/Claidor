'use client'

import revalidate from '@/app/actions'
import { useAuth, useOAuthAccounts, useOnboardingTracking } from '@/hooks'
import { inferSignupMethod } from '@/hooks/onboarding'
import { usePostHog } from '@/hooks/posthog'
import { useCreateOrganization, useUpdateOrganization } from '@/hooks/queries'
import { setValidationErrors } from '@/utils/api/errors'
import { CONFIG } from '@/utils/config'
import { FormControl } from '@mui/material'
import { schemas } from '@spaire/client'
import Avatar from '@spaire/ui/components/atoms/Avatar'
import Button from '@spaire/ui/components/atoms/Button'
import Input from '@spaire/ui/components/atoms/Input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@spaire/ui/components/atoms/Select'
import {
  Form,
  FormField,
  FormItem,
  FormMessage,
} from '@spaire/ui/components/ui/form'
import { Label } from '@spaire/ui/components/ui/label'
import AddPhotoAlternateOutlined from '@mui/icons-material/AddPhotoAlternateOutlined'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import slugify from 'slugify'
import { Upload } from '../FileUpload/Upload'
import LogoIcon from '../Brand/LogoIcon'
import { CURRENCIES } from '../Settings/currencies'
import { toast } from '../Toast/use-toast'
import { getStatusRedirect } from '../Toast/utils'
import { OnboardingProgressBar } from './OnboardingProgressBar'

type PresentmentCurrency = schemas['PresentmentCurrency']

export interface OrganizationStepProps {
  slug?: string
  validationErrors?: schemas['ValidationError'][]
  error?: string
  hasExistingOrg: boolean
}

export const OrganizationStep = ({
  slug: initialSlug,
  validationErrors,
  error,
  hasExistingOrg,
}: OrganizationStepProps) => {
  const posthog = usePostHog()
  const { currentUser, setUserOrganizations } = useAuth()
  const oauthAccounts = useOAuthAccounts()
  const { startOnboarding, trackStepStarted, trackStepCompleted } =
    useOnboardingTracking()

  const form = useForm<{
    name: string
    slug: string
  }>({
    defaultValues: {
      name: initialSlug || '',
      slug: initialSlug || '',
    },
  })

  const {
    control,
    handleSubmit,
    watch,
    setError,
    clearErrors,
    setValue,
    formState: { errors },
  } = form

  const createOrganization = useCreateOrganization()
  const updateOrganization = useUpdateOrganization()
  const [editedSlug, setEditedSlug] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [currency, setCurrency] = useState<PresentmentCurrency>('usd')

  // Avatar / logo upload
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string>('')
  const logoInputRef = useRef<HTMLInputElement>(null)

  const router = useRouter()

  useEffect(() => {
    posthog.capture('dashboard:organizations:create:view')

    if (!hasExistingOrg) {
      const signupMethod = inferSignupMethod(oauthAccounts)
      startOnboarding(signupMethod)
      trackStepStarted('org')
    }
  }, [
    hasExistingOrg,
    oauthAccounts,
    posthog,
    startOnboarding,
    trackStepStarted,
  ])

  useEffect(() => {
    if (validationErrors) {
      setValidationErrors(validationErrors, setError)
    }
    if (error) {
      setError('root', { message: error })
    } else {
      clearErrors('root')
    }
  }, [validationErrors, error, setError, clearErrors])

  const name = watch('name')
  const slug = watch('slug')

  useEffect(() => {
    if (!editedSlug && name) {
      setValue('slug', slugify(name, { lower: true, strict: true }))
    } else if (slug) {
      setValue(
        'slug',
        slugify(slug, { lower: true, trim: false, strict: true }),
      )
    }
  }, [name, editedSlug, slug, setValue])

  const uploadFile = (
    organization: schemas['Organization'],
    service: schemas['FileServiceTypes'],
    file: File,
  ): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      const upload = new Upload({
        service,
        organization,
        file,
        onFileProcessing: () => {},
        onFileCreate: () => {},
        onFileUploadProgress: () => {},
        onFileUploaded: (response) => {
          resolve((response as { public_url: string }).public_url)
        },
        onFileError: (_id, err) => reject(err),
      })
      // `run()` resolves the upload through the callbacks above. If it throws
      // before any callback fires (e.g. a network error while creating the
      // file record), the promise would otherwise hang forever and block the
      // whole onboarding submit — so forward that rejection explicitly.
      upload.run().catch(reject)
    })

  const onSubmit = async (data: { name: string; slug: string }) => {
    if (submitting) return
    setSubmitting(true)

    const params = {
      name: data.name,
      slug: slug as string,
    }

    posthog.capture('dashboard:organizations:create:submit', params)

    const { data: organization, error } =
      await createOrganization.mutateAsync(params)

    if (error) {
      if (error.detail) {
        setValidationErrors(error.detail, setError)
      }
      setSubmitting(false)
      return
    }

    // Kick off the users revalidation in parallel with the avatar upload —
    // it only needs the new org to exist, not the upload to finish.
    const usersRevalidate = revalidate(
      `users:${currentUser?.id}:organizations`,
      { expire: 0 },
    ).catch(() => undefined)
    setUserOrganizations((orgs) => [...orgs, organization])

    if (!hasExistingOrg) {
      // Upload the avatar (if one was picked) now that the org exists. On
      // failure we surface a toast instead of silently dropping the photo,
      // and let the rest of onboarding proceed.
      let uploadedAvatarUrl: string | undefined
      if (logoFile) {
        try {
          uploadedAvatarUrl = await uploadFile(
            organization,
            'organization_avatar',
            logoFile,
          )
        } catch {
          toast({
            title: 'Profile picture upload failed',
            description:
              'We couldn’t upload your photo. You can add it later from Settings.',
          })
        }
      }

      await updateOrganization.mutateAsync({
        id: organization.id,
        body: {
          default_presentment_currency: currency,
          ...(uploadedAvatarUrl ? { avatar_url: uploadedAvatarUrl } : {}),
        },
        userId: currentUser?.id,
      })

      if (uploadedAvatarUrl) {
        const avatarUrl = uploadedAvatarUrl
        setUserOrganizations((orgs) =>
          orgs.map((o) =>
            o.id === organization.id ? { ...o, avatar_url: avatarUrl } : o,
          ),
        )
      }

      await Promise.all([
        usersRevalidate,
        revalidate(`organizations:${organization.id}`).catch(() => undefined),
        revalidate(`organizations:${organization.slug}`).catch(() => undefined),
      ])
    } else {
      await usersRevalidate
    }

    if (!hasExistingOrg) {
      // Don't block navigation on analytics.
      void trackStepCompleted('org', organization.id)
    }

    if (hasExistingOrg) {
      router.push(
        getStatusRedirect(
          `/dashboard/${organization.slug}`,
          'Organization created',
          'Welcome to your new workspace',
        ),
      )
    } else {
      router.push(`/dashboard/${organization.slug}/onboarding/plan`)
    }
  }

  return (
    <div className="flex h-full w-full flex-col items-center overflow-y-auto bg-white px-4 py-12">
      {/* Progress bar */}
      {!hasExistingOrg && (
        <div className="mb-12 w-full max-w-lg">
          <OnboardingProgressBar currentStep={1} totalSteps={2} />
        </div>
      )}

      <div className="flex w-full max-w-lg flex-col gap-8">
        {/* Logo — mobile only on new-user flow */}
        {!hasExistingOrg && (
          <div className="flex justify-center md:hidden">
            <LogoIcon size={32} />
          </div>
        )}

        {/* Heading */}
        <div className="flex flex-col gap-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {hasExistingOrg ? 'Add a new organization' : 'Profile basics'}
          </h1>
          <p className="text-sm text-gray-500">
            {hasExistingOrg
              ? 'Set up a new workspace for your team or project.'
              : 'Add a profile picture and name to get started.'}
          </p>
        </div>

        <Form {...form}>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-6"
          >
            {/* Profile picture + Name + Slug */}
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-5">
                {/* Avatar upload */}
                <div className="flex flex-col gap-2">
                  <Label>Profile Picture</Label>
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="relative h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-full transition-opacity hover:opacity-75"
                    >
                      <Avatar
                        avatar_url={logoPreview || ''}
                        name={name || 'You'}
                        className="h-16 w-16"
                      />
                      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/20 opacity-0 transition-opacity hover:opacity-100">
                        <AddPhotoAlternateOutlined className="text-white" fontSize="small" />
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm transition-colors hover:bg-gray-50"
                    >
                      {logoFile ? 'Change photo' : 'Upload photo'}
                    </button>
                  </div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        setLogoFile(file)
                        setLogoPreview(URL.createObjectURL(file))
                      }
                    }}
                  />
                </div>

                <FormField
                  control={control}
                  name="name"
                  rules={{ required: 'This field is required' }}
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <FormControl className="flex w-full flex-col gap-y-1.5">
                        <Label htmlFor="name">Name</Label>
                        <Input {...field} placeholder="Jane Doe" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={control}
                  name="slug"
                  rules={{ required: 'Username is required' }}
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <FormControl className="flex w-full flex-col gap-y-1.5">
                        <Label htmlFor="slug">Username</Label>
                        <div className="flex items-center overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs transition-all focus-within:z-10 focus-within:border-blue-300 focus-within:ring-[3px] focus-within:ring-blue-100">
                          <span className="select-none border-r border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-400">
                            spairehq.com/
                          </span>
                          <input
                            {...field}
                            id="slug"
                            size={Math.max(slug?.length || 1, 6)}
                            placeholder="jane-doe"
                            onFocus={() => setEditedSlug(true)}
                            className="flex-1 border-0 bg-white px-3 py-2.5 text-sm shadow-none outline-none ring-0 focus:ring-0"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Currency — only for new orgs */}
            {!hasExistingOrg && (
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3">
                  <div>
                    <Label className="text-sm font-medium">Default Currency</Label>
                    <p className="mt-0.5 text-xs text-gray-400">
                      Used for your products by default. You can change this later.
                    </p>
                  </div>
                  <Select
                    value={currency}
                    onValueChange={(v) => setCurrency(v as PresentmentCurrency)}
                  >
                    <SelectTrigger>
                      <SelectValue>
                        {(() => {
                          const c = CURRENCIES.find((c) => c.code === currency)
                          return c ? `${c.flag} ${c.code.toUpperCase()}` : currency.toUpperCase()
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.flag} {c.code.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {errors.root && (
              <p className="text-sm text-red-500">{errors.root.message}</p>
            )}

            <div className="flex flex-col gap-3 pt-2">
              <button
                type="submit"
                disabled={
                  name.length === 0 ||
                  slug.length === 0 ||
                  submitting
                }
                className="w-full rounded-full bg-blue-600 py-4 text-sm font-semibold text-white transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {submitting ? 'Creating…' : 'Continue'}
              </button>
              {hasExistingOrg ? (
                <Link href="/dashboard" className="w-full">
                  <Button variant="secondary" fullWidth size="lg">
                    Back to Dashboard
                  </Button>
                </Link>
              ) : (
                <Link
                  href={`${CONFIG.BASE_URL}/v1/auth/logout`}
                  prefetch={false}
                  className="w-full"
                >
                  <Button variant="secondary" fullWidth size="lg">
                    Sign Out
                  </Button>
                </Link>
              )}
            </div>
          </form>
        </Form>
      </div>
    </div>
  )
}
