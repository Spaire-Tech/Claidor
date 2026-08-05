'use client'

import CheckOutlined from '@mui/icons-material/CheckOutlined'
import { twMerge } from 'tailwind-merge'

const STEPS = ['About you', 'Company details', 'Review & continue'] as const

interface StepIndicatorProps {
  currentStep: number
}

export default function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="flex w-full items-center justify-center gap-0">
      {STEPS.map((label, index) => {
        const stepNum = index + 1
        const isActive = stepNum === currentStep
        const isCompleted = stepNum < currentStep

        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={twMerge(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors',
                  isCompleted && 'bg-blue-500 text-white',
                  isActive &&
                    'border-2 border-blue-500 bg-blue-50 text-blue-600 ',
                  !isActive &&
                    !isCompleted &&
                    ' border-2 border-gray-300 text-gray-400',
                )}
              >
                {isCompleted ? (
                  <CheckOutlined className="h-4 w-4" fontSize="inherit" />
                ) : (
                  stepNum
                )}
              </div>
              <span
                className={twMerge(
                  'hidden text-xs font-medium md:block',
                  isActive && 'text-blue-600',
                  isCompleted && 'text-gray-500',
                  !isActive &&
                    !isCompleted &&
                    ' text-gray-400',
                )}
              >
                {label}
              </span>
            </div>

            {index < STEPS.length - 1 && (
              <div
                className={twMerge(
                  'mx-3 h-0.5 w-12 md:w-20',
                  stepNum < currentStep
                    ? 'bg-blue-500'
                    : ' bg-gray-200',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
