import { artifactKindOf } from '../../../shared/artifacts/constants';
import { splitCardSegments } from '../../../shared/cards/fence';
import { extractUserMessageFileAttachments } from '../../utils/userMessageFileAttachments';
import { peelAttachments } from './attachment';
import { splitReply } from './details';
import type { KnownFile } from './parts';
import { verbForTool } from './toolVerbs';
import {
  type AuthItem,
  type CardItem,
  type ChoiceItem,
  type ChoiceOutcome,
  Speaker,
  type StatusItem,
  type TextItem,
  type ThreadItem,
  ThreadItemKind,
} from './types';

/**
 * The engine's messages, turned into the five things a thread may show.
 *
 * This is where most of the design's discipline actually lives. The
 * engine emits thinking blocks, tool calls, tool results, streaming
 * partials, token counts and errors; the design has a bubble, a grey
 * line, a shimmer, a question and a permission. Everything else is
 * dropped here, on purpose, and this file is the one place to argue about
 * what a person sees.
 *
 * What is dropped, and why:
 *
 * | Engine | Becomes | Why |
 * |---|---|---|
 * | `assistant` with `isThinking` | nothing | The design has no thinking block. Watching a model think is not company. |
 * | `tool_use` | a `status` | One shimmering verb. Never the tool's name. |
 * | `tool_result` | nothing | It ends the status. Its content is the agent's to summarise in its own words, not ours to dump. |
 * | an empty `assistant` | nothing | A bubble with nothing in it is a bug wearing a design. |
 *
 * What is kept but changed:
 *
 * - **Errors become `system` lines**, not red banners. A failure is
 *   something that happened, said plainly and centred, in the same place
 *   as "Perrin can run commands from now on". A banner would be the only
 *   shouting in an app that never shouts.
 * - **A long reply becomes up to three short bubbles.** "The text come
 *   like texts. not ai." A four-paragraph memo is split on blank lines
 *   and the rest is kept in the last bubble rather than thrown away.
 */

/** The engine's message, as the renderer already types it. */
export interface EngineMessage {
  id: string;
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    toolName?: string;
    toolUseId?: string | null;
    isThinking?: boolean;
    isStreaming?: boolean;
    isError?: boolean;
    error?: string;
    agentName?: string;
    [key: string]: unknown;
  };
}

/**
 * The engine's tool for asking a person a question with options.
 *
 * It is a real tool with a real plugin behind it
 * (`desktop/openclaw-extensions/ask-user-question`, reaching the app over
 * the loopback bridge in `main/libs/mcpBridgeServer.ts`), and the engine's
 * system prompt tells the agent to use it "when you need the user to make
 * a choice between multiple options".
 *
 * It arrives as a *permission request*, which is why the founder never saw
 * one: this shell turned every pending permission into the approval card,
 * so a question with three options was drawn as "Allow Perrin to continue
 * — run commands on your computer?" with the question hidden behind
 * "Show the command". The cards were not missing. They were wearing the
 * wrong face.
 */
export const ASK_USER_TOOL = 'AskUserQuestion';

export interface AskUserOption {
  label: string;
  description?: string;
}

export interface AskUserQuestion {
  question: string;
  header?: string;
  options: readonly AskUserOption[];
  multiSelect?: boolean;
}

/**
 * The card as it stays in the thread once answered or dismissed: the
 * same prompt and options, the outcome on it, the time it was settled.
 * Pure, so the shell can keep it beside the messages the way it keeps
 * the notes an approval leaves.
 */
export function resolveChoiceItem(item: ChoiceItem, outcome: ChoiceOutcome, at: number): ChoiceItem {
  return { ...item, resolved: outcome, freeform: false, at };
}

/** `choice:<requestId>:<index>` — the card, and what it answers. */
export function choiceId(requestId: string, index: number): string {
  return `choice:${requestId}:${index}`;
}

/** The other way round. Undefined for anything that is not one of ours. */
export function parseChoiceId(
  id: string,
): { requestId: string; index: number } | undefined {
  const match = /^choice:(.+):(\d+)$/.exec(id);
  if (!match) return undefined;
  return { requestId: match[1], index: Number(match[2]) };
}

/**
 * The questions in a pending request, or none.
 *
 * Defensive on purpose: this is a tool call written by a model, so the
 * shape is a claim rather than a guarantee. A question with no text or no
 * options is dropped rather than drawn as an empty card.
 */
export function askUserQuestions(
  request: EnginePermissionRequest,
): readonly AskUserQuestion[] {
  if (request.toolName !== ASK_USER_TOOL) return [];
  const raw = request.toolInput?.questions;
  if (!Array.isArray(raw)) return [];

  const questions: AskUserQuestion[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const one = entry as Record<string, unknown>;
    const question = typeof one.question === 'string' ? one.question.trim() : '';
    if (!question) continue;

    const options: AskUserOption[] = [];
    if (Array.isArray(one.options)) {
      for (const option of one.options) {
        if (!option || typeof option !== 'object') continue;
        const label = typeof (option as Record<string, unknown>).label === 'string'
          ? ((option as Record<string, unknown>).label as string).trim()
          : '';
        if (!label) continue;
        const description = (option as Record<string, unknown>).description;
        options.push({
          label,
          ...(typeof description === 'string' && description.trim()
            ? { description: description.trim() }
            : {}),
        });
      }
    }
    if (!options.length) continue;

    const header = typeof one.header === 'string' ? one.header.trim() : '';
    questions.push({
      question,
      ...(header ? { header } : {}),
      options,
      ...(one.multiSelect === true ? { multiSelect: true } : {}),
    });
  }
  return questions;
}

/** A permission the engine is waiting on. */
export interface EnginePermissionRequest {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseId?: string | null;
}

export interface ToThreadOptions {
  /**
   * The agent this thread belongs to, for the orb beside a bubble.
   *
   * An identity key, never shown. It is what the palette is hashed from,
   * and it is whatever the store uses — `main`, a uuid, `engineering-lead`.
   */
  agentId?: string;
  /**
   * What the agent is called, for the one sentence that names it.
   *
   * Separate from `agentId` on purpose. The first build passed the id here
   * and an approval card read "Allow juno to continue" — the person is
   * being asked to trust something that cannot even say its own name
   * properly. Absent, the card says "this agent", which is honest.
   */
  agentName?: string;
  /** Permissions currently waiting. Each becomes an approval card. */
  pending?: readonly EnginePermissionRequest[];
  /** Names the machine on an approval card. */
  deviceId?: string;
  /** True in a group thread, where every bubble needs a sender. */
  group?: boolean;
  /**
   * Questions already answered, by request id and then question text.
   *
   * A request with several questions stays open until all of them are
   * answered, so without this the cards you have already pressed would sit
   * there waiting to be pressed again.
   */
  answered?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /**
   * The files this conversation has produced.
   *
   * Used for two things: resolving a chip to a real path, and deciding
   * whether a reply is a file rather than a sentence about one.
   */
  files?: readonly KnownFile[];
  /**
   * Whether the engine is still working on this conversation.
   *
   * A reply that is still arriving is not shown at all while this is
   * true — the typing animation is what says work is happening. When it
   * is false and a message is still marked as streaming, the engine
   * stopped without a final: what arrived is shown whole rather than
   * hidden forever. Absent means running.
   */
  running?: boolean;
}

/** At most this many bubbles from one reply. Three is the canvas's number. */
export const MAX_BUBBLES = 3;

/**
 * Split a reply the way a person texts: on blank lines, longest-first
 * order preserved, at most three.
 *
 * The remainder is not dropped. A reply with five paragraphs becomes two
 * bubbles and a third holding the rest — losing the tail to a formatting
 * rule would be the app quietly eating an answer.
 */
export function splitIntoBubbles(content: string): string[] {
  const parts = content
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean);
  if (parts.length <= MAX_BUBBLES) return parts;
  return [
    ...parts.slice(0, MAX_BUBBLES - 1),
    parts.slice(MAX_BUBBLES - 1).join('\n\n'),
  ];
}

/**
 * The command an approval card shows.
 *
 * Whatever the tool was actually asked to do, verbatim. A `command` or
 * `script` field is the usual shape; anything else is shown as the
 * pretty-printed input, because something exact beats a summary.
 */
export function commandFromToolInput(input: Record<string, unknown>): string | undefined {
  for (const key of ['command', 'script', 'cmd', 'query', 'path', 'url']) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  const keys = Object.keys(input);
  if (!keys.length) return undefined;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return undefined;
  }
}

/**
 * The sentence on an approval card.
 *
 * Names the agent and what it wants, and says nothing about tools. The
 * canvas's wording, generalised: "Allow Perrin and all agents to run
 * commands on your local computer?"
 */
export function authQuestion(agentName: string | undefined, toolName: string): string {
  const who = agentName?.trim() || 'this agent';
  const what = verbForTool(toolName).toLowerCase();
  return `Allow ${who} to continue — ${what} on your computer?`;
}

const isBlank = (value: string): boolean => !value.trim();

/**
 * The engine's own summary of a run of tools: "🛠️ create folder x → run
 * node → list files in y", with "⚠️" in front and "failed" behind when
 * the run ended badly. It is the engine's step card in one line, and the
 * design has no step cards. On 17 September one reached the thread under
 * a Word document ("⚠️ 🛠️ create folder .cowork-temp → show > → run const
 * → … → run unzip funny-romcom-poem.docx failed") and the founder asked,
 * rightly, what on earth it was. The agent says what happened in its own
 * words; the chain of tools is not something a person is ever shown.
 */
const ENGINE_TOOL_SUMMARY = /^\s*(?:⚠️\s*)?🛠️/u;
export const isEngineToolSummary = (text: string): boolean => ENGINE_TOOL_SUMMARY.test(text);

/**
 * Under a command or file card: the answer is for this computer, once.
 * `docs/product/sources/caisra-permissions.md` §2.2, the founder's own
 * design intent: "once per machine until revoked", and the setting is
 * where it is revoked. Allow puts the computer in review mode: everyday
 * work goes ahead, and only what the reviewer flags asks again.
 */
export const COMPUTER_GRANT_NOTE = 'Once you allow it, it won\'t ask again on this computer, except about something risky. You can change that any time in Settings.';

/**
 * Under a card the reviewer raised: the reason, in its sentence. The
 * computer is already allowed, so this card is about this one action.
 */
export const flaggedNote = (reason: string): string => `Flagged: ${reason.trim().replace(/\.?$/, '.')} Allow runs this one; it will keep asking about things like it.`;

/** The reviewer's reason, as the bridge attached it, or nothing. */
export function reviewReasonFromToolInput(input: Record<string, unknown>): string | undefined {
  const raw = input.reason;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

/**
 * Turn a session's messages into what the thread shows.
 *
 * Order is preserved. A `tool_use` with no matching `tool_result` stays
 * as a live status; once its result arrives, both disappear — which is
 * the design's "removed when the work finishes".
 */
export function toThreadItems(
  messages: readonly EngineMessage[],
  options: ToThreadOptions = {},
): ThreadItem[] {
  const { agentId, group, pending = [], deviceId, running = true } = options;

  // Which tool calls have already come back. A status only survives while
  // its work is still in flight.
  const finished = new Set<string>();
  for (const message of messages) {
    if (message.type === 'tool_result') {
      const id = message.metadata?.toolUseId;
      if (typeof id === 'string') finished.add(id);
    }
  }

  const items: ThreadItem[] = [];

  for (const message of messages) {
    const meta = message.metadata ?? {};
    const at = message.timestamp;

    switch (message.type) {
      case 'user': {
        if (isBlank(message.content)) break;
        // A person's attachments arrive appended to their own prompt as
        // machine-written lines — `Input Files: /abs/path` — which is the
        // app's convention and predates this shell. Rendered as written
        // they are a label and a path in the middle of somebody's own
        // sentence, so they come out and go back in as the canvas's
        // marker, where the bubble draws them as chips.
        const { text: said, attachments } = extractUserMessageFileAttachments(message.content);
        const text = [said.trim(), ...attachments.map(one => `[[${one.name}]]`)]
          .filter(Boolean)
          .join('\n');
        if (!text) break;
        items.push({
          kind: ThreadItemKind.Text,
          id: message.id,
          from: Speaker.Person,
          text,
          at,
        } satisfies TextItem);
        break;
      }

      case 'assistant': {
        // Thinking is not shown. The design has no block for it, and the
        // voice brief says not to narrate.
        if (meta.isThinking) break;

        if (meta.isError || meta.error) {
          const text = (meta.error ?? message.content).trim();
          if (text && !isEngineToolSummary(text)) {
            items.push({ kind: ThreadItemKind.System, id: message.id, text, at });
          }
          break;
        }
        if (isEngineToolSummary(message.content)) break;
        // A reply that is still arriving is not shown. The founder:
        // "it's supposed come as text. but the ai write it in streams.
        // which creates lags. i want to have it as text. always." A bubble
        // that grows a token at a time is exactly what `direction.md` §3
        // says a text must never do, and the first build did it anyway
        // by drawing the partial as one whole bubble that kept changing.
        // Now nothing is drawn until the reply is complete; the typing
        // animation covers the wait, and the finished reply lands as
        // bubbles a second apart like everything else.
        //
        // The one exception is an engine that stopped mid-reply and never
        // sent a final: once the session is no longer running, whatever
        // arrived is shown, because hiding it forever would lose words.
        if (meta.isStreaming && !meta.isFinal && running) break;
        if (isBlank(message.content)) break;

        // The bulk comes off first, before anything is split into
        // bubbles. `splitIntoBubbles` breaks on blank lines, so running
        // it first would tear the fence in half and leave a bubble that
        // is nothing but a `details` block — which, having no summary in
        // front of it, is then quite correctly refused and shown raw.
        const sender = {
          ...(group && agentId ? { agentId } : {}),
          ...(group && agentId && options.agentName ? { agentName: options.agentName } : {}),
        };

        // The answer cards come off first: a fenced `openui-lang` block
        // is a card item where the agent wrote it, and the text on
        // either side is bubbles as before. A reply with no block is one
        // text segment, and ids are what they always were.
        const segments = splitCardSegments(message.content);
        const single = segments.length === 1 && segments[0].kind === 'text';
        let bubbleIndex = 0;
        let cardIndex = 0;

        for (const segment of segments) {
          if (segment.kind === 'card') {
            const artifact = artifactKindOf(segment.program);
            items.push({
              kind: ThreadItemKind.Card,
              id: `${message.id}:c${cardIndex}`,
              program: segment.program,
              ...(artifact ? { artifact } : {}),
              ...sender,
              at,
            } satisfies CardItem);
            cardIndex += 1;
            continue;
          }

          // The bulk comes off before anything is split into bubbles.
          // `splitIntoBubbles` breaks on blank lines, so running it
          // first would tear the fence in half and leave a bubble that
          // is nothing but a `details` block — which, having no summary
          // in front of it, is then quite correctly refused and shown raw.
          const { summary, details } = splitReply(segment.text);
          const parts = splitIntoBubbles(summary);

          parts.forEach((text, index) => {
            const id = single && parts.length === 1 ? message.id : `${message.id}:${bubbleIndex}`;
            bubbleIndex += 1;

            // The files a reply ends with are cards, not chips: one per
            // file, after whatever was said. A reply that is nothing but
            // its files is only the cards.
            const { text: said, attachments } = peelAttachments(
              text,
              { id, from: Speaker.Agent, at, ...sender },
              options.files,
            );

            if (said) {
              items.push({
                kind: ThreadItemKind.Text,
                id,
                from: Speaker.Agent,
                text: said,
                ...sender,
                // Under the last bubble of the reply, which is where the
                // person's eye already is when they finish reading it.
                ...(details && index === parts.length - 1 ? { details } : {}),
                at,
              } satisfies TextItem);
            }
            items.push(...attachments);
          });
        }
        break;
      }

      case 'tool_use': {
        const id = meta.toolUseId;
        if (typeof id === 'string' && finished.has(id)) break;
        items.push({
          kind: ThreadItemKind.Status,
          id: message.id,
          verb: verbForTool(meta.toolName),
          ...(agentId ? { agentId } : {}),
          at,
        } satisfies StatusItem);
        break;
      }

      case 'tool_result':
        // Nothing. Its arrival is what removed the status above; its
        // content belongs to the agent to say in its own words.
        break;

      case 'system': {
        if (isBlank(message.content) || isEngineToolSummary(message.content)) break;
        items.push({
          kind: ThreadItemKind.System,
          id: message.id,
          text: message.content.trim(),
          at,
        });
        break;
      }
    }
  }

  // Approvals and questions last: the thread is waiting on them, so they
  // belong at the bottom where the person is looking.
  for (const request of pending) {
    const questions = askUserQuestions(request);
    if (questions.length) {
      const already = options.answered?.[request.requestId] ?? {};
      questions.forEach((question, index) => {
        // An answered question leaves. The request stays open until every
        // one of them has been answered, and a card you have already
        // pressed sitting there is a dead control.
        if (already[question.question] !== undefined) return;
        items.push({
          kind: ThreadItemKind.Choice,
          id: choiceId(request.requestId, index),
          text: question.question,
          ...(question.header ? { note: question.header } : {}),
          options: question.options.map((option, k) => ({
            key: String.fromCharCode(65 + k),
            label: option.label,
            ...(option.description ? { hint: option.description } : {}),
          })),
          // The canvas's "Type your own answer". The engine's own tool
          // offers "Other" for the same reason.
          freeform: true,
          at: Date.now(),
        } satisfies ChoiceItem);
      });
      continue;
    }

    // Flagged by the reviewer, or the first grant for this computer: the
    // note and the meaning of Allow differ.
    const reason = reviewReasonFromToolInput(request.toolInput);
    const grant = reason ? { note: flaggedNote(reason), flagged: true } : { note: COMPUTER_GRANT_NOTE };

    const access = fileAccessFromToolInput(request.toolInput);
    if (access) {
      // A file tool asking. Same card, the paths where the command goes.
      items.push({
        kind: ThreadItemKind.Auth,
        id: `auth:${request.requestId}`,
        text: fileAccessQuestion(options.agentName, access),
        ...(deviceId ? { deviceId } : {}),
        ...grant,
        command: access.paths.join('\n'),
        access: access.kind,
        at: Date.now(),
      } satisfies AuthItem);
      continue;
    }

    items.push({
      kind: ThreadItemKind.Auth,
      id: `auth:${request.requestId}`,
      text: authQuestion(options.agentName, request.toolName),
      ...(deviceId ? { deviceId } : {}),
      ...grant,
      ...(commandFromToolInput(request.toolInput)
        ? { command: commandFromToolInput(request.toolInput) }
        : {}),
      at: Date.now(),
    } satisfies AuthItem);
  }

  return items;
}

/** What a file tool is asking for, as the bridge attached it. */
export interface FileAccessAsk {
  kind: 'read' | 'write';
  paths: string[];
}

/**
 * The engine patch makes `read`, `write`, `edit` and `apply_patch` ask
 * through the command approval, and the bridge
 * (`main/libs/agentEngine/openclawApprovalBridge.ts`) attaches this to
 * the request. Anything malformed is treated as an ordinary command
 * approval rather than dropped: a card with the wrong words beats no card.
 */
export function fileAccessFromToolInput(input: Record<string, unknown>): FileAccessAsk | undefined {
  const raw = input.fileAccess;
  if (!raw || typeof raw !== 'object') return undefined;
  const { kind, paths } = raw as { kind?: unknown; paths?: unknown };
  if (kind !== 'read' && kind !== 'write') return undefined;
  if (!Array.isArray(paths)) return undefined;
  const clean = paths.filter((one): one is string => typeof one === 'string' && one.trim().length > 0);
  if (!clean.length) return undefined;
  return { kind, paths: clean };
}

/** "Allow Perrin to continue — changing a file on your computer?" */
export function fileAccessQuestion(agentName: string | undefined, access: FileAccessAsk): string {
  const who = agentName?.trim() || 'this agent';
  const verb = access.kind === 'read' ? 'reading' : 'changing';
  const what = access.paths.length === 1 ? 'a file' : `${access.paths.length} files`;
  return `Allow ${who} to continue — ${verb} ${what} on your computer?`;
}

/**
 * The line left behind when an approval is answered.
 *
 * Answering consumes the card — the prompt is replaced by this, so a
 * thread never accumulates dead controls.
 *
 * Allow is the computer, not the command and not the folder: after it,
 * nothing on this computer asks again until the setting is changed
 * (`caisra-permissions.md` §2.2, §11). Not now is one action declined,
 * and the next time it matters the card comes back (§10: "No bother.
 * I'll ask again when it actually matters"). "Once" has no button since
 * 17 September and is kept for a thread written before that.
 */
export function decisionNote(
  agentName: string,
  decision: 'always' | 'once' | 'never',
  access?: 'read' | 'write',
): string {
  if (decision === 'always') {
    return `${agentName} can work on your computer from now on. It will still ask before anything risky. Change that any time in Settings.`;
  }
  if (decision === 'never') {
    return `Not now. ${agentName} will ask again when it matters.`;
  }
  if (access) {
    const verb = access === 'read' ? 'read' : 'change';
    return `${agentName} can ${verb} that file this time.`;
  }
  return `${agentName} can run commands on your computer this time.`;
}
