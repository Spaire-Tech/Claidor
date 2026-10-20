import { say } from "../../shared/say.js";
import { currentUserLanguage } from "../../shared/user-language.js";

// An approval card's summary is written in the person's language (`say`, 20 October 2026);
// the MCP `command` line stays as the tool's own words.
const SAND_AUTO_REVIEW_SECRET_KEY_PATTERN = /(?:authorization|api.?key|credential|password|secret|token)/i;
const SAND_AUTO_REVIEW_SECRET_VALUE_PATTERN = /^(?:bearer\s+)?[A-Za-z0-9_+\/-]{24,}={0,2}$/i;

function redactSandAutoReviewInlineSecrets(value: string): string {
  return value.replace(/(authorization|api.?key|password|secret|token)(\s*[:=]\s*)\S+/gi, "$1$2…");
}

export function compact(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, maxChars - 1)}…`;
}

export function compactHeadAndTail(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  let omittedChars = normalized.length - maxChars;
  let omittedLabel = "";
  let available = 2;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    omittedLabel = `…[${omittedChars} chars omitted]…`;
    available = Math.max(2, maxChars - omittedLabel.length);
    const actualOmittedChars = normalized.length - available;
    if (actualOmittedChars === omittedChars) break;
    omittedChars = actualOmittedChars;
  }
  const headChars = Math.ceil(available / 2);
  const tailChars = Math.floor(available / 2);
  return `${normalized.slice(0, headChars)}${omittedLabel}${normalized.slice(-tailChars)}`;
}

export function shellLocationPhrase(surface: string): string {
  return say(currentUserLanguage(), surface === "host_shell" ? "approval.onLocalComputer" : "approval.onSimeonComputer");
}

export function genericSandShellAutoReviewSummary(surface: string): string {
  return say(currentUserLanguage(), surface === "host_shell" ? "approval.runOnLocalComputer" : "approval.runOnSimeonComputer");
}

export function describeSandShellAutoReviewAction(args: {
  readonly surface: string;
  readonly description?: string;
  readonly workingDirectory?: string;
}): string {
  const location = shellLocationPhrase(args.surface);
  const description = args.description?.replace(/\s+/g, " ").trim();
  const cwd = args.workingDirectory === undefined ? "" : say(currentUserLanguage(), "approval.fromFolder", { folder: compact(args.workingDirectory, 100) });
  if (description !== undefined && description.length > 0) {
    const head = description.replace(/[.!?]+$/u, "");
    return compact(`${head} ${location}${cwd}`, 340);
  }
  return compact(`${genericSandShellAutoReviewSummary(args.surface)}${cwd}`, 340);
}

export function redactMcpValue(value: unknown, key?: string, depth = 0): unknown {
  if (key !== undefined && SAND_AUTO_REVIEW_SECRET_KEY_PATTERN.test(key)) return "…";
  if (typeof value === "string") {
    const redacted = redactSandAutoReviewInlineSecrets(value);
    return SAND_AUTO_REVIEW_SECRET_VALUE_PATTERN.test(redacted) ? "…" : compactHeadAndTail(redacted, 160);
  }
  if (value === null || typeof value !== "object") return value;
  if (depth >= 3) return Array.isArray(value) ? `[${value.length} items]` : "{…}";
  if (Array.isArray(value)) {
    const selected = value.length <= 6
      ? value
      : [...value.slice(0, 3), `${value.length - 6} items omitted`, ...value.slice(-3)];
    return selected.map((entry) => redactMcpValue(entry, undefined, depth + 1));
  }
  const allEntries = Object.entries(value);
  const entries: [string, unknown][] = allEntries.length <= 12
    ? allEntries
    : [...allEntries.slice(0, 6), ["…", `${allEntries.length - 12} fields omitted`], ...allEntries.slice(-6)];
  return Object.fromEntries(entries.map(([entryKey, entry]) => [
    compact(entryKey, 60),
    redactMcpValue(entry, entryKey, depth + 1),
  ]));
}

export function summarizeSandMcpAutoReviewAction(args: {
  readonly serverDisplayName: string;
  readonly toolName: string;
  readonly mcpArguments?: unknown;
}): string {
  const safeServer = compact(args.serverDisplayName, 80);
  const safeTool = compact(args.toolName, 80);
  const payload = redactMcpValue(args.mcpArguments ?? {}, undefined);
  const details = compactHeadAndTail(JSON.stringify(payload), 300);
  return `Use ${safeServer || "a connected service"} tool ${safeTool || "action"} with ${details}`;
}

export function genericSandMcpAutoReviewSummary(serverDisplayName: string): string {
  const safeServer = compact(serverDisplayName, 80);
  const language = currentUserLanguage();
  return say(language, "approval.use", { service: safeServer.length > 0 ? safeServer : say(language, "approval.connectedService") });
}

export const MCP_DESTINATION_KEYS = new Set([
  "channel", "channel_id", "channelid", "path", "page", "page_id", "pageid",
  "repo", "repository", "title", "name", "url",
]);

export function humanizeMcpToolAction(toolName: string): string | undefined {
  const words = compact(toolName, 80)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_.]+/g, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) return undefined;
  if (words.length === 2
    && /^(send|create|update|delete|post|write|read|add|remove|open|close|list|search|fetch|get|set|upload|download|invite|share)$/.test(words[0] ?? "")
    && !/s$/i.test(words[1] ?? "")) {
    const article = /^[aeiou]/i.test(words[1] ?? "") ? "an" : "a";
    return `${words[0]} ${article} ${words[1]}`;
  }
  return words.join(" ");
}

export function mentionsServer(text: string, serverDisplayName: string): boolean {
  const server = serverDisplayName.trim();
  return server.length > 0 && text.toLowerCase().includes(server.toLowerCase());
}

export function safeMcpDestinationHint(mcpArguments: unknown): string | undefined {
  if (mcpArguments === undefined || mcpArguments === null || typeof mcpArguments !== "object" || Array.isArray(mcpArguments)) return undefined;
  for (const [rawKey, value] of Object.entries(mcpArguments)) {
    if (typeof value !== "string") continue;
    const key = rawKey.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (!MCP_DESTINATION_KEYS.has(key) || SAND_AUTO_REVIEW_SECRET_KEY_PATTERN.test(rawKey)) continue;
    const redacted = redactSandAutoReviewInlineSecrets(value).replace(/\s+/g, " ").trim();
    if (redacted.length === 0 || redacted.length > 80 || SAND_AUTO_REVIEW_SECRET_VALUE_PATTERN.test(redacted)) continue;
    return compact(redacted, 60);
  }
  return undefined;
}

export function fallbackSandMcpAutoReviewSummary(args: {
  readonly serverDisplayName: string;
  readonly toolName: string;
  readonly mcpArguments?: unknown;
}): string {
  const server = compact(args.serverDisplayName, 80);
  const action = humanizeMcpToolAction(args.toolName);
  const hint = safeMcpDestinationHint(args.mcpArguments);
  if (action === undefined) return genericSandMcpAutoReviewSummary(server);
  const language = currentUserLanguage();
  const base = say(language, "approval.useTo", { service: server.length > 0 ? server : say(language, "approval.connectedService"), action });
  if (hint === undefined || base.toLowerCase().includes(hint.toLowerCase())) return base;
  return say(language, "approval.toward", { action: base, destination: hint });
}

export function describeSandMcpAutoReviewAction(args: {
  readonly description?: string;
  readonly serverDisplayName: string;
  readonly toolName: string;
  readonly mcpArguments?: unknown;
}): string {
  const description = args.description?.replace(/\s+/g, " ").trim();
  const server = compact(args.serverDisplayName, 80);
  if (description !== undefined && description.length > 0) {
    const head = description.replace(/[.!?]+$/u, "");
    if (server.length > 0 && !mentionsServer(head, server)) return compact(say(currentUserLanguage(), "approval.with", { action: head, service: server }), 340);
    return compact(head, 340);
  }
  return fallbackSandMcpAutoReviewSummary({
    serverDisplayName: args.serverDisplayName,
    toolName: args.toolName,
    ...(args.mcpArguments === undefined ? {} : { mcpArguments: args.mcpArguments }),
  });
}

export function summarizeSandAutomationWriteAction(args: {
  readonly operation: string;
  readonly name: string;
  readonly triggerDescription: string;
  readonly prompt: string;
  readonly isEnabled?: boolean;
  readonly referencingRoutineNames?: readonly string[];
}): string {
  const language = currentUserLanguage();
  const name = compact(args.name, 80) || say(language, "approval.aRoutine");
  const instruction = compactHeadAndTail(redactSandAutoReviewInlineSecrets(args.prompt), 240);
  if (args.operation === "workflow_body") {
    const routines = args.referencingRoutineNames
      ?.map((routine) => compact(routine, 40))
      .filter((routine) => routine.length > 0)
      .slice(0, 3)
      .join(", ") || say(language, "approval.standingOrders");
    return say(language, "approval.changeWorkflow", { name, routines, instruction });
  }
  const when = (compact(args.triggerDescription, 120) || say(language, "approval.onATrigger")).toLowerCase();
  const paused = args.isEnabled === false;
  const key = args.operation === "create"
    ? (paused ? "approval.saveRoutinePaused" : "approval.saveRoutine")
    : (paused ? "approval.changeRoutinePaused" : "approval.changeRoutine");
  return say(language, key, { name, when, instruction });
}

export function summarizeSandCloudAgentAction(args: {
  readonly action: string;
  readonly prompt: string;
  readonly agentId?: string;
  readonly imageCount?: number;
  readonly interrupt?: boolean;
  readonly repoUrl?: string;
  readonly title?: string;
}): string {
  const language = currentUserLanguage();
  const instruction = compactHeadAndTail(redactSandAutoReviewInlineSecrets(args.prompt), 240);
  const imageCount = args.imageCount ?? 0;
  const images = imageCount === 0 ? "" : imageCount === 1 ? say(language, "approval.withImage") : say(language, "approval.withImages", { count: imageCount });
  if (args.action === "reply") {
    const target = compact(args.agentId ?? "", 40) || say(language, "approval.aCloudAgent");
    const interrupt = args.interrupt === true ? say(language, "approval.interrupt") : "";
    return say(language, "approval.cloudFollowUp", { target, interrupt, images, instruction });
  }
  const repo = compact(args.repoUrl ?? "", 120);
  const title = args.title !== undefined && args.title.trim().length > 0 ? say(language, "approval.titled", { title: compact(args.title, 80) }) : "";
  const where = repo.length > 0 ? say(language, "approval.onRepo", { repo }) : "";
  return say(language, "approval.cloudLaunch", { title, repo: where, images, instruction });
}

export type CloudLifecycleAction = "rename" | "cancel" | "archive" | "unarchive" | "delete";

export function summarizeSandCloudAgentLifecycleAction(args: {
  readonly action: CloudLifecycleAction;
  readonly agentId: string;
  readonly title?: string;
}): string {
  const language = currentUserLanguage();
  const target = compact(args.agentId, 40) || say(language, "approval.aCloudAgent");
  switch (args.action) {
    case "rename":
      return args.title !== undefined && args.title.trim().length > 0
        ? say(language, "approval.cloudRenameTo", { target, title: compact(args.title, 80) })
        : say(language, "approval.cloudRename", { target });
    case "cancel": return say(language, "approval.cloudCancel", { target });
    case "archive": return say(language, "approval.cloudArchive", { target });
    case "unarchive": return say(language, "approval.cloudUnarchive", { target });
    case "delete": return say(language, "approval.cloudDelete", { target });
  }
}

export function summarizeSandSubagentAction(args: { readonly action: string; readonly prompt: string }): string {
  const instruction = compactHeadAndTail(redactSandAutoReviewInlineSecrets(args.prompt), 240);
  return say(currentUserLanguage(), args.action === "steer" ? "approval.taskFollowUp" : "approval.runTask", { instruction });
}

export interface SandBrowserSummaryArgs {
  readonly op: string;
  readonly element?: string;
  readonly targetPageUrl?: string;
  readonly url?: string;
  readonly text?: string;
  readonly value?: string;
  readonly values?: readonly string[];
  readonly key?: string;
  readonly cdpMethod?: string;
  readonly cdpParams?: string;
  readonly tabsAction?: string;
  readonly tabIndex?: number;
}

export function summarizeSandBrowserAutoReviewAction(args: SandBrowserSummaryArgs): string {
  const language = currentUserLanguage();
  const element = args.element?.replace(/\s+/g, " ").trim();
  const target = element !== undefined && element.length > 0 ? say(language, "approval.quoted", { text: compact(element, 160) }) : say(language, "approval.anElement");
  const page = args.targetPageUrl !== undefined && args.targetPageUrl.length > 0
    ? say(language, "approval.onPage", { page: compactHeadAndTail(redactSandAutoReviewInlineSecrets(args.targetPageUrl), 120) })
    : "";
  const summarize = (action: string): string => compact(say(language, "approval.inBrowser", { action, page }), 340);
  switch (args.op) {
    case "navigate": return compact(say(language, "approval.browserOpen", { url: redactSandAutoReviewInlineSecrets(args.url ?? "") }), 340);
    case "click":
    case "mouse_click_xy": return summarize(say(language, "approval.click", { target }));
    case "type": return summarize(summarizeTypedText(args.text ?? ""));
    case "fill": return summarize(summarizeTypedText(args.value ?? ""));
    case "select_option": return summarize(say(language, "approval.select", { values: redactSandAutoReviewInlineSecrets((args.values ?? []).join(", ")), target }));
    case "press_key": return summarize(say(language, "approval.press", { key: args.key?.slice(0, 80) ?? say(language, "approval.aKey") }));
    case "drag": return summarize(say(language, "approval.drag", { target }));
    case "cdp": return summarize(say(language, "approval.cdp", { method: args.cdpMethod?.slice(0, 120) ?? "", params: compactHeadAndTail(redactSandAutoReviewInlineSecrets(args.cdpParams ?? "{}"), 160) }));
    case "tabs": return summarize(args.tabsAction === "close"
      ? (args.tabIndex !== undefined ? say(language, "approval.closeTabNumber", { index: args.tabIndex }) : say(language, "approval.closeTab"))
      : say(language, "approval.openTab"));
    default: return compact(say(language, "approval.browserOther", { op: args.op }), 340);
  }
}

export function summarizeTypedText(text: string): string {
  const redacted = redactSandAutoReviewInlineSecrets(text);
  const normalized = compactHeadAndTail(redacted, 80);
  const looksSensitive = redacted !== text
    || SAND_AUTO_REVIEW_SECRET_VALUE_PATTERN.test(text.trim())
    || /(?:api[_ -]?key|authorization|credential|password|secret|token)\s*[:=]/i.test(text)
    || (/^[A-Za-z0-9+/_=-]{24,}$/.test(text.trim()) && !text.trim().includes(" "));
  const language = currentUserLanguage();
  return looksSensitive || normalized.length === 0
    ? say(language, "approval.type", { count: text.length })
    : say(language, "approval.typeShown", { count: text.length, text: normalized });
}

export function summarizeSandComputerTypedText(text: string): string {
  return say(currentUserLanguage(), "approval.onSimeonComputerAfter", { action: summarizeTypedText(text) });
}
