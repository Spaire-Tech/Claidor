'use client'

import AccountCreateModal from '@/components/Accounts/AccountCreateModal'
import AccountsList from '@/components/Accounts/AccountsList'
import StreamlinedAccountReview from '@/components/Finance/StreamlinedAccountReview'
import { Modal } from '@/components/Modal'
import { useModal } from '@/components/Modal/useModal'
import {
  OnboardingStep,
  OnboardingStepper,
} from '@/components/Onboarding/OnboardingStepper'
import { useAuth } from '@/hooks/auth'
import {
  useListAccounts,
  useOrganizationAccount,
} from '@/hooks/queries'
import { useOrganizationReviewStatus } from '@/hooks/queries/org'
import { useCreateIdentityVerification } from '@/hooks/queries/user'
import { api } from '@/utils/client'
import { schemas, unwrap } from '@spaire/client'
import { ShadowBoxOnMd } from '@spaire/ui/components/atoms/ShadowBox'
import { Separator } from '@spaire/ui/components/ui/separator'
import { loadStripe } from '@stripe/stripe-js'
import React, { useCallback, useState } from 'react'

const payoutSteps: OnboardingStep[] = [
  {
    id: 'review',
    label: 'Creator Review',
    description: 'Tell us about your work',
  },
  {
    id: 'validation',
    label: 'Validation',
    description: 'Review of your profile',
  },
  {
    id: 'account',
    label: 'Payout Account',
    description: 'Connect your bank account',
  },
  {
    id: 'identity',
    label: 'Identity',
    description: 'Verify your identity',
  },
]

const stepIndexMap: Record<string, number> = {
  review: 0,
  validation: 1,
  account: 2,
  identity: 3,
  complete: 4,
}

export default function ClientPage({
  organization,
}: {
  organization: schemas['Organization']
}) {
  const { currentUser, reloadUser } = useAuth()
  const { data: accounts } = useListAccounts()
  const {
    isShown: isShownSetupModal,
    show: showSetupModal,
    hide: hideSetupModal,
  } = useModal()

  const [requireDetails, setRequireDetails] = useState(
    !organization.details_submitted_at,
  )

  const { data: organizationAccount, error: accountError } =
    useOrganizationAccount(organization.id, {
      refetchInterval: (data) => {
        // Poll every 5s while Stripe is reviewing (details submitted but payouts not yet enabled)
        if (data?.stripe_id && data?.is_details_submitted && !data?.is_payouts_enabled) {
          return 5000
        }
        return false
      },
    })
  const { data: reviewStatus } = useOrganizationReviewStatus(organization.id)
  const createIdentityVerification = useCreateIdentityVerification()

  const [validationCompleted, setValidationCompleted] = useState(false)

  const isNotAdmin =
    accountError && (accountError as any)?.response?.status === 403

  type Step = 'review' | 'validation' | 'account' | 'identity' | 'complete'

  const getInitialStep = (): Step => {
    if (!organization.details_submitted_at) {
      return 'review'
    }

    // Skip validation if AI validation passed, appeal is approved, or appeal is submitted
    const aiValidationPassed = reviewStatus?.verdict === 'PASS'
    const appealApproved = reviewStatus?.appeal_decision === 'approved'
    const appealSubmitted = reviewStatus?.appeal_submitted_at
    const skipValidation =
      aiValidationPassed ||
      appealApproved ||
      appealSubmitted ||
      validationCompleted

    if (!skipValidation) {
      return 'validation'
    }

    if (
      organizationAccount === undefined ||
      !organizationAccount.stripe_id ||
      !organizationAccount.is_details_submitted ||
      !organizationAccount.is_payouts_enabled
    ) {
      return 'account'
    }

    // Check identity verification
    const identityStatus = currentUser?.identity_verification_status
    if (
      identityStatus !== 'verified' &&
      identityStatus !== 'pending'
    ) {
      return 'identity'
    }

    return 'complete'
  }

  const [step, setStep] = useState<Step>(getInitialStep())

  // Auto-advance to next step when details are submitted, appeal is approved, or appeal is submitted
  React.useEffect(() => {
    if (organization.details_submitted_at) {
      const aiValidationPassed = reviewStatus?.verdict === 'PASS'
      const appealApproved = reviewStatus?.appeal_decision === 'approved'
      const appealSubmitted = reviewStatus?.appeal_submitted_at
      const skipValidation =
        aiValidationPassed ||
        appealApproved ||
        appealSubmitted ||
        validationCompleted

      if (!skipValidation) {
        setStep('validation')
      } else if (
        organizationAccount === undefined ||
        !organizationAccount.stripe_id ||
        !organizationAccount.is_details_submitted ||
        !organizationAccount.is_payouts_enabled
      ) {
        setStep('account')
      } else {
        const identityStatus = currentUser?.identity_verification_status
        if (
          identityStatus !== 'verified' &&
          identityStatus !== 'pending'
        ) {
          setStep('identity')
        } else {
          setStep('complete')
        }
      }
    }
  }, [
    organization.details_submitted_at,
    validationCompleted,
    organizationAccount,
    reviewStatus?.appeal_decision,
    reviewStatus?.appeal_submitted_at,
    reviewStatus?.verdict,
    isNotAdmin,
    currentUser?.identity_verification_status,
  ])

  const handleDetailsSubmitted = useCallback(() => {
    setRequireDetails(false)
    setStep('validation')
  }, [])

  const handleValidationCompleted = useCallback(() => {
    setValidationCompleted(true)
    setStep('account')
  }, [])

  const handleStartAccountSetup = useCallback(async () => {
    // Check if account exists but has no stripe_id (deleted account)
    if (!organizationAccount || !organizationAccount.stripe_id) {
      showSetupModal()
    } else {
      const link = await unwrap(
        api.POST('/v1/accounts/{id}/onboarding_link', {
          params: {
            path: {
              id: organizationAccount.id,
            },
            query: {
              return_path: `/dashboard/${organization.slug}/finance/account`,
            },
          },
        }),
      )
      window.location.href = link.url
    }
  }, [organization.slug, organizationAccount, showSetupModal])

  const handleStartIdentityVerification = useCallback(async () => {
    const result = await createIdentityVerification.mutateAsync()
    if (result.error || !result.data) {
      return
    }

    const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY || '')
    if (!stripe) {
      return
    }

    const { error } = await stripe.verifyIdentity(result.data.client_secret)
    if (!error) {
      // Reload user to get updated identity_verification_status
      await reloadUser()
    }
  }, [createIdentityVerification, reloadUser])

  const handleAppealApproved = useCallback(() => {
    if (
      !organizationAccount ||
      !organizationAccount.stripe_id ||
      !organizationAccount.is_details_submitted ||
      !organizationAccount.is_payouts_enabled
    ) {
      setValidationCompleted(true)
      setStep('account')
      return
    }

    setValidationCompleted(true)
    const identityStatus = currentUser?.identity_verification_status
    if (
      identityStatus !== 'verified' &&
      identityStatus !== 'pending'
    ) {
      setStep('identity')
    } else {
      setStep('complete')
    }
  }, [organizationAccount, currentUser?.identity_verification_status])

  const handleSkipAccountSetup = useCallback(() => {
    setStep('identity')
  }, [])

  const handleAppealSubmitted = useCallback(() => {
    setStep('account')
    return
  }, [])

  const handleNavigateToStep = useCallback(
    (targetStep: Step) => {
      // Allow navigation to any step that has been completed or is accessible
      const canNavigate =
        (targetStep === 'review' && organization.details_submitted_at) ||
        (targetStep === 'validation' && reviewStatus) ||
        (targetStep === 'account' &&
          (validationCompleted ||
            reviewStatus?.verdict === 'PASS' ||
            reviewStatus?.appeal_decision === 'approved' ||
            reviewStatus?.appeal_submitted_at)) ||
        (targetStep === 'identity' &&
          organizationAccount?.is_details_submitted)

      if (canNavigate) {
        setStep(targetStep)
      }
    },
    [
      organization.details_submitted_at,
      reviewStatus,
      validationCompleted,
      organizationAccount,
      isNotAdmin,
    ],
  )

  const currentStepIndex = stepIndexMap[step] ?? 0

  return (
    <div className=" flex h-screen w-full flex-row overflow-hidden">
      {/* Left stepper panel — desktop only, hidden once setup is complete */}
      {step !== 'complete' && (
        <OnboardingStepper
          currentStep={currentStepIndex}
          steps={payoutSteps}
          showLogo={false}
        />
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        <div className="flex w-full flex-col gap-y-8 px-6 pt-16 pb-24 md:px-20">
          <StreamlinedAccountReview
            organization={organization}
            currentStep={step}
            requireDetails={requireDetails}
            organizationAccount={organizationAccount}
            organizationReviewStatus={reviewStatus}
            identityVerificationStatus={currentUser?.identity_verification_status}
            isNotAdmin={isNotAdmin}
            onDetailsSubmitted={handleDetailsSubmitted}
            onValidationCompleted={handleValidationCompleted}
            onStartAccountSetup={handleStartAccountSetup}
            onStartIdentityVerification={handleStartIdentityVerification}
            onSkipAccountSetup={handleSkipAccountSetup}
            onAppealApproved={handleAppealApproved}
            onAppealSubmitted={handleAppealSubmitted}
            onNavigateToStep={handleNavigateToStep}
          />

          {accounts?.items && accounts.items.length > 0 ? (
            <ShadowBoxOnMd>
              <div className="flex flex-row items-center justify-between">
                <div className="flex flex-col gap-y-2">
                  <h2 className="text-lg font-medium">All payout accounts</h2>
                  <p className=" text-sm text-gray-500">
                    Payout accounts you manage
                  </p>
                </div>
              </div>
              <Separator className="my-8" />
              {accounts?.items && (
                <AccountsList
                  accounts={accounts?.items}
                  pauseActions={requireDetails}
                />
              )}
            </ShadowBoxOnMd>
          ) : null}
        </div>
      </div>

      <Modal
        title="Create Payout Account"
        isShown={isShownSetupModal}
        className="min-w-[400px]"
        hide={hideSetupModal}
        modalContent={
          <AccountCreateModal
            forOrganizationId={organization.id}
            returnPath={`/dashboard/${organization.slug}/finance/account`}
          />
        }
      />
    </div>
  )
}
