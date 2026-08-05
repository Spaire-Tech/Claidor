'use client'

import { twMerge } from 'tailwind-merge'

export interface OnboardingProgressBarProps {
  currentStep: number
  totalSteps?: number
}

export const OnboardingProgressBar = ({
  currentStep,
  totalSteps = 4,
}: OnboardingProgressBarProps) => {
  return (
    <div className="flex w-full items-center gap-1.5">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div
          key={i}
          className={twMerge(
            'h-1 flex-1 rounded-full transition-colors duration-300',
            i < currentStep
              ? 'bg-blue-500'
              : 'bg-gray-200',
          )}
        />
      ))}
    </div>
  )
}
