export interface AgentPlatformCommand {
  slug: string
  name: string
  description: string
  /** The snippet to copy and run or paste in chat */
  snippet: string
  snippetLang: 'bash' | 'text'
  /** Label shown above the snippet, e.g. "Paste in Cursor Chat (Agent mode)" */
  snippetLabel: string
  /** If the command has its own dedicated deep-dive page (Claude Code only) */
  detailPageSlug?: string
}

export interface AgentPlatform {
  slug: string
  name: string
  tagline: string
  description: string
  /** Short label shown as a badge */
  categoryLabel: string
  /** Tailwind text color class for the badge */
  categoryColor: string
  /** Tailwind bg color class for the badge */
  categoryBg: string
  /** Install command. Omit for IDE-based agents (Cursor, Copilot). */
  installCommand?: string
  howItWorks: { title: string; description: string }[]
  /** Bash snippet to get the Spaire config file into the project */
  setupSnippet?: string
  /** Note shown below the setup snippet */
  setupNote?: string
  commands: AgentPlatformCommand[]
  docsLink: string
}

const CDN_BASE = 'https://cdn.spairehq.com'

export const CLAUDE_CODE_PLATFORM: AgentPlatform = {
  slug: 'claude-code',
  name: 'Claude Code',
  tagline: 'Run Spaire commands directly inside Claude Code.',
  description:
    'Add two slash commands to your project, open Claude Code, and type the command. Claude Code reads your project files, asks a few clarifying questions, and writes the billing code directly into your codebase.',
  categoryLabel: 'Terminal AI Agent',
  categoryColor: 'text-orange-600',
  categoryBg: 'bg-orange-50',
  installCommand: 'npm install -g @anthropic-ai/claude-code',
  howItWorks: [
    {
      title: 'Install Claude Code',
      description: 'One npm command gets the CLI on your machine.',
    },
    {
      title: 'Download the command files',
      description:
        'Add the Spaire slash commands to your project with one curl command.',
    },
    {
      title: 'Run the command',
      description:
        'Open Claude Code in your project and type the slash command.',
    },
  ],
  setupSnippet: `mkdir -p .claude/commands\ncurl -sL -o .claude/commands/setup-checkout.md \\\n  ${CDN_BASE}/claude/commands/setup-checkout.md\ncurl -sL -o .claude/commands/setup-usage-billing.md \\\n  ${CDN_BASE}/claude/commands/setup-usage-billing.md`,
  setupNote:
    'This downloads both commands into your project. Claude Code loads them automatically as slash commands. Commit the files so your whole team gets them.',
  commands: [
    {
      slug: 'setup-checkout',
      name: 'Setup Checkout',
      description:
        'Reads your project, asks about your setup, and wires up Spaire checkout — overlay, programmatic, or server-side.',
      snippet: `cd your-project\nclaude\n\n# Then type:\n/setup-checkout`,
      snippetLang: 'bash',
      snippetLabel: 'Run in terminal',
      detailPageSlug: 'setup-checkout',
    },
    {
      slug: 'setup-usage-billing',
      name: 'Setup Usage Billing',
      description:
        'Installs the SDK, asks what you want to meter, creates meters, and writes the ingestion code.',
      snippet: `cd your-project\nclaude\n\n# Then type:\n/setup-usage-billing`,
      snippetLang: 'bash',
      snippetLabel: 'Run in terminal',
      detailPageSlug: 'setup-usage-billing',
    },
  ],
  docsLink: 'https://docs.spairehq.com/integrate/agent-commands',
}

export const CURSOR_PLATFORM: AgentPlatform = {
  slug: 'cursor',
  name: 'Cursor',
  tagline: 'Add a rules file, then ask Cursor to integrate Spaire.',
  description:
    'Drop `.cursor/rules/spaire.mdc` into your project. When you open Cursor Agent mode and describe what you want, Cursor has full Spaire API and SDK context — so you don\'t have to explain it yourself.',
  categoryLabel: 'AI Code Editor',
  categoryColor: 'text-sky-600',
  categoryBg: 'bg-sky-50',
  howItWorks: [
    {
      title: 'Download the rules file',
      description:
        'Run one command to add `.cursor/rules/spaire.mdc`. Commit it so every developer gets Spaire context in their Cursor.',
    },
    {
      title: 'Open Cursor Chat (Agent mode)',
      description:
        'Press Cmd+L (Mac) or Ctrl+L (Windows). Switch to Agent for edits across multiple files.',
    },
    {
      title: 'Describe what you need',
      description:
        'Type your request. Cursor uses the rules file for Spaire API context and reads your code to write the integration.',
    },
  ],
  setupSnippet: `mkdir -p .cursor/rules\ncurl -sL -o .cursor/rules/spaire.mdc \\\n  ${CDN_BASE}/cursor/rules/spaire.mdc`,
  setupNote:
    'Cursor reads `.cursor/rules/*.mdc` files automatically in every chat session. Commit this file so your whole team gets Spaire context.',
  commands: [
    {
      slug: 'setup-checkout',
      name: 'Add Checkout',
      description:
        'Cursor reads the rules file for Spaire API context, then writes checkout into your project.',
      snippet: `Add Spaire checkout to this project`,
      snippetLang: 'text',
      snippetLabel: 'Paste in Cursor Chat (Agent mode)',
    },
    {
      slug: 'setup-usage-billing',
      name: 'Set Up Usage Billing',
      description:
        'Cursor reads the rules file for Spaire API context, then writes usage billing ingestion code.',
      snippet: `Set up Spaire usage billing in this project`,
      snippetLang: 'text',
      snippetLabel: 'Paste in Cursor Chat (Agent mode)',
    },
  ],
  docsLink: 'https://docs.spairehq.com/integrate/agent-commands',
}

export const CODEX_PLATFORM: AgentPlatform = {
  slug: 'codex',
  name: 'Codex',
  tagline: 'Run one command to integrate Spaire from your terminal.',
  description:
    'Install the Codex CLI, add a context file to your project, then give it a task. Codex reads AGENTS.md at startup, so it has Spaire API context before it touches your code.',
  categoryLabel: 'CLI AI Agent',
  categoryColor: 'text-neutral-500',
  categoryBg: 'bg-neutral-100',
  installCommand: 'npm i -g @openai/codex',
  howItWorks: [
    {
      title: 'Install Codex CLI',
      description: 'One npm command gets the OpenAI Codex agent on your machine.',
    },
    {
      title: 'Add the context file',
      description:
        'Run one curl command to add AGENTS.md to your project. Codex reads it automatically at startup.',
    },
    {
      title: 'Run a command',
      description:
        'One terminal command from your project directory kicks off the integration.',
    },
  ],
  setupSnippet: `curl -sL -o AGENTS.md \\\n  ${CDN_BASE}/codex/AGENTS.md`,
  setupNote:
    'Codex reads AGENTS.md at startup when you run it from your project directory. Commit this file so your whole team can use the same commands.',
  commands: [
    {
      slug: 'setup-checkout',
      name: 'Add Checkout',
      description:
        'Codex reads AGENTS.md for Spaire context, then writes checkout into your project.',
      snippet: `codex "Add Spaire checkout to this project"`,
      snippetLang: 'bash',
      snippetLabel: 'Run in your project directory',
    },
    {
      slug: 'setup-usage-billing',
      name: 'Set Up Usage Billing',
      description:
        'Codex reads AGENTS.md for Spaire context, then writes usage billing ingestion code.',
      snippet: `codex "Set up Spaire usage billing in this project"`,
      snippetLang: 'bash',
      snippetLabel: 'Run in your project directory',
    },
  ],
  docsLink: 'https://docs.spairehq.com/integrate/agent-commands',
}

export const GITHUB_COPILOT_PLATFORM: AgentPlatform = {
  slug: 'github-copilot',
  name: 'GitHub Copilot',
  tagline: 'Give Copilot Spaire context. Then ask it to add billing.',
  description:
    'Commit `.github/copilot-instructions.md` to your repo. GitHub Copilot loads it automatically in every chat session — so when you describe what you want, it already has Spaire API context.',
  categoryLabel: 'AI Pair Programmer',
  categoryColor: 'text-violet-600',
  categoryBg: 'bg-violet-50',
  howItWorks: [
    {
      title: 'Add the context file',
      description:
        'Run one command to add `.github/copilot-instructions.md`. Commit it so your whole team gets Spaire context in Copilot.',
    },
    {
      title: 'Open Copilot Chat (Agent mode)',
      description:
        'In VS Code, open Copilot Chat and switch to Agent mode for edits across multiple files.',
    },
    {
      title: 'Describe what you need',
      description:
        'Type your request. Copilot uses the instructions file for Spaire context and reads your code to write the integration.',
    },
  ],
  setupSnippet: `mkdir -p .github\ncurl -sL -o .github/copilot-instructions.md \\\n  ${CDN_BASE}/copilot/copilot-instructions.md`,
  setupNote:
    'GitHub Copilot reads `.github/copilot-instructions.md` automatically in every chat session in this repo. Commit this file so your whole team gets Spaire context.',
  commands: [
    {
      slug: 'setup-checkout',
      name: 'Add Checkout',
      description:
        'Copilot reads the instructions file for Spaire context, then writes checkout into your project.',
      snippet: `Add Spaire checkout to this project`,
      snippetLang: 'text',
      snippetLabel: 'Paste in Copilot Chat (Agent mode)',
    },
    {
      slug: 'setup-usage-billing',
      name: 'Set Up Usage Billing',
      description:
        'Copilot reads the instructions file for Spaire context, then writes usage billing ingestion code.',
      snippet: `Set up Spaire usage billing in this project`,
      snippetLang: 'text',
      snippetLabel: 'Paste in Copilot Chat (Agent mode)',
    },
  ],
  docsLink: 'https://docs.spairehq.com/integrate/agent-commands',
}

export const ALL_AGENT_PLATFORMS: AgentPlatform[] = [
  CLAUDE_CODE_PLATFORM,
  CURSOR_PLATFORM,
  CODEX_PLATFORM,
  GITHUB_COPILOT_PLATFORM,
]

export const getAgentPlatformBySlug = (
  slug: string,
): AgentPlatform | undefined => {
  return ALL_AGENT_PLATFORMS.find((p) => p.slug === slug)
}
