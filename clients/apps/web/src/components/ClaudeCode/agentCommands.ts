export interface AgentCommand {
  slug: string
  name: string
  tagline: string
  description: string
  label: string
  command: string
  howItWorks: { title: string; description: string }[]
  whatTheAgentDoes: string[]
  docsLink: string
}

export const CHECKOUT_COMMAND: AgentCommand = {
  slug: 'setup-checkout',
  name: 'Checkouts',
  tagline: 'Add checkout to your app automatically.',
  description:
    'The agent reads your codebase, finds where to add buy buttons, and wires up Spaire checkout — overlay, programmatic, or server-side — directly in your project.',
  label: 'Checkouts',
  command: '/setup-checkout',
  howItWorks: [
    {
      title: 'Add the command file',
      description:
        'Download the setup-checkout command into your project\u2019s .claude/commands/ directory',
    },
    {
      title: 'Run the agent',
      description:
        'Open Claude Code in your project and type /setup-checkout',
    },
    {
      title: 'Agent writes the code',
      description:
        'Detects your framework, asks your approach, and writes checkout code directly in your files',
    },
  ],
  whatTheAgentDoes: [
    'Checks for uncommitted changes and warns you to commit first',
    'Detects your framework (Next.js App Router, Pages Router, Express, FastAPI, Rails, serverless, etc.)',
    'Asks if you have products created in Spaire yet — walks you through it if not',
    'Asks which checkout approach: overlay (simplest), programmatic (EmbedCheckout.create), or server-side (SDK)',
    'Scans your codebase for pricing pages, product pages, or CTA sections',
    'Shows a full change summary (files to create/modify) and asks for confirmation before writing anything',
    'Adds the Spaire embed script tag to your layout',
    'Writes checkout buttons or links directly into your components',
    'Creates a /checkout/success confirmation page',
    'Optionally wires up customer portal link and idempotent webhook handler with signature verification',
    'Provides revert instructions so you can undo every change',
  ],
  docsLink: 'https://docs.spairehq.com/integrate/agent-commands#setup-checkout',
}

export const USAGE_BILLING_COMMAND: AgentCommand = {
  slug: 'setup-usage-billing',
  name: 'Usage Billing',
  tagline: 'Set up metered billing automatically.',
  description:
    'The agent detects your stack, installs the Spaire SDK, creates meters, writes ingestion code, and wires up metered pricing — all interactively, right in your codebase.',
  label: 'Usage Billing',
  command: '/setup-usage-billing',
  howItWorks: [
    {
      title: 'Add the command file',
      description:
        'Download the setup-usage-billing command into your project\u2019s .claude/commands/ directory',
    },
    {
      title: 'Run the agent',
      description:
        'Open Claude Code in your project and type /setup-usage-billing',
    },
    {
      title: 'Agent writes the code',
      description:
        'Detects your stack, asks what to meter, and writes ingestion code directly in your project',
    },
  ],
  whatTheAgentDoes: [
    'Checks for uncommitted changes and warns you to commit first',
    'Detects your framework (Next.js App Router, Pages Router, Express, FastAPI, Rails, serverless, etc.)',
    'Asks what you want to meter (LLM tokens, API calls, storage, compute time, or custom)',
    'Asks your pricing model (per-unit, credits-based, or both)',
    'Checks prerequisites (SDK installed, access token set)',
    'Tells you exactly what meter to create in the dashboard — never creates billing objects silently',
    'Shows a full change summary and asks for confirmation before writing anything',
    'Writes ingestion code directly into your project using the right SDK strategy (@spaire/ingestion for LLM/S3/Stream/DeltaTime, or @spaire/sdk for simple counting)',
    'Walks you through metered pricing setup on your product',
    'Optionally sets up credits with balance-checking utilities',
    'Generates idempotent webhook handlers with signature verification',
    'Provides revert instructions so you can undo every change',
  ],
  docsLink:
    'https://docs.spairehq.com/integrate/agent-commands#setup-usage-billing',
}

export const ALL_AGENT_COMMANDS: AgentCommand[] = [
  CHECKOUT_COMMAND,
  USAGE_BILLING_COMMAND,
]

export const getAgentCommandBySlug = (
  slug: string,
): AgentCommand | undefined => {
  return ALL_AGENT_COMMANDS.find((c) => c.slug === slug)
}
