/**
 * The user's and the projects' shared memory, read for the system prompt
 * (25 September 2026, design-audit-ledger.md F-062).
 *
 * The agent's `UpdateState` has written user- and project-scoped facts into
 * per-agent shards under `<sandRoot>/user-memory/agents/<id>` and
 * `<sandRoot>/projects/<slug>/memory/agents/<id>` since the reconstruction,
 * and `system-prompt-assembly.ts` has rendered them since 24 September; but
 * the composition asked the memory extension for `createUserMemory` and
 * `createProjectMemory` and the extension had neither, so both resolved to
 * undefined and no shard was ever read back. These are the two readers, in
 * the shape the assembly's `userMemory` and `projectMemory` deps declare.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DebouncePolicy } from "../../../internal/scheduling.js";
import { parseWorkflowFile } from "../../../shared/workflow-model.js";
import { mergeUserMemoryShards, selectProjectMemoryBlocks, type ProjectMemoryBlock, type ProvenancedMemory } from "../../runner/sand-memory.js";
import { FileMemoryStore, getProjectDir, getProjectMemoryShardDir, getProjectMemoryShardsDir, getProjectsRootDir, getUserMemoryDir, getUserMemoryShardDir, getUserMemoryShardsDir } from "./memory-service.js";
import { AgentProjectMembership } from "./project-membership.js";

export interface SharedMemoryLimits { readonly profileLimit: number; readonly recentLimit: number }
export interface UserMemoryReader {
  recall(limits: SharedMemoryLimits): { profile: readonly ProvenancedMemory[]; recent: readonly ProvenancedMemory[] };
  getLocation(): string | null;
  getOwnShardLocation(): string | null;
}
export interface ProjectMemoryReader {
  recall(limits: SharedMemoryLimits, cap: number): { injected: readonly ProjectMemoryBlock[]; alsoMemberOf: readonly { slug: string; name: string }[] };
  getLocation(): string | null;
}

// Shards are read fresh on every recall (a prompt is built once per turn);
// the store's own watcher is not needed for a read-only pass, so the
// debounce policy is the immediate one.
const immediate: DebouncePolicy = { name: "sand-shared-memory-read", wrap: <T extends (...args: never[]) => unknown>(fn: T) => Object.assign(fn, { dispose() {} }) };

function listDir(dir: string): string[] { try { return readdirSync(dir).sort(); } catch { return []; } }
function shardRecall(dir: string, recentLimit: number) { return new FileMemoryStore(dir, immediate).recall(recentLimit); }

export function createUserMemoryReader(args: { sandRoot: string; agentId: string; resolveAgentName: (id: string) => string | null }): UserMemoryReader {
  return {
    recall: (limits) => mergeUserMemoryShards(
      listDir(getUserMemoryShardsDir(args.sandRoot)).map((id) => ({ via: args.resolveAgentName(id) || id, recall: shardRecall(getUserMemoryShardDir(args.sandRoot, id), limits.recentLimit) })),
      limits,
    ),
    getLocation: () => getUserMemoryDir(args.sandRoot),
    getOwnShardLocation: () => getUserMemoryShardDir(args.sandRoot, args.agentId),
  };
}

export function readProjectName(sandRoot: string, slug: string): string {
  try { return parseWorkflowFile(readFileSync(join(getProjectDir(sandRoot, slug), "project.md"), "utf8"))?.name || slug; } catch { return slug; }
}

export function createProjectMemoryReader(args: { sandRoot: string; agentDir: string; agentId: string; resolveAgentName: (id: string) => string | null }): ProjectMemoryReader {
  const membership = new AgentProjectMembership(args.agentDir);
  return {
    recall: (limits, cap) => selectProjectMemoryBlocks(
      [...membership.read()].sort().map((slug) => {
        const shards = listDir(getProjectMemoryShardsDir(args.sandRoot, slug)).map((id) => ({ via: args.resolveAgentName(id) || id, recall: shardRecall(getProjectMemoryShardDir(args.sandRoot, slug, id), limits.recentLimit) }));
        const ownShardDir = getProjectMemoryShardDir(args.sandRoot, slug, args.agentId);
        return { slug, name: readProjectName(args.sandRoot, slug), ownShardDir, recall: mergeUserMemoryShards(shards, limits) };
      }),
      cap,
    ),
    getLocation: () => getProjectsRootDir(args.sandRoot),
  };
}
