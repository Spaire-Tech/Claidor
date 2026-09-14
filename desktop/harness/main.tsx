import '../src/renderer/design/tokens.css';

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

// The real twelve, not a fixture. `presetAgents.ts` is a main-process
// module but it reaches for nothing Electron gives it — a type-only
// import of the store, and a plain-JS language helper — so the harness
// can draw the list the app will actually draw.
import { PRESET_AGENTS } from '../src/main/presetAgents';
import { AgentDetail } from '../src/renderer/design/agent/AgentDetail';
import { AgentTab } from '../src/renderer/design/agent/detail';
import type { AgentDetailState } from '../src/renderer/design/agent/useAgentDetail';
import { AccountMenu } from '../src/renderer/design/shell/AccountMenu';
import { Apps } from '../src/renderer/design/shell/Apps';
import { MessagesShell, ThreadMode } from '../src/renderer/design/shell/MessagesShell';
import { SignIn } from '../src/renderer/design/shell/SignIn';
import type { EngineMessage, EnginePermissionRequest } from '../src/renderer/design/thread/fromEngine';
import { toThreadItems } from '../src/renderer/design/thread/fromEngine';
import type { ThreadItem } from '../src/renderer/design/thread/types';
import { ThreadItemKind } from '../src/renderer/design/thread/types';

/**
 * A harness for looking at the design, not part of the app.
 *
 * It mounts the real components — not copies, not mocks of them — with
 * fixture data, so a screenshot shows what the app will show. The only
 * thing faked is the store: everything below these components is the
 * shipped code.
 *
 * `?screen=` picks which one to draw, so a screenshot script can walk
 * through them.
 */

const at = (minutes: number): number => Date.parse('2026-03-10T09:00:00Z') + minutes * 60_000;

const message = (
  over: Partial<EngineMessage> & Pick<EngineMessage, 'type'>,
  minute = 0,
): EngineMessage => ({
  id: `m${minute}-${over.type}`,
  content: '',
  timestamp: at(minute),
  ...over,
});

/** A conversation that exercises every kind the thread can show. */
const CONVERSATION: EngineMessage[] = [
  message({ type: 'user', content: 'can you read the board deck before the call' }, 0),
  message({
    type: 'assistant',
    content:
      'Already pulled it. 24 slides, two of them have numbers that don’t match the model.'
      + '\n\nWant me to flag those now, or put them in a note after?',
  }, 1),
  message({ type: 'user', content: 'now please' }, 2),
  message({ type: 'assistant', content: 'Thinking about the reconciliation…', metadata: { isThinking: true } }, 3),
  message({ type: 'tool_use', metadata: { toolName: 'read', toolUseId: 'done-1' } }, 3),
  message({ type: 'tool_result', content: 'slide 14, slide 19', metadata: { toolUseId: 'done-1' } }, 4),
  message({
    type: 'assistant',
    content: 'Slide 14 and slide 19. Both use last quarter’s headcount figure.',
  }, 4),
  message({ type: 'user', content: 'check my most recent excel file' }, 5),
  message({ type: 'tool_use', metadata: { toolName: 'bash', toolUseId: 'live-1' } }, 6),
];

const PENDING: (EnginePermissionRequest & { sessionId: string })[] = [
  {
    sessionId: 's1',
    requestId: 'r1',
    toolName: 'bash',
    toolInput: { command: 'ls -t ~/Documents/**/*.xlsx | head -1' },
  },
];

const CHOICE: ThreadItem = {
  kind: ThreadItemKind.Choice,
  id: 'choice-1',
  text: 'How do you want me to get at it?',
  options: [
    { key: 'A', label: 'Try again on this Mac', hint: 'I’ll approve the next request' },
    { key: 'B', label: 'I’ll drop the file here', hint: 'Attach it in the chat' },
    { key: 'C', label: 'A different file' },
  ],
  freeform: true,
  at: at(7),
};

const AGENTS = [
  { id: 'juno', name: 'Juno', preview: 'Slide 14 and slide 19 use last quarter’s headcount.', when: '9:12 AM' },
  { id: 'mira', name: 'Mira', preview: 'Cleared the promotions. Fourteen need you.', when: '2:42 AM', unread: true },
  { id: 'perrin', name: 'Perrin', preview: 'Standing by — the next request will come up here.', when: 'Friday' },
  { id: 'sable', name: 'Sable', preview: 'Filed under Board / 2026, old version kept as v1.', when: 'Thursday' },
  { id: 'engineering-lead', name: 'Engineering Lead', preview: '', when: '' },
];

const noop = (): void => undefined;

/**
 * The agent sheet's five tabs, with something in each.
 *
 * Built as the state the hook returns rather than by running the hook:
 * the hook talks to five IPC surfaces that do not exist in a browser,
 * and what a screenshot is checking is the drawing.
 */
const skillFixture = (id: string, name: string, description: string) => ({
  id, name, description, enabled: true, isOfficial: true, isBuiltIn: true,
  updatedAt: 0, prompt: '', skillPath: `/skills/${id}`,
});

const routineFixture = (
  id: string, name: string, everyMs: number,
  state: Partial<AgentDetailState['routines'][number]['state']> = {},
  enabled = true,
) => ({
  id, name, description: '', enabled,
  schedule: { kind: 'every' as const, everyMs },
  sessionTarget: 'main', wakeMode: 'always',
  payload: { kind: 'agentTurn' as const, message: 'go' },
  delivery: { mode: 'silent' },
  agentId: 'juno', sessionKey: null,
  state: {
    nextRunAtMs: null, lastRunAtMs: null, lastStatus: null, lastError: null,
    lastDurationMs: null, runningAtMs: null, consecutiveErrors: 0, ...state,
  },
  createdAt: '', updatedAt: '',
});

function agentDetailFixture(tab: AgentTab): AgentDetailState {
  const instructions =
    'You are Juno.\n\nYour remit is research. The person you work with '
    + 'described your job as: reading long documents and telling me what '
    + 'changed.\n\nYour voice is concise: says only what matters.';
  return {
    loading: false,
    agent: {
      id: 'juno', name: 'Juno', description: 'Reads the long things',
      systemPrompt: instructions, skillIds: ['pdf', 'docx', 'stock-analyzer'],
    },
    tab,
    onTab: noop,
    instructions,
    savedInstructions: instructions,
    onInstructions: noop,
    onSaveInstructions: noop,
    saving: false,
    memories: [
      { id: 'm1', text: 'The board deck lives in Drive under Board / 2026.' },
      { id: 'm2', text: 'Headcount figures come from the model, never the deck.' },
      { id: 'm3', text: 'Prefers the summary first and the detail underneath.' },
    ],
    onAddMemory: noop,
    onDeleteMemory: noop,
    have: [
      skillFixture('pdf', 'PDF', 'Read and write PDF files'),
      skillFixture('docx', 'Word', 'Read and write Word documents'),
    ],
    // One named skill that is not installed, because that is the case
    // worth looking at: it is wrong rather than empty.
    missing: ['stock-analyzer'],
    allSkills: [
      skillFixture('pdf', 'PDF', 'Read and write PDF files'),
      skillFixture('docx', 'Word', 'Read and write Word documents'),
      skillFixture('xlsx', 'Excel', 'Read and write spreadsheets'),
      skillFixture('web-search', 'Web search', 'Search the web and read pages'),
    ],
    onToggleSkill: noop,
    routines: [
      routineFixture('r1', 'Morning read of the inbox', 86_400_000, {
        lastRunAtMs: Date.now() - 3 * 3_600_000, lastStatus: 'success',
      }),
      routineFixture('r2', 'Weekly figures check', 7 * 86_400_000, {
        lastRunAtMs: Date.now() - 26 * 3_600_000, lastStatus: 'error',
        lastError: 'The spreadsheet was open in another program.',
      }, false),
      routineFixture('r3', 'Watch the filings page', 3_600_000),
    ],
    onToggleRoutine: noop,
    onDeleteRoutine: noop,
    servers: [
      { id: 's1', name: 'Google Drive', description: 'Files, folders and shared drives', enabled: true, transportType: 'stdio', isBuiltIn: false },
      { id: 's2', name: 'Slack', description: 'Channels and direct messages', enabled: false, transportType: 'http', isBuiltIn: false },
    ],
    onToggleServer: noop,
  } as unknown as AgentDetailState;
}

/** A three-bubble reply, delivered a moment after mount. */
const LATER_REPLY = message({
  id: 'arrived',
  type: 'assistant',
  content: 'Found it.\n\nIt is the March forecast, last touched on Tuesday.\n\nWant me to open it?',
}, 8);

/**
 * Proves the stagger, which a still screenshot cannot. Mounts the thread,
 * then appends a reply after a beat so the bubbles arrive rather than
 * being there from the start.
 */
function Arriving(): JSX.Element {
  const [extra, setExtra] = useState<EngineMessage[]>([]);
  useEffect(() => {
    const timer = window.setTimeout(() => setExtra([LATER_REPLY]), 600);
    return () => window.clearTimeout(timer);
  }, []);
  const items = toThreadItems([...CONVERSATION.slice(0, 8), ...extra], {
    agentId: 'juno', agentName: 'Juno',
  });
  return (
    <MessagesShell
      agents={AGENTS} activeId="juno" activeName="Juno" items={items}
      dayStamp="Today" mode={ThreadMode.Text} accountName="Bass Fall"
      choice={{ onPick: noop, onFreeAnswer: noop, onDismiss: noop }}
      auth={{ onDecide: noop }}
      onSelect={noop} onSend={noop} onCompose={noop} onApps={noop}
      onAccount={noop} onMode={noop} onOpenPanel={noop} onPlus={noop}
    />
  );
}

function Screens(): JSX.Element {
  const screen = new URLSearchParams(location.search).get('screen') ?? 'thread';

  if (screen === 'signin') {
    return <SignIn onSignIn={noop} />;
  }
  if (screen === 'signin-error') {
    return <SignIn onSignIn={noop} error="That did not go through. Try again?" />;
  }
  if (screen === 'arriving') return <Arriving />;
  const composing = screen === 'compose';

  const withAuth = screen === 'auth' || screen === 'thread';
  const items = toThreadItems(CONVERSATION, {
    agentId: 'juno',
    agentName: 'Juno',
    pending: withAuth ? PENDING : [],
    deviceId: '6c0f8fd9-7d6d-439b-83e2-0d53f8b8542f',
  });
  if (screen === 'choice') items.push(CHOICE);

  return (
    <MessagesShell
      agents={AGENTS}
      activeId="juno"
      activeName="Juno"
      items={items}
      dayStamp="Today"
      typing={screen === 'typing'}
      mode={screen === 'voice' ? ThreadMode.Voice : ThreadMode.Text}
      accountName="Bass Fall"
      choice={{ onPick: noop, onFreeAnswer: noop, onDismiss: noop }}
      auth={{ onDecide: noop }}
      onSelect={noop}
      onSend={noop}
      composing={composing}
      onCompose={noop}
      onCloseCompose={noop}
      onPickAgent={noop}
      onCreateAgent={noop}
      onApps={noop}
      apps={screen === 'apps' || screen === 'apps-adding' ? (
        <Apps
          available={PRESET_AGENTS}
          // One already here, so both states of a row are on screen at
          // once: the button, and the word that replaces it.
          installedIds={new Set(['engineering-lead'])}
          busyId={screen === 'apps-adding' ? 'design-lead' : undefined}
          onInstall={noop}
          onClose={noop}
        />
      ) : undefined}
      onOpenAgent={noop}
      agentDetail={screen.startsWith('agent-') ? (
        <AgentDetail
          detail={agentDetailFixture(screen.slice('agent-'.length) as AgentTab)}
          agentId="juno"
          agentName="Juno"
          onClose={noop}
        />
      ) : undefined}
      onAccount={noop}
      accountMenu={screen === 'account' || screen === 'account-spent' ? (
        <AccountMenu
          quota={screen === 'account-spent'
            ? { planName: 'Trial', creditsLimit: 100, creditsUsed: 100 }
            : { planName: 'Trial', creditsLimit: 100, creditsUsed: 74 }}
          onSettings={noop}
          onLogOut={noop}
          onClose={noop}
        />
      ) : undefined}
      onMode={noop}
      onOpenPanel={noop}
      onPlus={noop}
    />
  );
}

createRoot(document.getElementById('root')!).render(<Screens />);
