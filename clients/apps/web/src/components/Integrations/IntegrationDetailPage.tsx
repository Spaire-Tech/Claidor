'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import { OrganizationContext } from '@/providers/maintainerOrganization'
import Button from '@spaire/ui/components/atoms/Button'
import Link from 'next/link'
import { useCallback, useContext, useState } from 'react'
import { motion } from 'framer-motion'
import { twMerge } from 'tailwind-merge'
import { FadeUp } from '../Animated/FadeUp'
import type { PromptIntegration } from './integrations'

interface IntegrationDetailPageProps {
  integration: PromptIntegration
  icon: React.ReactNode
}

export default function IntegrationDetailPage({
  integration,
  icon,
}: IntegrationDetailPageProps) {
  const [promptCopied, setPromptCopied] = useState(false)
  const { organization } = useContext(OrganizationContext)

  const handleCopyPrompt = useCallback(() => {
    navigator.clipboard.writeText(integration.prompt)
    setPromptCopied(true)
    setTimeout(() => setPromptCopied(false), 2500)
  }, [integration.prompt])

  return (
    <DashboardBody title={null}>
      <div className="flex w-full flex-col items-center pb-16">
        <motion.div
          initial="hidden"
          animate="visible"
          transition={{ duration: 1, staggerChildren: 0.2 }}
          className="flex w-full max-w-2xl flex-col gap-16"
        >
          {/* Back link */}
          <FadeUp className="flex flex-row justify-start">
            <Link
              href={`/dashboard/${organization.slug}/integrations`}
              className="flex cursor-pointer items-center gap-x-1.5 rounded-full px-3 py-1.5 text-sm text-blue-500 transition-colors duration-100 hover:bg-blue-50 hover:text-blue-600  "
            >
              <ArrowBackOutlined sx={{ fontSize: 16 }} />
              All Integrations
            </Link>
          </FadeUp>

          {/* Header */}
          <FadeUp className="flex flex-col gap-y-4">
            <div className="flex items-center gap-x-3">
              {icon}
              <span className=" rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                {integration.categoryLabel}
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-medium tracking-tight md:text-3xl">
              {integration.tagline}
            </h1>
            <p className=" max-w-lg text-base leading-relaxed text-gray-500">
              {integration.description}
            </p>
          </FadeUp>

          {/* How it works */}
          <FadeUp className="flex flex-col gap-y-5">
            <h2 className="text-sm font-medium uppercase tracking-wider text-gray-400">
              How it works
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {integration.howItWorks.map((step, i) => (
                <HowItWorksCard
                  key={i}
                  number={i + 1}
                  title={step.title}
                  description={step.description}
                />
              ))}
            </div>
          </FadeUp>

          {/* Prompt Card */}
          <FadeUp className="flex flex-col gap-y-4">
            <div className="flex flex-row items-center justify-between">
              <h2 className="text-base font-medium">
                {integration.name} prompt
              </h2>
              <button
                onClick={handleCopyPrompt}
                className={twMerge(
                  'flex items-center gap-x-1.5 rounded-full px-4 py-2 text-xs font-medium transition-all',
                  promptCopied
                    ? 'bg-emerald-50 text-emerald-600 '
                    : '  bg-gray-100 text-gray-600 hover:bg-gray-200',
                )}
              >
                {promptCopied ? (
                  <>
                    <CheckOutlined sx={{ fontSize: 14 }} />
                    Copied
                  </>
                ) : (
                  <>
                    <ContentCopyOutlined sx={{ fontSize: 14 }} />
                    Copy Prompt
                  </>
                )}
              </button>
            </div>
            <div className=" relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-950">
              <div className=" flex flex-row items-center gap-x-2 border-b border-gray-800 bg-gray-900 px-5 py-3">
                <div className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-green-400/60" />
                <span className="ml-2 text-[11px] text-gray-500">
                  {integration.promptFileName}
                </span>
              </div>
              <div className="max-h-[400px] overflow-y-auto p-6">
                <pre className="whitespace-pre-wrap font-mono text-[13px] leading-[1.8] text-gray-300">
                  {integration.prompt}
                </pre>
              </div>
            </div>
            <p className=" text-xs leading-relaxed text-gray-400">
              {integration.footerNote}
            </p>
          </FadeUp>

          {/* Actions */}
          <FadeUp className="flex flex-col gap-y-3 pt-2">
            <Button size="lg" fullWidth onClick={handleCopyPrompt}>
              {promptCopied ? 'Copied!' : 'Copy Prompt to Clipboard'}
            </Button>
            <div className="flex flex-row items-center justify-center pt-1">
              <Link
                href={`/dashboard/${organization.slug}/integrations`}
                className="cursor-pointer rounded-full px-3 py-1.5 text-sm text-blue-500 transition-colors duration-100 hover:bg-blue-50 hover:text-blue-600  "
              >
                Back to all integrations
              </Link>
            </div>
          </FadeUp>
        </motion.div>
      </div>
    </DashboardBody>
  )
}

const HowItWorksCard = ({
  number,
  title,
  description,
}: {
  number: number
  title: string
  description: string
}) => (
  <div className=" flex flex-col gap-y-3 rounded-2xl border border-gray-200 bg-white p-5">
    <span className=" flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
      {number}
    </span>
    <div className="flex flex-col gap-y-1">
      <span className="text-sm font-medium">{title}</span>
      <span className=" text-xs leading-relaxed text-gray-400">
        {description}
      </span>
    </div>
  </div>
)
