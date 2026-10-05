import { homedir } from "node:os";
import { join } from "node:path";
export const SIMEON_PROJECTS_ROOT = join(homedir(), ".simeon", "projects");
export const SIMEON_WORKTREES_ROOT = join(homedir(), ".simeon", "worktrees");
