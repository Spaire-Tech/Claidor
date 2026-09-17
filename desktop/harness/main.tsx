import '../src/renderer/design/tokens.css';

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

// The real twelve, not a fixture. `presetAgents.ts` is a main-process
// module but it reaches for nothing Electron gives it — a type-only
// import of the store, and a plain-JS language helper — so the harness
// can draw the list the app will actually draw.
import { PRESET_AGENTS } from '../src/main/presetAgents';
import { AgentDetail } from '../src/renderer/design/agent/AgentDetail';
import { AgentPanel } from '../src/renderer/design/agent/AgentPanel';
import { AgentTab } from '../src/renderer/design/agent/detail';
import type { AgentDetailState } from '../src/renderer/design/agent/useAgentDetail';
import { Onboarding } from '../src/renderer/design/onboarding/Onboarding';
import type { OnboardingBridge } from '../src/renderer/design/onboarding/useOnboarding';
import { Settings } from '../src/renderer/design/settings/Settings';
import { AccountMenu } from '../src/renderer/design/shell/AccountMenu';
import { Apps, AppsTab } from '../src/renderer/design/shell/Apps';
import { MessagesShell, ThreadMode } from '../src/renderer/design/shell/MessagesShell';
import { SignIn } from '../src/renderer/design/shell/SignIn';
import { type ConnectorCardState, connectorItem } from '../src/renderer/design/thread/connectorCards';
import type { EngineMessage, EnginePermissionRequest } from '../src/renderer/design/thread/fromEngine';
import { toThreadItems } from '../src/renderer/design/thread/fromEngine';
import { rosterItem } from '../src/renderer/design/thread/rosterCards';
import { staffingItem } from '../src/renderer/design/thread/staffingCards';
import type { ThreadItem } from '../src/renderer/design/thread/types';
import { ConnectorOutcome, ThreadItemKind } from '../src/renderer/design/thread/types';
import { EVERY_ROW } from '../src/shared/settings/appUiMap';
import { buildRoster } from '../src/shared/staffing/roster';
import { cardExamples } from './cardExamples';

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

/**
 * The founder's 15 September file cards: "send me the whole pack" and
 * the three come back, each with its own icon. The reply is written the
 * way the managed prompt tells the agent to write it — a sentence, then
 * one absolute link per line.
 */
const PACK: EngineMessage[] = [
  message({ type: 'user', content: 'where did the q4 deck end up' }, 0),
  message({ type: 'assistant', content: 'Filed the Q4 deck under Board / 2026.\n\nKept the old version beside it as v1 so nothing got overwritten.' }, 1),
  message({ type: 'user', content: 'send me the whole pack' }, 2),
  message({
    type: 'assistant',
    content: 'Here it is — deck, model and the memo that went out with them.\n'
      + '[Q4 Board Deck.pdf](file:///Users/bass/Board/2026/Q4%20Board%20Deck.pdf)\n'
      + '[Q4 Model v3.xlsx](file:///Users/bass/Board/2026/Q4%20Model%20v3.xlsx)\n'
      + '[Q4 Board Memo.docx](file:///Users/bass/Board/2026/Q4%20Board%20Memo.docx)',
  }, 3),
  message({ type: 'assistant', content: 'The model is v3. [[Q4 Model v2.xlsx]] is still in Board / 2026 if you want to compare.' }, 3),
];

/**
 * The answer cards, 17 September: the founder's four OpenUI pictures
 * (Seattle restaurants, Paris hotels, a Tokyo itinerary, the 2026 World
 * Cup) as OpenUI's own chat components, with photographs. One screen
 * each, so every block gets its photograph. The shooter serves
 * `harness/shots/photos/` on its own loopback port (`shoot.mjs`), which
 * is why the addresses are built from the page's origin at runtime; a
 * fresh clone without that folder draws the same cards with no pictures.
 */
const photo = (name: string): string => `${location.origin}/photos/${name}.jpg`;
const CARD_SCREENS: Record<string, EngineMessage[]> = Object.fromEntries(
  Object.entries(cardExamples(photo)).map(([screen, example]) => [screen, [
    message({ type: 'user', content: example.ask }, 0),
    message({
      type: 'assistant',
      content: [example.before, '', '```openui-lang', ...example.program, '```', '', example.after].join('\n'),
    }, 1),
  ]]),
);

/**
 * The artifacts, 17 September: a deck and a report in OpenUI's own
 * components, reached from the thread as OpenUI's chip. The programs are
 * the ones the tests check against OpenUI's libraries.
 */
const ARTIFACTS: EngineMessage[] = [
  message({ type: 'user', content: 'make me the board deck for thursday' }, 0),
  message({
    type: 'assistant',
    content: [
      'Nine slides. The numbers are the ones from the September close; the ask is on the last slide.',
      '',
      '```openui-lang',
      'root = SlideShow("Q4 Board Update", "Spaire, September 2026", [s1, s2, s3, s4, s5, s6, s7, s8, s9])',
      `s1 = Slide("s1", StandardTitle("Q4 Board Update", "Where we are, and what we ask of you", "September 2026", {src: "${photo('board')}", alt: "The team"}, "image-right"))`,
      `s2 = Slide("s2", HeroMetric("\u20ac1.2M", "Annual recurring revenue, up 38% on the quarter", "horizontal", "${photo('hero-market')}"))`,
      's3 = Slide("s3", ChartWithMetrics("Revenue by month", [{metric: "\u20ac104k", description: "September, monthly recurring"}, {metric: "38%", description: "Quarter on quarter"}, {metric: "11", description: "Contracts in signature"}], BarChartV2({data: {labels: ["Apr", "May", "Jun", "Jul", "Aug", "Sep"], series: [{category: "MRR", values: [61, 66, 72, 84, 93, 104]}]}, unit: "k"})))',
      `s4 = Slide("s4", VisualCards("Three things that moved", [{title: "Pipeline", body: "42 qualified conversations, 11 in contract", imageSrc: "${photo('pipeline')}"}, {title: "Churn", body: "Two logos lost, both under \u20ac5k", imageSrc: "${photo('meta')}"}, {title: "Hiring", body: "Two engineers start in October", imageSrc: "${photo('hiring')}"}]))`,
      `s5 = Slide("s5", ContentWithImage("Where the growth came from", ["${photo('google')}"], "Cloud and the OHADA desk carried the quarter. Two of the three largest deals came through partners we signed in May.", "image-right"))`,
      's6 = Slide("s6", KeyInfoWithTitle("What the next quarter needs", [{title: "Two engineers", description: "Start in October; both on the desk"}, {title: "One sales lead", description: "Francophone Africa, based in Abidjan"}, {title: "The round", description: "Series A opened in January"}], "horizontal-grid"))',
      `s7 = Slide("s7", SectionBreakDramatic("What we ask", "Two decisions, both before the January board.", "horizontal", "${photo('tokyo-night')}"))`,
      's8 = Slide("s8", NumberedKeyPoint([{title: "Approve the Series A timeline", body: "Open the round in January, close by April"}, {title: "Confirm the hiring plan", body: "Six roles by March, two already offered"}]))',
      's9 = Slide("s9", PullQuote("The quarter we stopped explaining what Caisra is and started being asked for it.", "Bass Fall, founder", "title-center"))',
      '```',
      '',
      'Say if you want the churn slide softened, or the quote out.',
    ].join('\n'),
  }, 1),
  message({ type: 'user', content: 'and a report card on big tech 2025 against the s&p' }, 2),
  message({
    type: 'assistant',
    content: [
      '```openui-lang',
      'root = ReportView("Big Tech 2025 Report Card", "Meta, Microsoft, Netflix, and Google versus the S&P 500", [p1, p2, p3, p4])',
      `p1 = Page("p1", StandardFrontPage("Big Tech 2025 Report Card", "${photo('hero-market')}", TextContent("An executive comparison of four technology and media leaders, the forces behind their 2025 returns, and the signals that could shape their relative position in 2026. Full-year price return review, data as of Dec. 31, 2025. For demonstration only, not investment advice."), "Meta, Microsoft, Netflix, and Google versus the S&P 500", "title-top"))`,
      'p2 = Page("p2", ContentPage([h2, k2, c2, t2]))',
      'h2 = Headline("The scoreboard", "Price returns for the year, against the index", "medium")',
      'k2 = KeyMetrics("row", [{title: "Google", text: "+65%"}, {title: "Microsoft", text: "+14.5%"}, {title: "Meta", text: "+10%"}, {title: "Netflix", text: "+5%"}, {title: "S&P 500", text: "+16%"}])',
      'c2 = BarChartV2({data: {labels: ["GOOGL", "MSFT", "META", "NFLX", "S&P 500"], series: [{category: "2025 price return, %", values: [65, 14.5, 10, 5, 16]}]}}, "grouped", false, "", "Return, %")',
      't2 = TextContent("Google was the only one of the four to beat the benchmark by a wide margin. Microsoft tracked the index; Meta and Netflix finished below it despite strong operating results.")',
      'p3 = Page("p3", ContentPage([h3, v3]))',
      'h3 = Headline("What drove the performance spread", "Each company entered 2025 with a different earnings narrative and investor expectation level.", "medium")',
      `v3 = VisualCards([{title: "Google: AI and Cloud re-rating (+65%)", body: "Gemini adoption, Cloud acceleration and search resilience produced a 65% gain, its best year since 2009, driven by a second-half surge.", imageSrc: "${photo('google')}"}, {title: "Microsoft: steady AI monetisation (+14.5%)", body: "Azure cloud growth and enterprise Copilot adoption kept Microsoft close to the index. Total return sat marginally above the benchmark.", imageSrc: "${photo('microsoft')}"}, {title: "Netflix: stronger business, softer stock (+5%)", body: "Revenue grew 16% to $45.2B and margin expanded to 29.5%, yet valuation and M&A noise weighed on returns.", imageSrc: "${photo('netflix')}"}, {title: "Meta: ad strength vs capex intensity (+10%)", body: "AI advertising drove solid engagement, but very large capital expenditure commitments for AI infrastructure created near-term return concerns.", imageSrc: "${photo('meta')}"}])`,
      'p4 = Page("p4", ContentPage([h4, tb4, t4, n4]))',
      'h4 = Headline("The path mattered as much as the destination", "Key turning points in each company\u2019s 2025 trajectory.", "medium")',
      'tb4 = Table([Column("Quarter"), Column("Key event"), Column("Market reaction"), Column("Cumulative leaders")], [["Q1 2025", "Tariff shock; S&P 500 dropped 16% from peak; GOOGL hit year low in April", "Broad tech sell-off; all five names declined", "All negative from start of year"], ["Q2 2025", "Tariff pause and trade deals; AI earnings beats; Gemini momentum builds", "GOOGL begins strong recovery, up over 100% from April low by year-end", "GOOGL breaks out"], ["Q3 2025", "Netflix Q2 earnings: 325M members; Meta ad revenue solid", "NFLX and META stabilise; MSFT steady on Azure growth", "GOOGL, MSFT near benchmark"], ["Q4 2025", "GOOGL Q3 AI-led earnings beat; Netflix WBD acquisition announced Dec 5", "GOOGL surges to +65% for the year; NFLX and META lag", "GOOGL clear leader"]])',
      't4 = TextContent("Google\u2019s outperformance was concentrated in the second half after AI product announcements and strong Cloud earnings drove a rerating. Netflix\u2019s strong operating results did not translate into benchmark-beating stock performance. Microsoft tracked close to the index throughout the year. Meta recovered from the tariff lows but finished below the benchmark.")',
      'n4 = TextContent("Sources: StatMuse Money, averageannualreturn.com, CNBC, SlickCharts, SPY Yahoo Finance. A full monthly return chart would require verified adjusted-close price series for all five instruments.")',
      '```',
      '',
      'Four pages: the front, the scoreboard, what drove it, and the quarter by quarter. The figures are the ones you gave me; I have not added any.',
    ].join('\n'),
  }, 3),
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

const CHOICE_MANY: ThreadItem[] = [
  {
    kind: ThreadItemKind.Choice, id: 'choice:req-many:0',
    text: 'What is Chandler Bing\'s job for most of the Friends series?',
    options: [
      { key: 'A', label: 'Stockbroker' },
      { key: 'B', label: 'IT procurement manager' },
      { key: 'C', label: 'Hotel manager' },
      { key: 'D', label: 'Advertising executive' },
    ],
    at: at(8),
  },
  {
    kind: ThreadItemKind.Choice, id: 'choice:req-many:1',
    text: 'Which file should I start from?',
    options: [
      { key: 'A', label: 'Q4 Model v3.xlsx', hint: 'The one I filed this morning' },
      { key: 'B', label: 'Q4 Model v2.xlsx', hint: 'Still in Board / 2026' },
    ],
    at: at(8),
  },
  {
    kind: ThreadItemKind.Choice, id: 'choice:req-many:2',
    text: 'Flag the two slides now, or put them in a note after?',
    options: [
      { key: 'A', label: 'Now' },
      { key: 'B', label: 'In a note after' },
    ],
    at: at(8),
  },
];

// Built from the catalogue, as the app builds them, so the names, lines
// and logos on film are the real ones.
const connector = (id: string, connectionId: string, state: ConnectorCardState & { reason?: string } = {}): ThreadItem => {
  const { reason, ...rest } = state;
  const item = connectorItem({ requestId: id, connectionId, ...(reason ? { reason } : {}) }, rest, at(8));
  if (!item) throw new Error(`no such connector: ${connectionId}`);
  return item;
};
const CONNECTORS: ThreadItem[] = [
  connector('c1', 'linkedin', { reason: 'To pull the three profiles you asked about.' }),
  connector('c2', 'gmail', { busy: true }),
  connector('c3', 'notion', { resolved: ConnectorOutcome.Connected }),
  connector('c4', 'todoist', { resolved: ConnectorOutcome.Declined }),
  connector('c5', 'outlook', { resolved: ConnectorOutcome.Failed, failure: 'Outlook said no to that account.' }),
];

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
    // Stamped when it lands: a reply is only staged if it was said after
    // the conversation was opened, which is what "arrived" means.
    const timer = window.setTimeout(() => setExtra([{ ...LATER_REPLY, timestamp: Date.now() }]), 600);
    return () => window.clearTimeout(timer);
  }, []);
  const items = toThreadItems([...CONVERSATION.slice(0, 8), ...extra], {
    agentId: 'juno', agentName: 'Juno',
  });
  // The row follows the conversation, as the app's does: the moment the
  // reply is final its last line is the preview — and the shell is what
  // holds that back until the last bubble is down.
  const agents = AGENTS.map(agent => (agent.id === 'juno' && extra.length
    ? { ...agent, preview: 'Want me to open it?', when: '9:15 AM' }
    : agent));
  return (
    <MessagesShell
      agents={agents} activeId="juno" activeName="Juno" items={items}
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
  if (screen === 'onboarding') {
    // Yodo's first step, with a Mac stood in for: the status says Notes
    // and the appearance can be done, a run answers after a moment.
    // `harness/onboarding-walk.mjs` walks it and photographs each stage.
    const bridge: OnboardingBridge = {
      status: async () => ({ platform: 'darwin', appearance: 'light', available: ['notes', 'appearance'] }),
      runTask: async task => {
        await new Promise(resolve => setTimeout(resolve, 600));
        return { ok: true, task, ref: task === 'appearance' ? 'dark' : 'x-coredata://harness/ICNote/p1' };
      },
      openResult: async () => undefined,
    };
    return <Onboarding userName="Bass" bridge={bridge} onDone={noop} />;
  }
  const composing = screen === 'compose';

  const withAuth = screen === 'auth' || screen === 'thread';
  const items = toThreadItems(screen === 'files' ? PACK : CARD_SCREENS[screen] ?? (screen === 'artifacts' ? ARTIFACTS : CONVERSATION), {
    agentId: 'juno',
    agentName: 'Juno',
    pending: withAuth ? PENDING : [],
    deviceId: '6c0f8fd9-7d6d-439b-83e2-0d53f8b8542f',
    files: [{ name: 'Q4 Model v2.xlsx', path: '/Users/bass/Board/2026/Q4 Model v2.xlsx' }],
  });
  if (screen === 'choice') items.push(CHOICE);
  // Several questions in one request: one card, walked with the chevrons.
  if (screen === 'choice-many') items.push(...CHOICE_MANY);
  // An agent proposing a connector, in every state the card has: asking,
  // connecting, installed, declined, failed.
  if (screen === 'connector') items.push(...CONNECTORS);
  // Yodo asking to stand up an agent: the permission card with the brief
  // behind its disclosure and Stand up / Not now, exactly as the app
  // draws it from a live request.
  if (screen === 'staffing') {
    items.push(staffingItem({
      requestId: 'req-staff-1',
      name: 'Projects Manager',
      label: 'Project ops',
      job: 'Runs your projects from one board; specialists claim the tasks.',
      antiJobs: ["Won't do the specialist work itself", "Won't start a project you didn't ask for"],
      voice: 'Short and decision-shaped.',
    }, 'Yodo', at(8)));
  }
  // "Your starter team": the roster card of step two, built from the
  // founder's table for a founder, exactly as the bridge builds it.
  if (screen === 'roster') {
    const roster = buildRoster({ workType: 'Founder / Business Owner' });
    if (typeof roster === 'string') throw new Error(roster);
    items.push(rosterItem({ requestId: 'req-roster-1', ...roster }, at(8)));
  }

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
      roster={{ onStandUp: noop, onSomethingElse: noop, onDecline: noop }}
      connector={{ onInstall: noop, onDecline: noop }}
      // So a file card draws its save button, which only exists when
      // there is something to save with.
      parts={{ onOpenFile: noop, onSaveCopy: noop }}
      onSelect={noop}
      onSend={noop}
      composing={composing}
      onCompose={noop}
      onCloseCompose={noop}
      onPickAgent={noop}
      onCreateAgent={noop}
      onApps={noop}
      apps={screen.startsWith('apps') ? (
        <Apps
          // `apps` and `apps-adding` open on Plugins; `apps-agents` on the
          // Agents tab; `apps-agent` on the Engineering Lead's page.
          initialTab={screen === 'apps-agents' || screen === 'apps-agent' ? AppsTab.Agents : AppsTab.Plugins}
          {...(screen === 'apps-agent' ? { initialRoleId: 'engineering-lead' } : {})}
          connections={{
            // Two connected, one mid-flight and one that just failed, so
            // every state of a row is on screen at once.
            connected: new Set(['notion', 'todoist']),
            busyId: screen === 'apps-adding' ? 'stripe' : undefined,
            failure: screen === 'apps-adding'
              ? undefined
              : { id: 'otter', message: 'Otter.ai said no to that account.' },
            onConnect: noop,
            onDisconnect: noop,
          }}
          available={PRESET_AGENTS}
          // One already here, so both states of a row are on screen at
          // once: the button, and the word that replaces it.
          installedIds={new Set(['engineering-lead'])}
          busyId={screen === 'apps-adding' ? 'design-lead' : undefined}
          onInstall={noop}
          onUse={noop}
          onClose={noop}
        />
      ) : undefined}
      onOpenAgent={noop}
      // The third column: the agent panel, plain or with the delete
      // question already asked (the sidebar's trash), so the two- and
      // three-column layouts are both on film.
      agentPanel={screen === 'panel' || screen === 'panel-delete' ? (
        <AgentPanel
          agent={{ id: 'juno', name: 'Juno', label: 'Reads the long things', description: 'Reads decks, models and memos before you have to, and says what does not add up.', avatar: 3, notify: true }}
          asking={screen === 'panel-delete'}
          onDelete={noop}
          onChange={noop}
          onClose={noop}
        />
      ) : undefined}
      agentDetail={screen.startsWith('agent-') ? (
        <AgentDetail
          detail={agentDetailFixture(screen.slice('agent-'.length) as AgentTab)}
          agentId="juno"
          agentName="Juno"
          onClose={noop}
        />
      ) : undefined}
      // Settings fills the pane, as the 17 September canvas has it; every
      // row the app can draw (`appUiMap.ts`'s fullest input). The select
      // opens in a portal; `harness/settings-open.mjs` clicks it and
      // photographs the result.
      settings={screen === 'settings' ? (
        <Settings {...EVERY_ROW} accountName="Bass Fall" onClose={noop} />
      ) : undefined}
      onAccount={noop}
      accountMenu={screen === 'account' || screen === 'account-spent' ? (
        <AccountMenu
          quota={screen === 'account-spent'
            ? { planName: 'Trial', creditsLimit: 100, creditsUsed: 100 }
            : { planName: 'Trial', creditsLimit: 100, creditsUsed: 74 }}
          onSettings={noop}
          onSupport={noop}
          onAddAccount={noop}
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

// `live` is the whole app on the real store, not a screen of fixtures;
// it installs its own bridge before anything that reads it is imported.
if (new URLSearchParams(location.search).get('screen') === 'live') {
  void import('./live-app');
} else {
  createRoot(document.getElementById('root')!).render(<Screens />);
}
