'use client'

import AIValidationResult from '@/components/Organization/AIValidationResult'
import OrganizationProfileSettings from '@/components/Settings/OrganizationProfileSettings'
import { schemas } from '@spaire/client'
import { Check } from 'lucide-react'
import React, { useState } from 'react'
import { twMerge } from 'tailwind-merge'
import AccountStep from './Steps/AccountStep'
import IdentityStep from './Steps/IdentityStep'

type Step = 'review' | 'validation' | 'account' | 'identity' | 'complete'

type StepStatus =
  | 'pending'
  | 'current'
  | 'completed'
  | 'blocked'
  | 'in_progress'
  | 'failed'

interface StepDef {
  id: Step
  label: string
  status: StepStatus
}

interface StreamlinedAccountReviewProps {
  organization: schemas['Organization']
  currentStep: Step
  requireDetails: boolean
  organizationAccount?: schemas['Account']
  organizationReviewStatus?: schemas['OrganizationReviewStatus']
  identityVerificationStatus?: string
  isNotAdmin?: boolean
  onDetailsSubmitted: () => void
  onValidationCompleted: () => void
  onStartAccountSetup: () => void
  onStartIdentityVerification: () => void
  onSkipAccountSetup?: () => void
  onAppealApproved?: () => void
  onAppealSubmitted?: () => void
  onNavigateToStep?: (step: Step) => void
}

// ---------------------------------------------------------------------------
// Stripe-inspired numbered step progress bar
// ---------------------------------------------------------------------------

const StepProgress = ({
  steps,
  onStepClick,
}: {
  steps: StepDef[]
  onStepClick?: (id: Step) => void
}) => {
  const currentIndex = steps.findIndex(
    (s) =>
      s.status === 'current' ||
      s.status === 'in_progress' ||
      s.status === 'failed',
  )

  return (
    <div className="flex items-center">
      {steps.map((step, index) => {
        const isCompleted = step.status === 'completed'
        const isCurrent =
          step.status === 'current' ||
          step.status === 'in_progress' ||
          step.status === 'failed'
        const isFailed = step.status === 'failed'
        const isClickable = onStepClick && isCompleted

        return (
          <React.Fragment key={step.id}>
            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick(step.id)}
                className={twMerge(
                  'flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-all duration-200',
                  isCompleted &&
                    'bg-blue-500 text-white',
                  isCurrent &&
                    !isFailed &&
                    'border-2 border-blue-500 bg-blue-50 text-blue-600 ',
                  isFailed &&
                    'border-2 border-red-400 bg-red-50 text-red-500 ',
                  !isCompleted &&
                    !isCurrent &&
                    'border-2 border-gray-200 text-gray-400 ',
                  isClickable &&
                    'cursor-pointer hover:bg-blue-600 hover:text-white hover:border-blue-600',
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" strokeWidth={3} />
                ) : (
                  index + 1
                )}
              </button>
              <span
                className={twMerge(
                  'text-[11px] font-medium tracking-wide uppercase whitespace-nowrap',
                  isCompleted && 'text-blue-500',
                  isCurrent &&
                    !isFailed &&
                    'text-blue-600',
                  isFailed && 'text-red-500',
                  !isCompleted &&
                    !isCurrent &&
                    'text-gray-400',
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className={twMerge(
                  'mb-6 h-[2px] flex-1 mx-2 rounded-full transition-colors duration-300',
                  index < currentIndex
                    ? 'bg-blue-500'
                    : 'bg-gray-200',
                )}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step content card wrapper
// ---------------------------------------------------------------------------

const StepCard = ({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) => (
  <div className=" overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
    {/* Card header */}
    <div className=" border-b border-gray-100 px-8 py-6 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className=" mt-1 text-sm text-gray-500">
        {subtitle}
      </p>
    </div>
    {/* Card body */}
    <div className="px-8 py-6">{children}</div>
  </div>
)

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function StreamlinedAccountReview({
  organization,
  currentStep,
  requireDetails,
  organizationAccount,
  organizationReviewStatus,
  identityVerificationStatus,
  isNotAdmin = false,
  onDetailsSubmitted,
  onValidationCompleted,
  onStartAccountSetup,
  onStartIdentityVerification,
  onSkipAccountSetup,
  onAppealApproved,
  onAppealSubmitted,
  onNavigateToStep,
}: StreamlinedAccountReviewProps) {
  const [validationCompleted, setValidationCompleted] = useState(false)

  const handleDetailsSubmitted = () => onDetailsSubmitted()
  const handleValidationCompleted = () => {
    setValidationCompleted(true)
    onValidationCompleted()
  }
  const handleStepClick = (stepId: Step) => onNavigateToStep?.(stepId)

  // --- Completion flags ---
  const isReviewCompleted = organization.details_submitted_at !== null
  const isAIValidationPassed = organizationReviewStatus?.verdict === 'PASS'
  const isAppealApproved =
    organizationReviewStatus?.appeal_decision === 'approved'
  const isAppealSubmitted = !!organizationReviewStatus?.appeal_submitted_at
  const isValidationCompleted =
    validationCompleted || isAIValidationPassed || isAppealApproved
  const isAccountCompleted =
    (organizationAccount !== undefined &&
      organizationAccount.is_details_submitted) ||
    isNotAdmin
  const isIdentityCompleted =
    identityVerificationStatus === 'verified' ||
    identityVerificationStatus === 'pending'

  // --- Step status resolver ---
  const getStepStatus = (
    stepId: Step,
    completed: boolean,
    prerequisiteCompleted?: boolean,
  ): StepStatus => {
    if (stepId === 'account' && isNotAdmin) {
      return currentStep === 'account' ? 'blocked' : 'completed'
    }
    if (completed) return 'completed'
    if (prerequisiteCompleted !== undefined && !prerequisiteCompleted)
      return 'blocked'

    if (currentStep === stepId) {
      if (stepId === 'validation') {
        if (organizationReviewStatus?.verdict === 'PASS') return 'completed'
        if (
          organizationReviewStatus?.verdict === 'FAIL' ||
          organizationReviewStatus?.verdict === 'UNCERTAIN'
        ) {
          if (organizationReviewStatus?.appeal_decision === 'approved')
            return 'completed'
          if (organizationReviewStatus?.appeal_decision === 'rejected')
            return 'failed'
          if (organizationReviewStatus?.appeal_submitted_at)
            return 'in_progress'
          return 'failed'
        }
      }
      return 'current'
    }

    // Not current — check special states
    if (stepId === 'validation' && organizationReviewStatus) {
      if (
        organizationReviewStatus.verdict === 'PASS' ||
        organizationReviewStatus.appeal_decision === 'approved'
      )
        return 'completed'
      if (organizationReviewStatus.appeal_decision === 'rejected')
        return 'failed'
      if (organizationReviewStatus.appeal_submitted_at) return 'in_progress'
      if (
        organizationReviewStatus.verdict === 'FAIL' ||
        organizationReviewStatus.verdict === 'UNCERTAIN'
      )
        return 'failed'
    }

    return 'pending'
  }

  const steps: StepDef[] = [
    {
      id: 'review',
      label: 'Business',
      status: getStepStatus('review', isReviewCompleted),
    },
    {
      id: 'validation',
      label: 'Verify',
      status: getStepStatus(
        'validation',
        isValidationCompleted,
        isReviewCompleted,
      ),
    },
    {
      id: 'account',
      label: 'Payout',
      status: getStepStatus(
        'account',
        isAccountCompleted,
        isValidationCompleted || isAppealSubmitted,
      ),
    },
    {
      id: 'identity',
      label: 'Identity',
      status: getStepStatus(
        'identity',
        isIdentityCompleted,
        isAccountCompleted,
      ),
    },
  ]

  // Hide the onboarding flow once all steps are complete
  if (currentStep === 'complete') {
    return null
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-stretch gap-8 self-center">
      {/* Step content */}
      {currentStep === 'review' && (
        <StepCard
          title="Set up Payouts"
          subtitle={
            requireDetails
              ? 'Complete the steps below to start receiving payouts to your bank account.'
              : 'Review your submitted business details below.'
          }
        >
          {requireDetails ? (
            <OrganizationProfileSettings
              organization={organization}
              kyc={true}
              onSubmitted={handleDetailsSubmitted}
            />
          ) : (
            <div className="pointer-events-none opacity-75">
              <OrganizationProfileSettings
                organization={organization}
                kyc={true}
                onSubmitted={() => {}}
              />
            </div>
          )}
        </StepCard>
      )}

      {currentStep === 'validation' && (
        <StepCard
          title="Business Verification"
          subtitle={
            organizationReviewStatus?.verdict
              ? 'Review your verification results below.'
              : "We're verifying your SaaS business details."
          }
        >
          <AIValidationResult
            organization={organization}
            onValidationCompleted={handleValidationCompleted}
            onAppealApproved={onAppealApproved}
            onAppealSubmitted={onAppealSubmitted}
          />
        </StepCard>
      )}

      {currentStep === 'account' && (
        <StepCard
          title="Payout Account"
          subtitle="Connect your bank account to receive payouts from Spaire."
        >
          <AccountStep
            organizationAccount={organizationAccount}
            isNotAdmin={isNotAdmin}
            onStartAccountSetup={onStartAccountSetup}
            onSkipAccountSetup={onSkipAccountSetup}
          />
        </StepCard>
      )}

      {currentStep === 'identity' && (
        <StepCard
          title="Identity Verification"
          subtitle="Verify your identity to start accepting payments."
        >
          <IdentityStep
            identityVerificationStatus={identityVerificationStatus}
            onStartIdentityVerification={onStartIdentityVerification}
          />
        </StepCard>
      )}

    </div>
  )
}
