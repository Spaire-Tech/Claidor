import { randomUUID } from "node:crypto";
import type { Context } from "../../packages/context/core.js";
import {
  shellExecutorResource,
  type ShellExecResponse,
  type ShellExecutor
} from "../../packages/agent-exec/shell.js";
import { SAND_BOX_PRIMARY_WINDOW_INDEX, SandBoxNoMonitorAvailableError, isPrimaryWindowIndex } from "../ports/box.js";
import { buildHostShellArgs } from "./box-shell-command.js";

export class SandBoxWindowError extends Error { constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = "SandBoxWindowError"; } }
export const SAND_BOX_FORK_ROUTER_PORT = 1339;
export const SAND_BOX_DISPLAY_HEADER = "x-sand-display";
export const SAND_BOX_WINDOW_OWNER_HEADER = "x-sand-window-owner";
export const SAND_BOX_WINDOW_OWNER_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;
export const SAND_BOX_WINDOW_UNAVAILABLE_EXIT_CODE = 75;
export function mintSandWindowOwnerToken(): string { return randomUUID(); }
export function envInt(name: string, fallback: number, env: Record<string, string | undefined> = process.env): number { const raw = env[name]; if (raw == null || !raw.trim()) return fallback; const value = Number.parseInt(raw.trim(), 10); return Number.isInteger(value) && value > 0 ? value : fallback; }
export const SAND_BOX_MAX_WINDOWS = envInt("SAND_BOX_MAX_WINDOWS", 100);
export function sandBoxDisplayToken(windowIndex: number): string { return String(windowIndex); }
export type ShellExecutionResult = ShellExecResponse;
export interface ShellAccessor { get(resource: typeof shellExecutorResource): ShellExecutor }
export async function runWindowScript(ctx: Context, accessor: ShellAccessor, label: string, windowIndex: number, options: { ownerToken?: string; reportGuardRefused?: (stage: string) => void } = {}): Promise<void> { if (isPrimaryWindowIndex(windowIndex)) { options.reportGuardRefused?.(label); return; } const ownerToken = options.ownerToken; if (ownerToken != null && !SAND_BOX_WINDOW_OWNER_TOKEN_PATTERN.test(ownerToken)) throw new SandBoxWindowError(`refusing to run ${label} with a malformed owner token`); const command = ownerToken == null ? `/usr/local/bin/${label} ${windowIndex}` : `/usr/local/bin/${label} ${windowIndex} ${ownerToken}`; const result = await accessor.get(shellExecutorResource).execute(ctx, buildHostShellArgs({ command, name: label, workingDirectory: "/workspace", toolCallId: `sand-${label}` })); if (result.result.case !== "success") throw new SandBoxWindowError(`${label} failed (${result.result.case})`); const { exitCode, stderr } = result.result.value; if (exitCode === SAND_BOX_WINDOW_UNAVAILABLE_EXIT_CODE) throw new SandBoxNoMonitorAvailableError(`${label} could not claim display :${windowIndex}: it is a live fork owned by a different agent`); if (exitCode !== 0) throw new SandBoxWindowError(`${label} exited ${exitCode}: ${stderr}`); }
export async function runStartWindow(ctx: Context, accessor: ShellAccessor, windowIndex: number, ownerToken?: string): Promise<void> { await runWindowScript(ctx, accessor, "start-window", windowIndex, ownerToken == null ? {} : { ownerToken }); }
export async function runStopWindow(ctx: Context, accessor: ShellAccessor, windowIndex: number): Promise<void> { await runWindowScript(ctx, accessor, "stop-window", windowIndex); }
export async function touchSandMonitorBusyLease(ctx: Context, accessor: ShellAccessor, windowIndex: number): Promise<void> { if (!Number.isInteger(windowIndex) || windowIndex < 1) return; try { await accessor.get(shellExecutorResource).execute(ctx, buildHostShellArgs({ command: `touch /tmp/sand-monitor-busy-${windowIndex}`, name: "touch", workingDirectory: "/workspace", toolCallId: "sand-monitor-busy-lease" })); } catch {} }
/**
 * Keeps an agent's Chrome open while its computer is handed to the person
 * (request_box_help, Take control): the browser helper on the computer
 * closes a Chrome only after it has gone unused with nobody watching
 * (`sand-browser-driver-source.ts`), and the person may come to a hand-off
 * later than that. The mark is `/tmp/.sand-browser/hold-N` for the display
 * the agent's own shell runs on; best-effort, like the busy lease.
 *
 * A checkout card waiting for the person keeps it open too (12 November
 * 2026): the card's checkout tab must still be there when they answer. Each
 * card has its own mark, `/tmp/.sand-browser/purchase-hold-<agent>-<entry>.N`,
 * on the agent's window N, taken back when the purchase ends; the browser
 * helper ignores one older than two hours, so a card nobody answers, or a
 * mark that couldn't be taken back, keeps Chrome open no longer than that.
 */
export interface SandBrowserHoldMark {
  /** The checkout card's agent and entry: a purchase's mark, not the hand-off's. */
  readonly purchase?: { readonly agentId: string; readonly entryId: string };
  /** The agent's window; the shell's own DISPLAY when not given. */
  readonly display?: number;
}
const shellDisplay = 'n="${DISPLAY#:}"; n="${n%%.*}"; case "$n" in ""|*[!0-9]*) n=1;; esac';
/** A mark's name part: letters, digits, `_` and `-` only, so it is safe in the shell and the file name. */
function holdKeyPart(value: string): string { return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "_"; }
export function sandBrowserHoldCommand(held: boolean, mark: SandBrowserHoldMark = {}): string {
  const display = mark.display !== undefined && Number.isInteger(mark.display) && mark.display >= 0 ? `n=${mark.display}` : shellDisplay;
  if (mark.purchase !== undefined) {
    const key = `${holdKeyPart(mark.purchase.agentId)}-${holdKeyPart(mark.purchase.entryId)}`;
    // Taken back on whichever window it was set: the key has no dot, so
    // `.*` is only ever the window.
    return held
      ? `${display}; mkdir -p /tmp/.sand-browser && touch "/tmp/.sand-browser/purchase-hold-${key}.$n"`
      : `rm -f /tmp/.sand-browser/purchase-hold-${key}.*`;
  }
  return held
    ? `${display}; mkdir -p /tmp/.sand-browser && touch "/tmp/.sand-browser/hold-$n"`
    : `${display}; rm -f "/tmp/.sand-browser/hold-$n"`;
}
export async function setSandBrowserHold(ctx: Context, accessor: ShellAccessor, held: boolean, mark: SandBrowserHoldMark = {}): Promise<void> { try { await accessor.get(shellExecutorResource).execute(ctx, buildHostShellArgs({ command: sandBrowserHoldCommand(held, mark), name: held ? "touch" : "rm", workingDirectory: "/workspace", toolCallId: mark.purchase === undefined ? "sand-browser-hold" : "sand-browser-purchase-hold" })); } catch {} }
export function sandBoxWindowKey(agentId: string, windowIndex: number): string { return `${agentId}#${windowIndex}`; }
export function clearAgentWindowConnections(connections: Map<string, unknown>, agentId: string): void { const prefix = `${agentId}#`; for (const key of connections.keys()) if (key.startsWith(prefix)) connections.delete(key); }
export function primarySandBoxWindow<T>(connection: { remoteAccessor: T; vncUrl: string }): { windowIndex: number; computerUse: T; vncUrl: string } { return { windowIndex: SAND_BOX_PRIMARY_WINDOW_INDEX, computerUse: connection.remoteAccessor, vncUrl: connection.vncUrl }; }
