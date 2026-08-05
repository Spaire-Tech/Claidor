import { FormInput } from '@/components/Form/FormInput'
import { Box } from '@/components/Shared/Box'
import { Button } from '@/components/Shared/Button'
import { Text } from '@/components/Shared/Text'
import { useTheme } from '@/design-system/useTheme'
import { useCreateOrganization } from '@/hooks/polar/organizations'
import { OrganizationContext } from '@/providers/OrganizationProvider'
import { queryClient } from '@/utils/query'
import { ClientResponseError, schemas } from '@spaire/client'
import { Stack, useRouter } from 'expo-router'
import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { SafeAreaView, ScrollView, TouchableOpacity, View } from 'react-native'
import slugify from 'slugify'

const PROFILE_TYPES = [
  {
    id: 'creator',
    label: 'Digital Creator',
    description: 'Build your following and monetize your audience.',
    emoji: '🎨',
  },
  {
    id: 'business',
    label: 'Business',
    description: 'Grow my business and reach more customers.',
    emoji: '💼',
  },
  {
    id: 'personal',
    label: 'Personal',
    description: 'Share my work and connect with my audience.',
    emoji: '👤',
  },
] as const

type ProfileType = (typeof PROFILE_TYPES)[number]['id']

export default function Onboarding() {
  const theme = useTheme()
  const router = useRouter()
  const { organizations, setOrganization } = useContext(OrganizationContext)

  const [step, setStep] = useState<'profile_type' | 'setup'>('profile_type')
  const [profileType, setProfileType] = useState<ProfileType | null>(null)

  const form = useForm<schemas['OrganizationCreate']>({
    defaultValues: {
      name: '',
      slug: '',
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
  const [editedSlug, setEditedSlug] = useState(false)

  const name = watch('name')
  const slug = watch('slug')

  const isValid = useMemo(() => {
    return name.length > 2 && slug.length > 2
  }, [name, slug])

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

  const onSubmit = useCallback(
    async (data: schemas['OrganizationCreate']) => {
      clearErrors('root')
      try {
        const organization = await createOrganization.mutateAsync(data)
        setOrganization(organization)
        await queryClient.refetchQueries({ queryKey: ['organizations'] })
        router.replace('/')
      } catch (error) {
        if (error instanceof ClientResponseError) {
          const errorDetail = error.error.detail

          if (Array.isArray(errorDetail)) {
            const validationError = errorDetail[0]
            setError('root', { message: validationError.msg })
            return
          }
        }

        setError('root', {
          message:
            error instanceof Error
              ? error.message
              : 'Failed to create organization',
        })
      }
    },
    [clearErrors, createOrganization, setOrganization, router, setError],
  )

  return (
    <ScrollView
      contentContainerStyle={{
        backgroundColor: theme.colors.background,
        paddingBottom: theme.spacing['spacing-16'],
      }}
    >
      <Stack.Screen
        options={{
          header: () => null,
        }}
      />
      <SafeAreaView
        style={{
          margin: theme.spacing['spacing-16'],
          gap: theme.spacing['spacing-32'],
        }}
      >
        {step === 'profile_type' ? (
          <Box gap="spacing-16">
            <Text
              variant="display"
              style={{ paddingVertical: theme.spacing['spacing-32'] }}
            >
              Which best describes your goal?
            </Text>
            <Text color="subtext">This helps us personalize your experience.</Text>

            {PROFILE_TYPES.map((type) => (
              <TouchableOpacity
                key={type.id}
                onPress={() => setProfileType(type.id)}
                style={{
                  borderWidth: 2,
                  borderColor:
                    profileType === type.id
                      ? theme.colors.primary
                      : theme.colors.border,
                  borderRadius: 16,
                  padding: theme.spacing['spacing-16'],
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing['spacing-12'],
                  backgroundColor: theme.colors.background,
                }}
              >
                <Text style={{ fontSize: 32 }}>{type.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text variant="body">{type.label}</Text>
                  <Text color="subtext" style={{ fontSize: 13 }}>
                    {type.description}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}

            <Button
              onPress={() => profileType && setStep('setup')}
              disabled={!profileType}
            >
              Continue
            </Button>

            {organizations.length > 0 && (
              <Button onPress={() => router.replace('/')} variant="secondary">
                Back to Dashboard
              </Button>
            )}
          </Box>
        ) : (
          <Box gap="spacing-16">
            <Text
              variant="display"
              style={{ paddingVertical: theme.spacing['spacing-32'] }}
            >
              Set up your Space Card
            </Text>
            {errors.root ? (
              <Text color="error">{errors.root.message}</Text>
            ) : null}
            <FormInput
              label="Name"
              placeholder="Jane Doe"
              control={control}
              name="name"
            />
            <FormInput
              label="Username"
              placeholder="jane-doe"
              control={control}
              onFocus={() => setEditedSlug(true)}
              name="slug"
            />

            <Box gap="spacing-8">
              <Button onPress={handleSubmit(onSubmit)} disabled={!isValid}>
                Continue
              </Button>
              <Button onPress={() => setStep('profile_type')} variant="secondary">
                Back
              </Button>
            </Box>
          </Box>
        )}
      </SafeAreaView>
    </ScrollView>
  )
}
