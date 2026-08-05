'use client'

import { USAGE_BILLING_COMMAND } from '@/components/ClaudeCode/agentCommands'
import ClaudeCodeIcon from '@/components/Icons/frameworks/claude-code'
import { InlineModalHeader } from '@/components/Modal/InlineModal'
import {
  SyntaxHighlighterClient,
  SyntaxHighlighterProvider,
} from '@/components/SyntaxHighlighterShiki/SyntaxHighlighterClient'
import { OrganizationContext } from '@/providers/maintainerOrganization'
import ArrowOutwardOutlined from '@mui/icons-material/ArrowOutwardOutlined'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import Button from '@spaire/ui/components/atoms/Button'
import Link from 'next/link'
import { useCallback, useContext, useState } from 'react'
import { twMerge } from 'tailwind-merge'

const COMMAND_FILE_URL =
  'https://cdn.spairehq.com/claude/commands/setup-usage-billing.md'

interface SetupWithClaudeModalContentProps {
  hideModal: () => void
}

const SetupWithClaudeModalContent = ({
  hideModal,
}: SetupWithClaudeModalContentProps) => {
  const { organization } = useContext(OrganizationContext)
  const command = USAGE_BILLING_COMMAND

  const [setupCopied, setSetupCopied] = useState(false)
  const [commandCopied, setCommandCopied] = useState(false)

  const setupSnippet = `mkdir -p .claude/commands\ncurl -sL -o .claude/commands/${command.slug}.md \\\n  ${COMMAND_FILE_URL}`

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
      <div className="flex flex-col">
        <InlineModalHeader hide={hideModal}>
          <div className="flex items-center gap-x-2.5">
            <ClaudeCodeIcon size={22} />
            <span>Set up with Claude</span>
          </div>
        </InlineModalHeader>

        <div className="flex flex-col gap-y-8 overflow-y-auto px-8 pb-10">
          {/* Header */}
          <div className="flex flex-col gap-y-2">
            <div className="flex items-center gap-x-2">
              <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-600 ">
                {command.label}
              </span>
            </div>
            <h2 className="text-xl font-medium tracking-tight">
              {command.tagline}
            </h2>
            <p className=" text-sm leading-relaxed text-gray-500">
              {command.description}
            </p>
          </div>

          {/* How it works */}
          <div className="flex flex-col gap-y-3">
            <h3 className=" text-xs font-medium uppercase tracking-wider text-gray-400">
              How it works
            </h3>
            <div className="flex flex-col gap-y-2">
              {command.howItWorks.map((step, i) => (
                <div
                  key={i}
                  className=" flex items-start gap-x-3 rounded-xl border border-gray-100 bg-white p-4"
                >
                  <span className=" flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                    {i + 1}
                  </span>
                  <div className="flex flex-col gap-y-0.5">
                    <span className="text-sm font-medium">{step.title}</span>
                    <span className=" text-xs leading-relaxed text-gray-400">
                      {step.description}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Step 1: Add command file */}
          <div className="flex flex-col gap-y-3">
            <div className="flex flex-row items-center justify-between">
              <h3 className="text-sm font-medium">
                1. Add the command file to your project
              </h3>
              <CopyButton
                copied={setupCopied}
                onCopy={handleCopySetup}
                label="Copy"
              />
            </div>
            <CodeWrapper>
              <SyntaxHighlighterClient lang="bash" code={setupSnippet} />
            </CodeWrapper>
            <p className=" text-xs leading-relaxed text-gray-400">
              Downloads the agent command into your project. Claude Code loads
              it automatically as a custom slash command.
            </p>
          </div>

          {/* Step 2: Run the command */}
          <div className="flex flex-col gap-y-3">
            <div className="flex flex-row items-center justify-between">
              <h3 className="text-sm font-medium">
                2. Run the agent in your project
              </h3>
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
          </div>

          {/* What the agent does */}
          <div className="flex flex-col gap-y-3">
            <h3 className=" text-xs font-medium uppercase tracking-wider text-gray-400">
              What the agent does for you
            </h3>
            <div className=" flex flex-col divide-y divide-gray-100 rounded-xl border border-gray-200 ">
              {command.whatTheAgentDoes.map((item, i) => (
                <div key={i} className="flex items-start gap-x-3 px-4 py-3">
                  <CheckOutlined
                    className="mt-0.5 shrink-0 text-emerald-500"
                    sx={{ fontSize: 14 }}
                  />
                  <span className=" text-xs text-gray-700">
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-y-3">
            <Link href={command.docsLink} target="_blank" className="w-full">
              <Button size="lg" fullWidth>
                <span>View Docs</span>
                <ArrowOutwardOutlined className="ml-2" fontSize="small" />
              </Button>
            </Link>
            <div className="flex justify-center">
              <Link
                href={`/dashboard/${organization.slug}/integrations/setup-usage-billing`}
                target="_blank"
                className="cursor-pointer rounded-full px-3 py-1.5 text-sm text-blue-500 transition-colors duration-100 hover:bg-blue-50 hover:text-blue-600  "
              >
                Open full page
              </Link>
            </div>
          </div>
        </div>
      </div>
    </SyntaxHighlighterProvider>
  )
}

const CodeWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className=" w-full rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
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
    type="button"
    onClick={onCopy}
    className={twMerge(
      'flex items-center gap-x-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
      copied
        ? 'bg-emerald-50 text-emerald-600 '
        : '  bg-gray-100 text-gray-600 hover:bg-gray-200',
    )}
  >
    {copied ? (
      <>
        <CheckOutlined sx={{ fontSize: 12 }} />
        Copied
      </>
    ) : (
      <>
        <ContentCopyOutlined sx={{ fontSize: 12 }} />
        {label}
      </>
    )}
  </button>
)

export default SetupWithClaudeModalContent
