import '../src/renderer/design/tokens.css';

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { AccountMenu } from '../src/renderer/design/shell/AccountMenu';
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
