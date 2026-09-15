/**
 * The app, live, in a browser: the real `FaiserApp` on the real store,
 * with the only thing that does not exist here — the Electron bridge —
 * stood in for by a fixture.
 *
 * The other screens mount `MessagesShell` with fixture data and prove the
 * drawing. This mounts the whole thing above it — `useMessagesShell`, the
 * services, Redux — and proves the wiring: that a click on a file the
 * agent made opens the computer panel on its preview, and that deleting
 * an agent takes that agent's conversation and nobody else's. Both were
 * reported broken from a built app; neither could be run by a test that
 * mounts a component.
 *
 * `window.electron` is a Proxy. Every method the flows need is written
 * out below against the preload's own shapes; anything else answers with
 * `undefined` (or a no-op unsubscribe, for a listener) and is logged, so
 * the script can print what the app reached for that the fixture did not
 * know. `__CALLS__` records what was asked of the operating system.
 */

import '../src/renderer/index.css';

const CWD = '/Users/bass/faiser/project';
const DOCX = `${CWD}/Gym Routine.docx`;

const at = (minutes: number): number => Date.parse('2026-03-10T09:00:00Z') + minutes * 60_000;

interface FixtureAgent {
  id: string; name: string; description: string; icon: string; model: string;
  enabled: boolean; isDefault: boolean; source: string; skillIds: string[];
  createdAt: number; avatar: number; label: string; voiceId: string; notify: boolean;
  systemPrompt: string;
}

const agent = (
  id: string, name: string, avatar: number, description = '', isDefault = false,
): FixtureAgent => ({
  id, name, description, icon: '', model: '', enabled: true, isDefault,
  source: isDefault ? 'default' : 'custom', skillIds: [], createdAt: at(-60),
  avatar, label: '', voiceId: '', notify: true, systemPrompt: `You are ${name}.`,
});

interface FixtureMessage { id: string; type: string; content: string; timestamp: number }
interface FixtureSession {
  id: string; agentId: string; title: string; lastMessage: string;
  updatedAt: number; messages: FixtureMessage[];
}

const msg = (id: string, type: string, content: string, minute: number): FixtureMessage =>
  ({ id, type, content, timestamp: at(minute) });

const state = {
  agents: [
    agent('main', 'Main', 3, 'The first agent', true),
    agent('juno', 'Juno', 7, 'Reads the long things'),
    agent('mira', 'Mira', 11, 'Runs the inbox'),
  ],
  sessions: [
    {
      id: 's-main', agentId: 'main', title: 'Main', lastMessage: 'Standing by.', updatedAt: at(1),
      messages: [msg('m1', 'user', 'Are you there?', 0), msg('m2', 'assistant', 'Standing by.', 1)],
    },
    {
      id: 's-juno', agentId: 'juno', title: 'Gym routine', updatedAt: at(10),
      lastMessage: `Done. Here it is: [Gym Routine.docx](file://${encodeURI(DOCX)})`,
      messages: [
        msg('j1', 'user', 'make me a gym routine as a word document', 8),
        msg('j2', 'assistant', `Done. Here it is: [Gym Routine.docx](file://${encodeURI(DOCX)})`, 10),
      ],
    },
    {
      // Three paragraphs, so the reply is three bubbles: opening this
      // conversation must show all three at once, not perform them.
      id: 's-mira', agentId: 'mira', title: 'Inbox', updatedAt: at(5),
      lastMessage: 'Cleared the promotions.\n\nFourteen need you.\n\nTwo look urgent.',
      messages: [
        msg('r1', 'user', 'clear my inbox', 4),
        msg('r2', 'assistant', 'Cleared the promotions.\n\nFourteen need you.\n\nTwo look urgent.', 5),
      ],
    },
  ] as FixtureSession[],
};

const summary = (session: FixtureSession) => ({
  id: session.id, title: session.title, lastMessage: session.lastMessage,
  scheduledTaskId: null, status: 'completed', pinned: false, agentId: session.agentId,
  createdAt: session.updatedAt - 60_000, updatedAt: session.updatedAt,
});

const full = (session: FixtureSession) => ({
  ...summary(session),
  claudeSessionId: null, cwd: CWD, systemPrompt: '', modelOverride: '',
  executionMode: 'auto', activeSkillIds: [], messages: session.messages,
  messagesOffset: 0, totalMessages: session.messages.length,
});

const calls: Record<string, unknown[][]> = {};
const unknown: string[] = [];
const record = (name: string, args: unknown[]): void => {
  (calls[name] ??= []).push(args);
};

declare global {
  interface Window {
    __HARNESS__?: { docxDataUrl?: string };
    __CALLS__: Record<string, unknown[][]>;
    __UNKNOWN__: string[];
    electron: unknown;
  }
}
window.__CALLS__ = calls;
window.__UNKNOWN__ = unknown;

const unsubscribe = (): (() => void) => () => undefined;

/** The bridge methods these two flows reach, in the preload's shapes. */
const explicit: Record<string, unknown> = {
  platform: 'darwin',
  'agents.list': async () => state.agents.map(one => ({ ...one })),
  'agents.get': async (id: string) => state.agents.find(one => one.id === id) ?? null,
  'agents.presetTemplates': async () => [],
  'agents.presets': async () => [],
  'agents.delete': async (id: string) => {
    record('agents.delete', [id]);
    const before = state.agents.length;
    state.agents = state.agents.filter(one => one.id !== id || one.isDefault);
    state.sessions = state.sessions.filter(one => one.agentId !== id);
    return state.agents.length < before;
  },
  'cowork.listSessions': async (options?: { agentId?: string }) => {
    record('cowork.listSessions', [options]);
    const list = state.sessions.filter(one => !options?.agentId || one.agentId === options.agentId);
    return { success: true, sessions: list.map(summary), hasMore: false };
  },
  'cowork.getSession': async (id: string) => {
    const session = state.sessions.find(one => one.id === id);
    return session ? { success: true, session: full(session) } : { success: false, error: 'no such session' };
  },
  'cowork.getConfig': async () => ({
    success: true,
    config: { workingDirectory: CWD, systemPrompt: '', executionMode: 'auto', agentEngine: 'openclaw' },
  }),
  'rooms.list': async () => [],
  'library.recordCandidates': async () => ({ success: true }),
  'appInfo.getVersion': async () => '0.0.0-harness',
  'appInfo.getComputerName': async () => 'Bass’s MacBook',
  'dialog.readFileAsDataUrl': async (filePath: string) => {
    record('dialog.readFileAsDataUrl', [filePath]);
    if (filePath === DOCX && window.__HARNESS__?.docxDataUrl) {
      return { success: true, dataUrl: window.__HARNESS__.docxDataUrl };
    }
    return { success: false, error: 'ENOENT' };
  },
  'dialog.statFile': async (filePath: string) => ({ success: filePath === DOCX, isFile: filePath === DOCX }),
  'shell.openPath': async (filePath: string) => {
    record('shell.openPath', [filePath]);
    return { success: true };
  },
  'shell.showItemInFolder': async (filePath: string) => {
    record('shell.showItemInFolder', [filePath]);
    return { success: true };
  },
};

function fake(path: readonly string[]): unknown {
  const target = function stub(): void { /* replaced by the apply trap */ };
  return new Proxy(target, {
    get(_target, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      const key = [...path, prop].join('.');
      if (key in explicit) return explicit[key];
      return fake([...path, prop]);
    },
    apply(_target, _this, args) {
      const key = path.join('.');
      unknown.push(key);
      const name = path[path.length - 1] ?? '';
      if (/^on[A-Z]/.test(name)) return unsubscribe();
      // A listener's cleanup, or nothing. `args` is kept for the log only.
      void args;
      return Promise.resolve(undefined);
    },
  });
}

window.electron = fake([]);

async function mount(): Promise<void> {
  // After the bridge exists, never before: the services read it on import.
  const [{ createRoot }, { Provider }, { store }, { setLoggedIn }, { FaiserApp }] = await Promise.all([
    import('react-dom/client'),
    import('react-redux'),
    import('../src/renderer/store'),
    import('../src/renderer/store/slices/authSlice'),
    import('../src/renderer/design/shell/FaiserApp'),
  ]);
  store.dispatch(setLoggedIn({
    user: { id: 'u1', nickname: 'Bass Fall' } as never,
    quota: null,
    ownerAccountKey: 'harness',
  }));
  createRoot(document.getElementById('root')!).render(
    <Provider store={store}>
      <FaiserApp />
    </Provider>,
  );
}

void mount();
