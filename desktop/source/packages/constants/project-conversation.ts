export interface ProjectDetails {
  subagent?: unknown;
  sideChat?: unknown;
}

/**
 * Whether these are the details of a project's root conversation: there
 * are details, and they name neither a subagent nor a side chat. Only
 * `undefined` counts as not named.
 */
export function isRootProjectDetails(projectDetails: ProjectDetails | null | undefined): boolean {
  if (projectDetails == null) return false;
  return projectDetails.subagent === undefined && projectDetails.sideChat === undefined;
}
