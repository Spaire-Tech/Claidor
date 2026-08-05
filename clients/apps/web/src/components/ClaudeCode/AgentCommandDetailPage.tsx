'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import ArrowOutwardOutlined from '@mui/icons-material/ArrowOutwardOutlined'
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import { OrganizationContext } from '@/providers/maintainerOrganization'
import Button from '@spaire/ui/components/atoms/Button'
import Link from 'next/link'
import { useCallback, useContext, useState } from 'react'
import { motion } from 'framer-motion'
import { twMerge } from 'tailwind-merge'
import { FadeUp } from '../Animated/FadeUp'
import ClaudeCodeIcon from '../Icons/frameworks/claude-code'
import {
  SyntaxHighlighterClient,
  SyntaxHighlighterProvider,
} from '../SyntaxHighlighterShiki/SyntaxHighlighterClient'
import type { AgentCommand } from './agentCommands'

interface AgentCommandDetailPageProps {
  command: AgentCommand
}

const COMMAND_FILE_URLS: Record<string, string> = {
  'setup-checkout':
    'https://cdn.spairehq.com/claude/commands/setup-checkout.md',
  'setup-usage-billing':
    'https://cdn.spairehq.com/claude/commands/setup-usage-billing.md',
}

export default function AgentCommandDetailPage({
  command,
}: AgentCommandDetailPageProps) {
  const { organization } = useContext(OrganizationContext)
  const [setupCopied, setSetupCopied] = useState(false)
  const [commandCopied, setCommandCopied] = useState(false)

  const setupSnippet = `mkdir -p .claude/commands\ncurl -sL -o .claude/commands/${command.slug}.md \\\n  ${COMMAND_FILE_URLS[command.slug] ?? `https://cdn.spairehq.com/claude/commands/${command.slug}.md`}`

  const handleCopySetup = useCallback(() => {
    navigator.clipboard.writeText(setupSnippet)
    setSetupCopied(true)
    setTimeout(() => setSetupCopied(false), 2500)
  }, [setupSnippet])

  const handleCopyCommand = useCallback(() => {
    navigator.clipboard.writeText(command.command)
    setCommandCopied(true)
    setTimeout(() => setCommandCopied(false), 2500)
  }, [command.command])

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
                href={`/dashboard/${organization.slug}/integrations/claude-code`}
                className="flex cursor-pointer items-center gap-x-1.5 rounded-full px-3 py-1.5 text-sm text-blue-500 transition-colors duration-100 hover:bg-blue-50 hover:text-blue-600  "
              >
                <ArrowBackOutlined sx={{ fontSize: 16 }} />
                Claude Code
              </Link>
            </FadeUp>

            {/* Header */}
            <FadeUp className="flex flex-col gap-y-4">
              <div className="flex items-center gap-x-3">
                <ClaudeCodeIcon size={40} />
                <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-600 ">
                  {command.label}
                </span>
              </div>
              <h1 className="mt-1 text-2xl font-medium tracking-tight md:text-3xl">
                {command.tagline}
              </h1>
              <p className=" max-w-lg text-base leading-relaxed text-gray-500">
                {command.description}
              </p>
            </FadeUp>

            {/* How it works */}
            <FadeUp className="flex flex-col gap-y-5">
              <h2 className=" text-sm font-medium uppercase tracking-wider text-gray-400">
                How it works
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {command.howItWorks.map((step, i) => (
                  <HowItWorksCard
                    key={i}
                    number={i + 1}
                    title={step.title}
                    description={step.description}
                  />
                ))}
              </div>
            </FadeUp>

            {/* Add command file */}
            <FadeUp className="flex flex-col gap-y-6">
              <div className="flex flex-row items-center justify-between">
                <h2 className="text-base font-medium">
                  1. Add the command file to your project
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
                  code={setupSnippet}
                />
              </CodeWrapper>
              <p className=" text-xs leading-relaxed text-gray-400">
                This downloads the agent command into your project. Claude Code
                loads it automatically as a custom slash command. Commit the
                file so your whole team gets it.
              </p>
            </FadeUp>

            {/* Run the command */}
            <FadeUp className="flex flex-col gap-y-6">
              <div className="flex flex-row items-center justify-between">
                <h2 className="text-base font-medium">
                  2. Run the agent in your project
                </h2>
                <CopyButton
                  copied={commandCopied}
                  onCopy={handleCopyCommand}
                  label="Copy"
                />
              </div>
              <CodeWrapper>
                <SyntaxHighlighterClient
                  lang="bash"
                  code={`cd your-project\nclaude\n\n# Then type:\n${command.command}`}
                />
              </CodeWrapper>
              <p className=" text-xs leading-relaxed text-gray-400">
                Open Claude Code inside your project directory, then type the
                command. The agent takes over from there.
              </p>
            </FadeUp>

            {/* What the agent does */}
            <FadeUp className="flex flex-col gap-y-5">
              <h2 className=" text-sm font-medium uppercase tracking-wider text-gray-400">
                What the agent does for you
              </h2>
              <div className=" flex flex-col divide-y divide-gray-100 rounded-2xl border border-gray-200 ">
                {command.whatTheAgentDoes.map((item, i) => (
                  <div key={i} className="flex items-start gap-x-3 px-6 py-4">
                    <CheckOutlined
                      className="mt-0.5 shrink-0 text-emerald-500"
                      sx={{ fontSize: 16 }}
                    />
                    <span className=" text-sm text-gray-700">
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </FadeUp>

            {/* Actions */}
            <FadeUp className="flex flex-col gap-y-3 pt-2">
              <Link
                href={command.docsLink}
                target="_blank"
                className="w-full"
              >
                <Button size="lg" fullWidth>
                  <span>View Docs</span>
                  <ArrowOutwardOutlined className="ml-2" fontSize="small" />
                </Button>
              </Link>
              <div className="flex flex-row items-center justify-center pt-1">
                <Link
                  href={`/dashboard/${organization.slug}/integrations/claude-code`}
                  className="cursor-pointer rounded-full px-3 py-1.5 text-sm text-blue-500 transition-colors duration-100 hover:bg-blue-50 hover:text-blue-600  "
                >
                  Back to Claude Code
                </Link>
              </div>
            </FadeUp>
          </motion.div>
        </div>
      </DashboardBody>
    </SyntaxHighlighterProvider>
  )
}

const CodeWrapper = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className=" w-full rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm">
      {children}
    </div>
  )
}

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
