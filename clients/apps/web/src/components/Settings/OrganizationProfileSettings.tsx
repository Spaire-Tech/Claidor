import { useAuth } from '@/hooks'
import { useUpdateOrganization } from '@/hooks/queries'
import { useAutoSave } from '@/hooks/useAutoSave'
import { useURLValidation } from '@/hooks/useURLValidation'
import { setValidationErrors } from '@/utils/api/errors'
import AddOutlined from '@mui/icons-material/AddOutlined'
import AddPhotoAlternateOutlined from '@mui/icons-material/AddPhotoAlternateOutlined'
import CloseOutlined from '@mui/icons-material/CloseOutlined'
import Facebook from '@mui/icons-material/Facebook'
import GitHub from '@mui/icons-material/GitHub'
import Instagram from '@mui/icons-material/Instagram'
import LinkedIn from '@mui/icons-material/LinkedIn'
import Public from '@mui/icons-material/Public'
import X from '@mui/icons-material/X'
import YouTube from '@mui/icons-material/YouTube'
import { isValidationError, schemas } from '@spaire/client'
import Avatar from '@spaire/ui/components/atoms/Avatar'
import Button from '@spaire/ui/components/atoms/Button'
import CopyToClipboardInput from '@spaire/ui/components/atoms/CopyToClipboardInput'
import Input from '@spaire/ui/components/atoms/Input'
import TextArea from '@spaire/ui/components/atoms/TextArea'
import {
  Form,
  FormControl,
  FormField,
  FormMessage,
} from '@spaire/ui/components/ui/form'
import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import React, { useCallback } from 'react'
import { FileRejection } from 'react-dropzone'
import { useForm, useFormContext } from 'react-hook-form'
import { twMerge } from 'tailwind-merge'
import { FileObject, useFileUpload } from '../FileUpload'
import { toast } from '../Toast/use-toast'
import ConfirmationButton from '../ui/ConfirmationButton'
import {
  SettingsGroup,
  SettingsGroupActions,
  SettingsGroupItem,
} from './SettingsGroup'

// Hide the raw internal account/org ID from the creator-facing profile.
// Set to true to surface it again (e.g. for support/debugging).
const SHOW_INTERNAL_ID = false

interface OrganizationDetailsFormProps {
  organization: schemas['Organization']
  inKYCMode: boolean
}

const SOCIAL_PLATFORM_DOMAINS = {
  'x.com': 'x',
  'twitter.com': 'x',
  'instagram.com': 'instagram',
  'facebook.com': 'facebook',
  'youtube.com': 'youtube',
  'linkedin.com': 'linkedin',
  'youtu.be': 'youtube',
  'github.com': 'github',
}

interface OrganizationSocialLinksProps {
  required?: boolean
}

const OrganizationSocialLinks = ({
  required,
}: OrganizationSocialLinksProps) => {
  const { watch, setValue, formState } =
    useFormContext<schemas['OrganizationUpdate']>()
  const socials = watch('socials') || []

  const hasValidSocial = socials.some(
    (social) => social.url && social.url.trim() !== '',
  )
  const showError = required && formState.isSubmitted && !hasValidSocial

  const getIcon = (platform: string, className: string) => {
    switch (platform) {
      case 'x':
        return <X className={className} />
      case 'instagram':
        return <Instagram className={className} />
      case 'facebook':
        return <Facebook className={className} />
      case 'github':
        return <GitHub className={className} />
      case 'youtube':
        return <YouTube className={className} />
      case 'linkedin':
        return <LinkedIn className={className} />
      default:
        return <Public className={className} />
    }
  }

  const handleAddSocial = () => {
    setValue('socials', [...socials, { platform: 'other', url: '' }], {
      shouldDirty: true,
    })
  }

  const handleRemoveSocial = (index: number) => {
    setValue(
      'socials',
      socials.filter((_, i) => i !== index),
      { shouldDirty: true },
    )
  }

  const handleChange = (index: number, value: string) => {
    if (value.startsWith('http://')) {
      value = value.replace('http://', 'https://')
    }
    const hasProtocol = value.startsWith('https://')
    const isTypingProtocol =
      'https://'.startsWith(value) || 'http://'.startsWith(value)
    if (!hasProtocol && !isTypingProtocol) {
      value = 'https://' + value
    }

    // Infer the platform from the URL
    let newPlatform: schemas['OrganizationSocialPlatforms'] = 'other'
    try {
      const url = new URL(value)
      const hostname = url.hostname as keyof typeof SOCIAL_PLATFORM_DOMAINS
      newPlatform = (SOCIAL_PLATFORM_DOMAINS[hostname] ??
        'other') as schemas['OrganizationSocialPlatforms']
    } catch {}

    // Update the socials array
    const updatedSocials = [...socials]
    updatedSocials[index] = { platform: newPlatform, url: value }
    setValue('socials', updatedSocials, { shouldDirty: true })
  }

  return (
    <div className="space-y-3">
      {socials.map((social, index) => (
        <div key={index} className="flex items-center gap-3">
          <div className="flex w-5 justify-center">
            {getIcon(social.platform, 'text-gray-400 h-4 w-4')}
          </div>
          <Input
            value={social.url || ''}
            onChange={(e) => handleChange(index, e.target.value)}
            placeholder="https://"
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleRemoveSocial(index)}
            className="text-gray-400 hover:text-gray-600"
          >
            <CloseOutlined fontSize="small" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={handleAddSocial}
      >
        <AddOutlined fontSize="small" className="mr-1" />
        Add Social
      </Button>
      {showError && (
        <p className="text-destructive text-sm font-medium">
          At least one social media link is required
        </p>
      )}
    </div>
  )
}

const CompactTextArea = ({
  field,
  placeholder,
  rows = 3,
}: {
  field: any
  placeholder: string
  rows?: number
}) => (
  <TextArea
    {...field}
    rows={rows}
    placeholder={placeholder}
    className="resize-none"
  />
)

export const OrganizationDetailsForm: React.FC<
  OrganizationDetailsFormProps
> = ({ organization, inKYCMode }) => {
  const { control, watch, setError, setValue } =
    useFormContext<schemas['OrganizationUpdate']>()
  const name = watch('name')
  const avatarURL = watch('avatar_url')
  const { status: urlStatus, validateURL } = useURLValidation({
    organizationSlug: organization.slug,
  })

  const onFilesUpdated = useCallback(
    (files: FileObject<schemas['OrganizationAvatarFileRead']>[]) => {
      if (files.length === 0) {
        return
      }
      const lastFile = files[files.length - 1]
      setValue('avatar_url', lastFile.public_url, { shouldDirty: true })
    },
    [setValue],
  )
  const onFilesRejected = useCallback(
    (rejections: FileRejection[]) => {
      rejections.forEach((rejection) => {
        setError('avatar_url', { message: rejection.errors[0].message })
      })
    },
    [setError],
  )
  const { getRootProps, getInputProps, isDragActive } = useFileUpload({
    organization: organization,
    service: 'organization_avatar',
    accept: {
      'image/jpeg': [],
      'image/png': [],
      'image/gif': [],
      'image/webp': [],
      'image/svg+xml': [],
    },
    maxSize: 1 * 1024 * 1024,
    onFilesUpdated,
    onFilesRejected,
    onFileError: (_, error) => {
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload image. Please try again.',
      })
    },
    initialFiles: [],
  })

  return (
    <div className="space-y-8">
      {/* Basic Info - Always Visible */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-12">
          <div className="sm:col-span-2">
            <label className="mb-2 block text-sm font-medium">Logo</label>
            <FormField
              control={control}
              name="avatar_url"
              render={() => (
                <div>
                  <div
                    {...getRootProps()}
                    className={twMerge(
                      'relative cursor-pointer',
                      isDragActive && 'opacity-50',
                    )}
                  >
                    <input {...getInputProps()} />
                    <Avatar
                      avatar_url={avatarURL ?? ''}
                      name={name ?? ''}
                      className="h-16 w-16 transition-opacity hover:opacity-75"
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity hover:opacity-100">
                      <AddPhotoAlternateOutlined className="text-gray-600" />
                    </div>
                  </div>
                  <FormMessage className="mt-2 text-xs/snug" />
                </div>
              )}
            />
          </div>

          <div className="space-y-4 sm:col-span-10">
            <div>
              <label className="mb-2 block text-sm font-medium">
                Name *
              </label>
              <FormField
                control={control}
                name="name"
                rules={{ required: 'Name is required' }}
                render={({ field }) => (
                  <div>
                    <Input
                      {...field}
                      value={field.value || ''}
                      placeholder="Acme Inc"
                    />
                    <FormMessage />
                  </div>
                )}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Support Email *
              </label>
              <FormField
                control={control}
                name="email"
                rules={{ required: 'Support email is required' }}
                render={({ field }) => (
                  <div>
                    <Input
                      type="email"
                      {...field}
                      value={field.value || ''}
                      placeholder="support@acme.com"
                    />
                    <FormMessage />
                  </div>
                )}
              />
            </div>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Website</label>
          <FormField
            control={control}
            name="website"
            rules={{
              validate: (value) => {
                if (!value) return true
                if (!value.startsWith('https://')) {
                  return 'Website must start with https://'
                }
                try {
                  new URL(value)
                  return true
                } catch {
                  return 'Please enter a valid URL'
                }
              },
            }}
            render={({ field }) => (
              <div>
                <Input
                  type="url"
                  {...field}
                  value={field.value || ''}
                  placeholder="https://acme.com"
                  onChange={(e) => {
                    let value = e.target.value
                    if (value.startsWith('http://')) {
                      value = value.replace('http://', 'https://')
                    }
                    const hasProtocol = value.startsWith('https://')
                    const isTypingProtocol =
                      'https://'.startsWith(value) ||
                      'http://'.startsWith(value)
                    if (!hasProtocol && !isTypingProtocol) {
                      value = 'https://' + value
                    }
                    field.onChange(value)
                  }}
                  onBlur={(e) => {
                    field.onBlur()
                    validateURL(e.target.value)
                  }}
                  postSlot={
                    urlStatus === 'validating' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    ) : urlStatus === 'valid' ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : urlStatus === 'invalid' ? (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    ) : null
                  }
                />
                <FormMessage />
                {urlStatus === 'invalid' && (
                  <p className="mt-1 text-xs text-amber-600">
                    Website appears to be unreachable
                  </p>
                )}
              </div>
            )}
          />
        </div>

        {/* Social Links - Progressive Disclosure */}
        <div>
          <div className="mb-4 flex flex-col items-start">
            <label className="block text-sm font-medium">
              Social Media {inKYCMode && '*'}
            </label>
            <p className="mt-2 text-xs text-gray-600">
              Used to verify your identity. Never shown publicly.
            </p>
          </div>
          <OrganizationSocialLinks required={inKYCMode} />
        </div>
      </div>

      {/* Business Details - KYC Mode Only */}
      {inKYCMode && (
        <div className="border-t pt-8">
          <div className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-medium">
                Describe your masterclass *
              </label>
              <FormField
                control={control}
                name="details.product_description"
                rules={{
                  required: 'Please describe your masterclass',
                  minLength: {
                    value: 20,
                    message: 'Please provide at least 20 characters',
                  },
                  maxLength: {
                    value: 3000,
                    message: 'Please keep under 3000 characters',
                  },
                }}
                render={({ field }) => (
                  <div>
                    <CompactTextArea
                      field={field}
                      placeholder="An online course teaching beginners how to shoot and edit cinematic travel videos."
                    />
                    <div className="mt-1 flex items-center justify-between">
                      <FormMessage />
                      <span className="text-xs text-gray-500">
                        {field.value?.length || 0}/3000 characters
                      </span>
                    </div>
                  </div>
                )}
              />
            </div>

          </div>
        </div>
      )}
    </div>
  )
}

interface OrganizationProfileSettingsProps {
  organization: schemas['Organization']
  kyc?: boolean
  onSubmitted?: () => void
}

const OrganizationProfileSettings: React.FC<
  OrganizationProfileSettingsProps
> = ({ organization, kyc, onSubmitted }) => {
  const router = useRouter()
  const form = useForm<schemas['OrganizationUpdate']>({
    defaultValues: organization,
  })
  const { handleSubmit, setError, formState, reset } = form
  const inKYCMode = kyc === true

  const { currentUser } = useAuth()

  const updateOrganization = useUpdateOrganization()

  const onSave = async (body: schemas['OrganizationUpdate']) => {
    const emptySocials =
      body.socials?.filter(
        (social) => !social.url || social.url.trim() === '',
      ) || []
    const cleanedBody = {
      ...body,
      website: body.website?.trim() ? body.website : null,
      socials: body.socials?.filter(
        (social) => social.url && social.url.trim() !== '',
      ),
    }

    const { data, error, response } = await updateOrganization.mutateAsync({
      id: organization.id,
      body: cleanedBody,
      userId: currentUser?.id,
    })

    if (error) {
      if (response.status === 401) {
        toast({
          title: 'Session Expired',
          description: 'Your session has expired. Please refresh the page and try again.',
        })
        return
      }

      const errorMessage = Array.isArray(error.detail)
        ? error.detail[0]?.msg ||
          'An error occurred while updating the organization'
        : typeof error.detail === 'string'
          ? error.detail
          : 'An error occurred while updating the organization'

      if (isValidationError(error.detail)) {
        setValidationErrors(error.detail, setError)
      } else {
        setError('root', { message: errorMessage })
      }

      toast({
        title: 'Organization Update Failed',
        description: errorMessage,
      })

      return
    }

    reset({
      ...data,
      socials: [...(data.socials || []), ...emptySocials],
    })

    // Refresh the router to get the updated organization data from the server
    router.refresh()

    if (onSubmitted) {
      onSubmitted()
    }
  }

  const handleFormSubmit = () => {
    handleSubmit(onSave)()
  }

  useAutoSave({
    form,
    onSave,
    delay: 1000,
    enabled: !inKYCMode,
  })

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
        }}
        className="max-w-2xl"
      >
        <SettingsGroup>
          {!inKYCMode && (
            <>
              {/*
                Raw internal account ID hidden from the creator-facing UI.
                Reversible: flip SHOW_INTERNAL_ID to true to restore. The
                value (organization.id) is unchanged.
              */}
              {SHOW_INTERNAL_ID && (
                <SettingsGroupItem
                  title="Identifier"
                  description="Unique identifier for your account"
                >
                  <FormControl>
                    <CopyToClipboardInput
                      value={organization.id}
                      onCopy={() => {
                        toast({
                          title: 'Copied To Clipboard',
                          description: `Account ID was copied to clipboard`,
                        })
                      }}
                    />
                  </FormControl>
                </SettingsGroupItem>
              )}
              <SettingsGroupItem
                title="Your Page URL"
                description="Used for your customer portal, transaction statements, etc."
              >
                <FormControl>
                  <CopyToClipboardInput
                    value={organization.slug}
                    onCopy={() => {
                      toast({
                        title: 'Copied To Clipboard',
                        description: `Your page URL was copied to clipboard`,
                      })
                    }}
                  />
                </FormControl>
              </SettingsGroupItem>
            </>
          )}
          <div className="flex flex-col gap-y-4 p-4">
            <OrganizationDetailsForm
              organization={organization}
              inKYCMode={inKYCMode}
            />
          </div>

          {inKYCMode && (
            <SettingsGroupActions>
              <ConfirmationButton
                onConfirm={handleFormSubmit}
                warningMessage="This information cannot be changed once submitted. Are you sure?"
                buttonText="Submit for Review"
                size="default"
                confirmText="Submit"
                disabled={!formState.isDirty}
                loading={updateOrganization.isPending}
                requireConfirmation={true}
              />
            </SettingsGroupActions>
          )}
        </SettingsGroup>
      </form>
    </Form>
  )
}

export default OrganizationProfileSettings
