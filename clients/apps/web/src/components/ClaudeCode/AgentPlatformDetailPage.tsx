'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import ArrowOutwardOutlined from '@mui/icons-material/ArrowOutwardOutlined'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import { OrganizationContext } from '@/providers/maintainerOrganization'
import Button from '@spaire/ui/components/atoms/Button'
import Link from 'next/link'
import { useCallback, useContext, useState } from 'react'
import { motion } from 'framer-motion'
import { twMerge } from 'tailwind-merge'
import { FadeUp } from '../Animated/FadeUp'
import ClaudeCodeIcon from '../Icons/frameworks/claude-code'
import CursorIcon from '../Icons/frameworks/cursor'
import CodexIcon from '../Icons/frameworks/codex'
import GitHubCopilotIcon from '../Icons/frameworks/github-copilot'
import {
  SyntaxHighlighterClient,
  SyntaxHighlighterProvider,
} from '../SyntaxHighlighterShiki/SyntaxHighlighterClient'
import type { AgentPlatform } from './agentPlatforms'

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  'claude-code': <ClaudeCodeIcon size={40} />,
  cursor: <CursorIcon size={40} />,
  codex: <CodexIcon size={40} />,
  'github-copilot': <GitHubCopilotIcon size={40} />,
}

interface AgentPlatformDetailPageProps {
  platform: AgentPlatform
}

export default function AgentPlatformDetailPage({
  platform,
}: AgentPlatformDetailPageProps) {
  const { organization } = useContext(OrganizationContext)
  const [installCopied, setInstallCopied] = useState(false)
  const [setupCopied, setSetupCopied] = useState(false)
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)

  const handleCopyInstall = useCallback(() => {
    if (!platform.installCommand) return
    navigator.clipboard.writeText(platform.installCommand)
    setInstallCopied(true)
    setTimeout(() => setInstallCopied(false), 2500)
  }, [platform.installCommand])

  const handleCopySetup = useCallback(() => {
    if (!platform.setupSnippet) return
    navigator.clipboard.writeText(platform.setupSnippet)
    setSetupCopied(true)
    setTimeout(() => setSetupCopied(false), 2500)
  }, [platform.setupSnippet])

  const handleCopyCommand = useCallback(
    (slug: string, snippet: string) => {
      navigator.clipboard.writeText(snippet)
      setCopiedCommand(slug)
      setTimeout(() => setCopiedCommand(null), 2500)
    },
    [],
  )

  const icon = PLATFORM_ICONS[platform.slug]

  let stepIndex = 1

  return (
    <SyntaxHighlighterProvider>
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
                Agent Install
              </Link>
            </FadeUp>

            {/* Header */}
            <FadeUp className="flex flex-col gap-y-4">
              <div className="flex items-center gap-x-3">
                {icon}
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${platform.categoryBg} ${platform.categoryColor}`}
                >
                  {platform.categoryLabel}
                </span>
              </div>
              <h1 className="mt-1 text-2xl font-medium tracking-tight md:text-3xl">
                {platform.tagline}
              </h1>
              <p className=" max-w-lg text-base leading-relaxed text-gray-500">
                {platform.description}
              </p>
            </FadeUp>

            {/* How it works */}
            <FadeUp className="flex flex-col gap-y-5">
              <h2 className=" text-sm font-medium uppercase tracking-wider text-gray-400">
                How it works
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {platform.howItWorks.map((step, i) => (
                  <HowItWorksCard
                    key={i}
                    number={i + 1}
                    title={step.title}
                    description={step.description}
                  />
                ))}
              </div>
            </FadeUp>

            {/* Install agent (if applicable) */}
            {platform.installCommand && (
              <FadeUp className="flex flex-col gap-y-6">
                <div className="flex flex-row items-center justify-between">
                  <h2 className="text-base font-medium">
                    {stepIndex++}. Install {platform.name}
                  </h2>
                  <CopyButton
                    copied={installCopied}
                    onCopy={handleCopyInstall}
                    label="Copy"
                  />
                </div>
                <CodeWrapper>
                  <SyntaxHighlighterClient
                    lang="bash"
                    code={platform.installCommand}
                  />
                </CodeWrapper>
              </FadeUp>
            )}

            {/* Load Spaire playbooks */}
            {platform.setupSnippet && (
              <FadeUp className="flex flex-col gap-y-6">
                <div className="flex flex-row items-center justify-between">
                  <h2 className="text-base font-medium">
                    {stepIndex++}. Add Spaire context to your project
                  </h2>
                  <CopyButton
                    copied={setupCopied}
                    onCopy={handleCopySetup}
                    label="Copy"
                  />
                </div>
                <CodeWrapper>
                  <SyntaxHighlighterClient
                    lang="bash"
                    code={platform.setupSnippet}
                  />
                </CodeWrapper>
                {platform.setupNote && (
                  <p className=" text-xs leading-relaxed text-gray-400">
                    {platform.setupNote}
                  </p>
                )}
              </FadeUp>
            )}

            {/* No setup snippet — show a note about AGENTS.md */}
            {!platform.setupSnippet && platform.setupNote && (
              <FadeUp className="flex flex-col gap-y-4">
                <h2 className="text-base font-medium">
                  {stepIndex++}. Context file already configured
                </h2>
                <div className=" flex items-start gap-x-3 rounded-xl border border-gray-200 p-4">
                  <CheckOutlined
                    className="mt-0.5 shrink-0 text-emerald-500"
                    sx={{ fontSize: 16 }}
                  />
                  <p className=" text-sm leading-relaxed text-gray-500">
                    {platform.setupNote}
                  </p>
                </div>
              </FadeUp>
            )}

            {/* Run the commands */}
            <FadeUp className="flex flex-col gap-y-6">
              <h2 className="text-base font-medium">
                {stepIndex}. Run a command
              </h2>
              <div className="flex flex-col gap-y-6">
                {platform.commands.map((cmd) => (
                  <div
                    key={cmd.slug}
                    className=" flex flex-col gap-y-4 rounded-2xl border border-gray-200 p-6"
                  >
                    <div className="flex flex-row items-start justify-between">
                      <div className="flex flex-col gap-y-1">
                        <h3 className="text-sm font-medium">{cmd.name}</h3>
                        <p className=" text-xs leading-relaxed text-gray-400">
                          {cmd.description}
                        </p>
                      </div>
                      {cmd.detailPageSlug && (
                        <Link
                          href={`/dashboard/${organization.slug}/integrations/${cmd.detailPageSlug}`}
                          className="flex shrink-0 items-center gap-x-1 rounded-full px-3 py-1.5 text-xs text-blue-500 transition-colors hover:bg-blue-50 hover:text-blue-600 "
                        >
                          Full guide
                          <ArrowOutwardOutlined sx={{ fontSize: 12 }} />
                        </Link>
                      )}
                    </div>
                    <div className="flex flex-col gap-y-2">
                      <div className="flex flex-row items-center justify-between">
                        <span className=" text-[11px] font-medium uppercase tracking-wider text-gray-400">
                          {cmd.snippetLabel}
                        </span>
                        <CopyButton
                          copied={copiedCommand === cmd.slug}
                          onCopy={() => handleCopyCommand(cmd.slug, cmd.snippet)}
                          label="Copy"
                        />
                      </div>
                      <CodeWrapper>
                        <SyntaxHighlighterClient
                          lang={cmd.snippetLang === 'text' ? 'bash' : 'bash'}
                          code={cmd.snippet}
                        />
                      </CodeWrapper>
                    </div>
                  </div>
                ))}
              </div>
            </FadeUp>

            {/* Actions */}
            <FadeUp className="flex flex-col gap-y-3 pt-2">
              <Link href={platform.docsLink} target="_blank" className="w-full">
                <Button size="lg" fullWidth>
                  <span>View Docs</span>
                  <ArrowOutwardOutlined className="ml-2" fontSize="small" />
                </Button>
              </Link>
              <div className="flex flex-row items-center justify-center pt-1">
                <Link
                  href={`/dashboard/${organization.slug}/integrations`}
                  className="cursor-pointer rounded-full px-3 py-1.5 text-sm text-blue-500 transition-colors duration-100 hover:bg-blue-50 hover:text-blue-600  "
                >
                  Back to Agent Install
                </Link>
              </div>
            </FadeUp>
          </motion.div>
        </div>
      </DashboardBody>
    </SyntaxHighlighterProvider>
  )
}

const CodeWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className=" w-full rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm">
    {children}
  </div>
)

const CopyButton = ({
  copied,
  onCopy,
  label,
}: {
  copied: boolean
  onCopy: () => void
  label: string
}) => (
  <button
    onClick={onCopy}
    className={twMerge(
      'flex items-center gap-x-1.5 rounded-full px-4 py-2 text-xs font-medium transition-all',
      copied
        ? 'bg-emerald-50 text-emerald-600 '
        : '  bg-gray-100 text-gray-600 hover:bg-gray-200',
    )}
  >
    {copied ? (
      <>
        <CheckOutlined sx={{ fontSize: 14 }} />
        Copied
      </>
    ) : (
      <>
        <ContentCopyOutlined sx={{ fontSize: 14 }} />
        {label}
      </>
    )}
  </button>
)

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
