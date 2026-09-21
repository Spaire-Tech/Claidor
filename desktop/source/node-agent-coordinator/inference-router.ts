import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { runRoutedProviderText } from "../host/extensions/inference/provider-session.js";
import {
  resolveProductInferenceProvider,
  routesClaidorThroughHost,
  SAND_CLAIDOR_FULL_AGENT_ENV,
  SAND_INFERENCE_PROVIDERS,
  type SandInferenceProvider,
} from "../shared/inference-router.js";
import { SandSettingsStore } from "../shared/node/settings/sand-settings-store.js";
import {
  buildCaisraProductSystemPrompt,
  CAISRA_SENDMESSAGE_RETRY_PROMPT,
  CAISRA_USER_REPLY_REMINDER,
  executeGrokBotTool,
  GROK_BOT_TOOLS,
  isGrokBotToolName,
} from "../shared/grok-bot-tools.js";
import { createRoutedMcpBridge } from "./routed-mcp-bridge.js";

type StoredEntry = {
  readonly provider: Exclude<SandInferenceProvider, "cursor">;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly richText?: string;
  readonly message?: Record<string, unknown>;
  readonly id: string;
  readonly clientNonce?: string;
  readonly reactions?: readonly { readonly emoji: string; readonly by: string }[];
  readonly respondedValue?: string;
  readonly hidden?: true;
  readonly timestampMs: number;
};
type Store = { readonly schemaVersion: 2; readonly agents: Readonly<Record<string, readonly StoredEntry[]>> };

const EMPTY_STORE: Store = { schemaVersion: 2, agents: {} };
// Every provider the router can run locally. Derived from the shared list so a
// provider added there cannot be silently dropped from stored history here.
const STORED_PROVIDERS: readonly string[] = SAND_INFERENCE_PROVIDERS.filter(provider => provider !== "cursor");

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value != null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parseInferenceRouterTranscriptStore(value: unknown): Store {
  const root = asRecord(value);
  if (root?.schemaVersion !== 2 || asRecord(root.agents) == null) return EMPTY_STORE;
  const agents: Record<string, StoredEntry[]> = {};
  for (const [agentId, rawEntries] of Object.entries(root.agents as Record<string, unknown>)) {
    if (!Array.isArray(rawEntries)) continue;
    const entries: StoredEntry[] = [];
    for (const raw of rawEntries) {
      const row = asRecord(raw);
      if (row == null || !STORED_PROVIDERS.includes(String(row.provider)) || !["user", "assistant"].includes(String(row.role)) || typeof row.content !== "string" || typeof row.id !== "string" || typeof row.timestampMs !== "number" || (row.clientNonce !== undefined && typeof row.clientNonce !== "string") || (row.richText !== undefined && typeof row.richText !== "string") || (row.message !== undefined && asRecord(row.message) == null) || (row.respondedValue !== undefined && typeof row.respondedValue !== "string") || (row.hidden !== undefined && row.hidden !== true)) continue;
      if (row.reactions !== undefined && (!Array.isArray(row.reactions) || row.reactions.some(reaction => asRecord(reaction) == null || typeof asRecord(reaction)!.emoji !== "string" || typeof asRecord(reaction)!.by !== "string"))) continue;
      entries.push(row as unknown as StoredEntry);
    }
    agents[agentId] = entries.slice(-200);
  }
  return { schemaVersion: 2, agents };
}

export function projectInferenceRouterTranscriptEntry(entry: StoredEntry): Record<string, unknown> {
  return entry.role === "user"
    ? { kind: "message", id: entry.id, role: "user", content: entry.content, ...(entry.richText === undefined ? {} : { richText: entry.richText }), isStreaming: false, timestampMs: entry.timestampMs, ...(entry.clientNonce === undefined ? {} : { clientNonce: entry.clientNonce }), ...(entry.reactions === undefined ? {} : { reactions: entry.reactions }) }
    : { kind: "send-message", id: entry.id, message: entry.message ?? { type: "text", content: entry.content }, timestampMs: entry.timestampMs, ...(entry.respondedValue === undefined ? {} : { respondedValue: entry.respondedValue }), ...(entry.reactions === undefined ? {} : { reactions: entry.reactions }) };
}

export { SAND_CLAIDOR_FULL_AGENT_ENV, routesClaidorThroughHost };
// Optional box reads (transcript tail, roster) must not stall a Mac-local turn
// while Docker is pulling or the host is waiting for a credential.
export const BOX_OPTIONAL_WAIT_MS = 800;

export function createCoordinatorInferenceRouter(options: {
  readonly dataDir: string;
  readonly postEvent: (family: string, payload: unknown) => void;
  readonly dispatchRemote: (method: string, args: unknown) => Promise<unknown>;
  readonly now?: () => number;
  readonly env?: NodeJS.ProcessEnv;
}) {
  const settings = new SandSettingsStore(join(options.dataDir, "settings.json"));
  const handledLocally = (provider: SandInferenceProvider): provider is Exclude<SandInferenceProvider, "cursor"> =>
    provider !== "cursor" && !(provider === "claidor" && routesClaidorThroughHost(options.env));
  const storePath = join(options.dataDir, "inference-router-transcript.json");
  const now = options.now ?? Date.now;
  const queues = new Map<string, Promise<unknown>>();

  const load = async (): Promise<Store> => {
    try { return parseInferenceRouterTranscriptStore(JSON.parse(await readFile(storePath, "utf8"))); }
    catch { return EMPTY_STORE; }
  };
  const persist = async (store: Store): Promise<void> => {
    await mkdir(dirname(storePath), { recursive: true });
    const temporary = `${storePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, storePath);
  };
  const append = async (agentId: string, entries: readonly StoredEntry[]): Promise<Store> => {
    const current = await load();
    const next: Store = { schemaVersion: 2, agents: { ...current.agents, [agentId]: [...(current.agents[agentId] ?? []), ...entries].slice(-200) } };
    await persist(next);
    return next;
  };
  const emitTranscript = (agentId: string, type: "appended" | "updated", entry: Record<string, unknown>) => options.postEvent("transcript", { type, entry, agentId });
  const beginActivity = async (agentId: string): Promise<() => void> => {
    try {
      const remote = await remoteOrUndefined("listAgents", {});
      if (!Array.isArray(remote)) return () => {};
      const project = (isRunning: boolean) => remote.map(raw => {
        const row = asRecord(raw);
        if (row?.id !== agentId) return raw;
        return { ...row, isRunning, isRunningTurn: isRunning, isComposingMessage: isRunning, isRetrying: false, ...(isRunning ? { currentActivity: { kind: "thinking" } } : { currentActivity: undefined }) };
      });
      const publishRunning = () => options.postEvent("agents", { activeAgentId: agentId, agents: project(true) });
      publishRunning();
      // Transcript refreshes can fetch the remote (idle) roster while a local CLI turn is
      // running. Pulse the locally authoritative state until the turn settles so those
      // refreshes cannot permanently erase the polished renderer's activity surface.
      const pulse = setInterval(publishRunning, 250);
      pulse.unref();
      return () => {
        clearInterval(pulse);
        options.postEvent("agents", { activeAgentId: agentId, agents: project(false) });
      };
    } catch { return () => {}; }
  };
  const toggleLocalReaction = async (agentId: string, entryId: string, emoji: string): Promise<Record<string, unknown> | null> => {
    const trimmed = emoji.trim();
    if (agentId.length === 0 || entryId.length === 0 || trimmed.length === 0) return null;
    const current = await load();
    const entries = current.agents[agentId];
    if (entries == null) return null;
    const index = entries.findIndex(entry => entry.id === entryId);
    if (index < 0) return null;
    const before = entries[index]!;
    const reactions = before.reactions ?? [];
    const exists = reactions.some(reaction => reaction.emoji === trimmed && reaction.by === "me");
    const nextReactions = exists ? reactions.filter(reaction => !(reaction.emoji === trimmed && reaction.by === "me")) : [...reactions, { emoji: trimmed, by: "me" }];
    const { reactions: _oldReactions, ...withoutReactions } = before;
    const updated: StoredEntry = nextReactions.length === 0 ? withoutReactions : { ...withoutReactions, reactions: nextReactions };
    const nextEntries = [...entries];
    nextEntries[index] = updated;
    await persist({ schemaVersion: 2, agents: { ...current.agents, [agentId]: nextEntries } });
    return projectInferenceRouterTranscriptEntry(updated);
  };
  const stampLocalWidgetResponse = async (agentId: string, entryId: string, value: string): Promise<boolean> => {
    if (agentId.length === 0 || entryId.length === 0 || value.length === 0) return false;
    const current = await load();
    const entries = current.agents[agentId];
    if (entries == null) return false;
    const index = entries.findIndex(entry => entry.id === entryId);
    if (index < 0) return false;
    const before = entries[index]!;
    if (before.role !== "assistant" || before.respondedValue != null) return false;
    const widgetType = asRecord(before.message)?.type;
    if (widgetType != null && widgetType !== "widget") return false;
    const updated: StoredEntry = { ...before, respondedValue: value };
    const nextEntries = [...entries];
    nextEntries[index] = updated;
    await persist({ schemaVersion: 2, agents: { ...current.agents, [agentId]: nextEntries } });
    emitTranscript(agentId, "updated", projectInferenceRouterTranscriptEntry(updated));
    return true;
  };
  const visibleLocalEntries = (agentId: string, store: Store): Record<string, unknown>[] =>
    (store.agents[agentId] ?? []).filter(entry => entry.hidden !== true).map(projectInferenceRouterTranscriptEntry);
  // A routed turn runs the model on this machine; the box only contributes the
  // remote transcript tail and the connector tools. When the box is down those
  // contributions are lost, not the turn. A hung box must not stall the turn.
  const remoteOrUndefined = async (method: string, args: unknown): Promise<unknown> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        options.dispatchRemote(method, args),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("box optional wait")), BOX_OPTIONAL_WAIT_MS);
        }),
      ]);
    } catch { return undefined; }
    finally { if (timer !== undefined) clearTimeout(timer); }
  };
  const execute = async (provider: Exclude<SandInferenceProvider, "cursor">, args: Record<string, unknown>) => {
    const agentId = typeof args.agentId === "string" ? args.agentId : "";
    const prompt = typeof args.prompt === "string" ? args.prompt : "";
    const richText = typeof args.richText === "string" ? args.richText : undefined;
    const clientNonce = typeof args.clientNonce === "string" ? args.clientNonce : randomUUID();
    const appendUserMessage = args.appendUserMessage !== false;
    if (agentId.length === 0 || prompt.length === 0) throw new Error("Local inference routing requires an agentId and prompt");
    const timestampMs = now();
    const [remote, beforeUser] = await Promise.all([remoteOrUndefined("getAgentTranscriptTail", { id: agentId }), load()]);
    const remoteEntries = Array.isArray(asRecord(remote)?.entries) ? asRecord(remote)!.entries as unknown[] : [];
    const remoteTurn = remoteEntries.reduce<number>((highest, raw) => {
      const id = asRecord(raw)?.id;
      const match = typeof id === "string" ? /^t(\d+)(?:u|s\d+)$/.exec(id) : null;
      return match == null ? highest : Math.max(highest, Number(match[1]));
    }, -1);
    const localTurn = (beforeUser.agents[agentId] ?? []).reduce((highest, entry) => {
      const match = /^t(\d+)(?:u|s\d+)$/.exec(entry.id);
      return match == null ? highest : Math.max(highest, Number(match[1]));
    }, -1);
    const turn = Math.max(remoteTurn, localTurn) + 1;
    const userEntry = { kind: "message", id: `t${turn}u`, role: "user", content: prompt, ...(richText === undefined ? {} : { richText }), isStreaming: false, timestampMs, clientNonce };
    const withUser = await append(agentId, [{
      provider,
      role: "user",
      content: prompt,
      ...(richText === undefined ? {} : { richText }),
      id: userEntry.id,
      clientNonce,
      timestampMs,
      ...(appendUserMessage ? {} : { hidden: true as const }),
    }]);
    if (appendUserMessage) emitTranscript(agentId, "appended", userEntry);
    const endActivity = await beginActivity(agentId);
    // The shipped transcript intentionally suppresses its activity row as soon as
    // the first streamed assistant entry arrives. Direct providers can produce that
    // first delta in the same renderer reconciliation window as the roster update,
    // making the genuine composing state imperceptible. The shipped virtualized
    // transcript needs roughly 350 ms to materialize its trailing activity row,
    // so keep the composing state authoritative long enough for a clearly
    // perceptible rendered interval before normal token streaming begins.
    await new Promise<void>(resolve => setTimeout(resolve, 1_200));
    const roster = await remoteOrUndefined("listAgents", {});
    const self = Array.isArray(roster)
      ? roster.map(asRecord).find(row => row?.id === agentId)
      : null;
    const systemPrompt = buildCaisraProductSystemPrompt({
      agentId,
      ...(typeof self?.name === "string" ? { name: self.name } : {}),
      ...(typeof self?.description === "string" ? { description: self.description } : {}),
    });
    const history = (withUser.agents[agentId] ?? []).map((entry, index, rows) => (
      entry.role === "user" && index === rows.length - 1
        ? { role: entry.role, content: `${entry.content}\n\n${CAISRA_USER_REPLY_REMINDER}` }
        : { role: entry.role, content: entry.content }
    ));
    const messages = [{ role: "system" as const, content: systemPrompt }, ...history];
    const assistantTimestampMs = now();
    let sendIndex = 0;
    const emitSendMessage = async (message: Record<string, unknown>): Promise<string> => {
      if (message.type === "widget") {
        try {
          const result = asRecord(await options.dispatchRemote("appendSendMessage", { agentId, message }));
          const id = typeof result?.id === "string" ? result.id : `t${turn}s${sendIndex}`;
          sendIndex += 1;
          return id;
        } catch {
          // Host transcript is required for widget replies. Fall through to local so the card still paints.
        }
      }
      const id = `t${turn}s${sendIndex++}`;
      const content = typeof message.content === "string" ? message.content : "";
      await append(agentId, [{ provider, role: "assistant", content, message, id, timestampMs: assistantTimestampMs }]);
      emitTranscript(agentId, "appended", { kind: "send-message", id, message, timestampMs: assistantTimestampMs });
      return id;
    };
    const bridge = provider === "claude-code" ? await createRoutedMcpBridge({
      listTools: () => remoteOrUndefined("listRoutedMcpTools", {}),
      callTool: tool => options.dispatchRemote("executeRoutedMcpTool", { ...tool, agentId }),
    }) : null;
    const directTools = bridge == null ? await remoteOrUndefined("listRoutedMcpTools", {}) : undefined;
    const tools = [...GROK_BOT_TOOLS, ...(Array.isArray(directTools) ? directTools as Record<string, any>[] : [])];
    const runTurn = async (turnMessages: typeof messages) => runRoutedProviderText(provider, turnMessages, bridge == null ? {
      tools,
      executeTool: async (definition, toolArgs, toolCallId) => {
        if (typeof definition.name === "string" && isGrokBotToolName(definition.name)) {
          return await executeGrokBotTool(definition.name, toolArgs, {
            agentId,
            dispatchRemote: options.dispatchRemote,
            emitSendMessage,
          });
        }
        return await options.dispatchRemote("executeRoutedMcpTool", {
          providerIdentifier: definition.providerIdentifier,
          name: definition.name,
          toolName: definition.toolName,
          args: toolArgs,
          toolCallId,
          agentId,
        });
      },
    } : { mcpServerUrl: bridge.url, tools: GROK_BOT_TOOLS, executeTool: async (definition, toolArgs) => {
      if (typeof definition.name === "string" && isGrokBotToolName(definition.name)) {
        return await executeGrokBotTool(definition.name, toolArgs, {
          agentId,
          dispatchRemote: options.dispatchRemote,
          emitSendMessage,
        });
      }
      return undefined;
    } });
    let content = "";
    try {
      content = await runTurn(messages);
      if (sendIndex === 0) {
        content = await runTurn([
          ...messages,
          ...(content.trim().length > 0 ? [{ role: "assistant" as const, content }] : []),
          { role: "user" as const, content: `${CAISRA_SENDMESSAGE_RETRY_PROMPT}\n\n${CAISRA_USER_REPLY_REMINDER}` },
        ]);
      }
    } finally { endActivity(); await bridge?.close(); }
    if (sendIndex === 0) {
      const fallback = content.trim();
      if (fallback.length > 0) await emitSendMessage({ type: "text", content: fallback });
    }
    return { accepted: true, clientNonce, provider };
  };

  return {
    provider(): SandInferenceProvider { return resolveProductInferenceProvider(options.env ?? process.env); },
    async dispatch(method: string, args: unknown): Promise<{ handled: boolean; value?: unknown }> {
      const provider = resolveProductInferenceProvider(options.env ?? process.env);
      if (method === "reactToMessage") {
        const record = asRecord(args) ?? {};
        const agentId = typeof record.agentId === "string" ? record.agentId : "";
        const entryId = typeof record.entryId === "string" ? record.entryId : "";
        const emoji = typeof record.emoji === "string" ? record.emoji : "";
        const updated = await toggleLocalReaction(agentId, entryId, emoji);
        if (updated != null) {
          emitTranscript(agentId, "updated", updated);
          return { handled: true, value: undefined };
        }
      }
      if (handledLocally(provider) && ["getAgentTranscriptTail", "openAgentTail", "getAgentTranscriptWindow"].includes(method)) {
        const record = asRecord(args) ?? {};
        const agentId = typeof record.id === "string" ? record.id : "";
        const [remote, local] = await Promise.all([remoteOrUndefined(method, args), load()]);
        const result = asRecord(remote) ?? { entries: [] };
        if (!Array.isArray(result.entries) || agentId.length === 0) return { handled: true, value: remote };
        const entries = [...result.entries, ...visibleLocalEntries(agentId, local)];
        const limit = typeof record.limit === "number" && Number.isInteger(record.limit) && record.limit > 0 ? record.limit : 500;
        return { handled: true, value: { ...result, entries: entries.slice(-limit) } };
      }
      const queueExecute = (localProvider: Exclude<SandInferenceProvider, "cursor">, record: Record<string, unknown>) => {
        const agentId = typeof record.agentId === "string" ? record.agentId : "";
        const previous = queues.get(agentId) ?? Promise.resolve();
        const next = previous.catch(() => undefined).then(() => execute(localProvider, record)).catch(async (error) => {
          const timestampMs = now();
          const content = `Router error: ${error instanceof Error ? error.message : String(error)}`;
          if (agentId.length > 0) {
            const id = `t${Date.now()}s0`;
            await append(agentId, [{ provider: localProvider, role: "assistant", content, id, timestampMs }]);
            emitTranscript(agentId, "appended", { kind: "send-message", id, message: { type: "text", content }, timestampMs });
          }
        });
        const queued = next.finally(() => { if (queues.get(agentId) === queued) queues.delete(agentId); });
        queues.set(agentId, queued);
        void queued;
      };
      if (method === "respondToWidget" && handledLocally(provider)) {
        const record = asRecord(args) ?? {};
        const agentId = typeof record.agentId === "string" ? record.agentId : "";
        const entryId = typeof record.entryId === "string" ? record.entryId : "";
        const value = typeof record.value === "string" ? record.value.trim() : "";
        if (agentId.length === 0 || entryId.length === 0 || value.length === 0) {
          return { handled: true, value: { accepted: false } };
        }
        // Stamp the card on the host without starting a Docker / Claude Code turn.
        await remoteOrUndefined("respondToWidget", { entryId, value, agentId, skipTurn: true });
        await stampLocalWidgetResponse(agentId, entryId, value);
        queueExecute(provider, { agentId, prompt: value, appendUserMessage: false });
        return { handled: true, value: { accepted: true } };
      }
      if (method !== "sendPrompt" || !handledLocally(provider)) return { handled: false };
      const record = asRecord(args) ?? {};
      queueExecute(provider, record);
      return { handled: true, value: { accepted: true, clientNonce: record.clientNonce, provider } };
    },
  };
}
