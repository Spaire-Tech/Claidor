'use client'

import LogoIcon from '../Brand/LogoIcon'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import { schemas } from '@spaire/client'
import Avatar from '@spaire/ui/components/atoms/Avatar'
import { twMerge } from 'tailwind-merge'

export interface OnboardingStep {
  id: string
  label: string
  description: string
  optional?: boolean
}

const defaultSteps: OnboardingStep[] = [
  {
    id: 'organization',
    label: 'Your Organization',
    description: 'Set up your workspace',
  },
  {
    id: 'product',
    label: 'Your First Product',
    description: 'Launch something to sell',
    optional: true,
  },
  {
    id: 'theme',
    label: 'Your Preferences',
    description: 'Customize your experience',
  },
]

export interface OnboardingStepperProps {
  currentStep: number
  steps?: OnboardingStep[]
  organization?: schemas['Organization']
  showLogo?: boolean
}

export const OnboardingStepper = ({
  currentStep,
  steps = defaultSteps,
  organization,
  showLogo = true,
}: OnboardingStepperProps) => {
  return (
    <div className=" hidden h-full w-[300px] shrink-0 flex-col justify-between border-r border-gray-100 bg-white p-10 md:flex">
      <div className="flex flex-col gap-y-16">
        {showLogo && (
          organization ? (
            <Avatar
              name={organization.name}
              avatar_url={organization.avatar_url}
              className="h-10 w-10"
            />
          ) : (
            <LogoIcon size={36} />
          )
        )}
        <div className="flex flex-col gap-y-2">
          {steps.map((step, index) => {
            const isCompleted = index < currentStep
            const isActive = index === currentStep
            const isPending = index > currentStep

            return (
              <div key={step.id} className="flex flex-row gap-x-4">
                <div className="flex flex-col items-center">
                  <div
                    className={twMerge(
                      'flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors',
                      isCompleted &&
                        'bg-blue-500 text-white',
                      isActive &&
                        ' border-2 border-blue-500 text-blue-500',
                      isPending &&
                        ' border-2 border-gray-200 text-gray-400',
                    )}
                  >
                    {isCompleted ? (
                      <CheckOutlined fontSize="small" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={twMerge(
                        'my-1.5 h-10 w-0.5',
                        isCompleted
                          ? 'bg-blue-500'
                          : ' bg-gray-200',
                      )}
                    />
                  )}
                </div>
                <div className="flex flex-col gap-y-0.5 pt-1">
                  <span className="flex flex-row items-center gap-x-2">
                    <span
                      className={twMerge(
                        'text-sm font-medium',
                        isActive
                          ? 'text-gray-900'
                          : isCompleted
                            ? 'text-gray-700'
                            : ' text-gray-400',
                      )}
                    >
                      {step.label}
                    </span>
                    {step.optional && (
                      <span className=" text-[10px] font-medium text-gray-400">
                        Optional
                      </span>
                    )}
                  </span>
                  <span className=" text-xs text-gray-400">
                    {step.description}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
