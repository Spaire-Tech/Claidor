/** Fixed names and places of cloud agents. */

export const CLOUD_AGENT_SINGLE_REPO_WORKSPACE_ROOT = "/workspace";

/** Where a cloud agent's artifacts go when no other folder is reported. */
export const CLOUD_AGENT_ARTIFACTS_DIR = "/opt/cursor/artifacts/";

/** The skill that sets an environment up: its id, its folder among the managed skills, and its file. */
export const ENV_SETUP_SKILL_ID = "env-setup";
const MANAGED_SKILLS = "/.simeon/skills-simeon";
export const ENV_SETUP_MANAGED_SKILL_DIRECTORY = `${MANAGED_SKILLS}/${ENV_SETUP_SKILL_ID}/`;
export const ENV_SETUP_MANAGED_SKILL_PATH = `${ENV_SETUP_MANAGED_SKILL_DIRECTORY}SKILL.md`;
