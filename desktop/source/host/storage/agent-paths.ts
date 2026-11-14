/**
 * Where the agents' folders are: one folder for each agent, named by the
 * agent's id, inside "agents" under the data root.
 */
import { homedir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";

import { getSandRootDir } from "../host-paths.js";
import { isSafeFolderId } from "./folder-id.js";

/** Thrown for an agent id that cannot be the name of the agent's folder. */
export class SandInvalidAgentIdError extends Error {}

/** What the error says, with the id as it was given. */
function refusalOf(agentId: string): string {
  return `Invalid Sand agent id: ${agentId}`;
}

/** The folder that holds every agent's folder. */
export function getSandAgentsRootDir(homeDir = homedir()): string {
  return join(getSandRootDir(homeDir), "agents");
}

/** An id is usable when it is a safe folder name with no space at either end. */
export function assertValidSandAgentId(agentId: string): void {
  const usable = isSafeFolderId(agentId) && agentId === agentId.trim();
  if (!usable) throw new SandInvalidAgentIdError(refusalOf(agentId));
}

/**
 * Whether the way from `outer` to `inner` is one plain name: `inner` sits
 * directly in `outer`, not above it, not elsewhere, not deeper.
 */
function sitsDirectlyIn(outer: string, inner: string): boolean {
  const way = relative(outer, inner);
  if (way === "" || way === "..") return false;
  return !isAbsolute(way) && !way.includes(sep);
}

/**
 * The folder of one agent. The id is checked first; the folder it leads to
 * is then checked once more against the agents' folder, so that no id can
 * name a folder anywhere else.
 */
export function resolveSandAgentDir(agentId: string, homeDir = homedir()): string {
  assertValidSandAgentId(agentId);
  const agentsDir = getSandAgentsRootDir(homeDir);
  const agentDir = join(agentsDir, agentId);
  if (!sitsDirectlyIn(agentsDir, agentDir)) throw new SandInvalidAgentIdError(refusalOf(agentId));
  return agentDir;
}
