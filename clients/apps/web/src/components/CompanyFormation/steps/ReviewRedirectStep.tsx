'use client'

import { useCallback, useState } from 'react'
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined'
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import Button from '@spaire/ui/components/atoms/Button'
import { FadeUp } from '@/components/Animated/FadeUp'
import { US_STATE_NAMES } from '../recommendation'
import {
  DOOLA_AFFILIATE_URL,
  FORMATION_STARTED_KEY,
  STORAGE_KEY,
  type WizardFormData,
  type FormationStartedData,
} from '../types'

const DISCOUNT_CODE = 'DOOLASPAIRE10'

interface ReviewRedirectStepProps {
  data: WizardFormData
  onBack: () => void
}

export default function ReviewRedirectStep({
  data,
  onBack,
}: ReviewRedirectStepProps) {
  const [copied, setCopied] = useState(false)
  const entityLabel =
    data.entity_type === 'C_CORP' ? 'C-Corporation' : 'LLC'
  const stateLabel =
    US_STATE_NAMES[data.formation_state] ?? data.formation_state

  const handleCopy = async () => {
    await navigator.clipboard.writeText(DISCOUNT_CODE)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRedirect = useCallback(() => {
    const formationData: FormationStartedData = {
      startedAt: new Date().toISOString(),
      companyName: data.legal_name,
      entityType: data.entity_type,
      formationState: data.formation_state,
    }
    localStorage.setItem(
      FORMATION_STARTED_KEY,
      JSON.stringify(formationData),
    )
    localStorage.removeItem(STORAGE_KEY)
    window.location.href = DOOLA_AFFILIATE_URL
  }, [data])

  const summaryRows = [
    { label: 'Company name', value: data.legal_name },
    { label: 'Entity type', value: entityLabel },
    { label: 'Formation state', value: stateLabel },
    ...(data.founders.length > 0
      ? [{ label: 'Founders', value: data.founders.map((f) => f.name).join(', ') }]
      : []),
  ]

  return (
    <div className="flex w-full flex-col gap-y-10">
      {/* Company summary card */}
      <FadeUp className="flex flex-col gap-y-6">
        <div className="flex flex-col gap-y-1">
          <h2 className="text-base font-medium">Company summary</h2>
        </div>
        <div className=" flex flex-col rounded-2xl border border-gray-200 bg-white">
          {summaryRows.map((row, i) => (
            <div
              key={row.label}
              className={`flex items-center justify-between px-6 py-4 ${
                i < summaryRows.length - 1
                  ? ' border-b border-gray-100'
                  : ''
              }`}
            >
              <span className=" text-sm text-gray-500">
                {row.label}
              </span>
              <span className="text-sm font-medium">
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </FadeUp>

      {/* Discount code */}
      <FadeUp className="flex flex-col gap-y-4">
        <div className="flex flex-col gap-y-1">
          <h2 className="text-base font-medium">Your discount</h2>
          <p className=" text-sm text-gray-400">
            Apply this code at checkout for 10% off.
          </p>
        </div>
        <div className=" flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-6 py-4">
          <span className="font-mono text-lg font-semibold tracking-wider">
            {DISCOUNT_CODE}
          </span>
          <button
            onClick={handleCopy}
            className="  flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-200"
          >
            {copied ? (
              <>
                <CheckOutlined style={{ fontSize: 16 }} />
                Copied
              </>
            ) : (
              <>
                <ContentCopyOutlined style={{ fontSize: 16 }} />
                Copy
              </>
            )}
          </button>
        </div>
      </FadeUp>

      {/* Actions */}
      <FadeUp className="flex flex-col gap-y-4 pt-2">
        <Button size="lg" onClick={handleRedirect}>
          Continue to doola
          <ArrowForwardOutlined className="ml-2" style={{ fontSize: 18 }} />
        </Button>
        <p className=" text-center text-xs text-gray-400">
          You will be redirected to doola.com to complete formation and payment.
        </p>
        <Button variant="secondary" size="lg" onClick={onBack}>
          Back
        </Button>
      </FadeUp>
    </div>
  )
}
