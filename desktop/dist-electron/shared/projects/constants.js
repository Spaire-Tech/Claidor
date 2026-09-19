"use strict";
/**
 * A project: a folder, the agents working in it, and what they know
 * about it between them.
 *
 * `grok-bot.md` §9 lists three memory scopes — agent, shared user, and
 * project shards. We had the first two: each agent's own `MEMORY.md` in
 * its workspace, and the shared user memory that syncs through our
 * server. This is the third.
 *
 * **Why ours needs no sync at all.** Grok Bot shards project memory
 * across machines because its agents live in the cloud and the person
 * does not. Ours all run on one computer, so a project's shared memory is
 * simply a file several agents open — one path, one truth, no versions,
 * no merge, no conflict. The thing that makes this product different is
 * the thing that makes this feature small.
 *
 * **What a project is not.** It is not a room. A room is a conversation
 * several agents are in at once; a project is a body of work several
 * agents know about whether or not they are talking. An agent can be in a
 * project and never say a word in a room, and the two lists are
 * deliberately separate.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectError = exports.PROJECT_MEMORY_FILE = exports.ProjectIpc = exports.PROJECT_ID_PREFIX = void 0;
exports.isProjectId = isProjectId;
exports.projectId = projectId;
exports.slugify = slugify;
exports.projectMemoryPath = projectMemoryPath;
exports.projectProblem = projectProblem;
exports.projectProblemText = projectProblemText;
exports.PROJECT_ID_PREFIX = 'project:';
/** Renderer ↔ main. */
exports.ProjectIpc = {
    List: 'projects:list',
    Create: 'projects:create',
    Update: 'projects:update',
    Delete: 'projects:delete',
};
function isProjectId(id) {
    return typeof id === 'string' && id.startsWith(exports.PROJECT_ID_PREFIX);
}
function projectId(raw) {
    return isProjectId(raw) ? raw : `${exports.PROJECT_ID_PREFIX}${raw}`;
}
/**
 * A name turned into something safe to put on a filesystem.
 *
 * Deliberately narrow: lower case, digits, single hyphens, no leading or
 * trailing hyphen. The slug becomes a directory name, and a directory
 * name derived from arbitrary text is how path traversal and
 * case-collision bugs get in.
 */
function slugify(name) {
    return name
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
}
exports.PROJECT_MEMORY_FILE = 'PROJECT.md';
/**
 * Where a project's shared memory lives.
 *
 * Under the project's own directory rather than inside any one agent's
 * workspace, because no agent owns it. Every member opens the same path.
 */
function projectMemoryPath(projectsDir, slug) {
    return `${projectsDir}/${slug}/${exports.PROJECT_MEMORY_FILE}`;
}
exports.ProjectError = {
    NoName: 'no-name',
    NoSlug: 'no-slug',
    Duplicate: 'duplicate-slug',
    DuplicateMember: 'duplicate-member',
    Unknown: 'unknown-member',
};
/**
 * Whether a project can be made, and why not.
 *
 * A project with no members is allowed: somebody may set one up before
 * deciding who works on it, and refusing that would make them invent a
 * member to get past the form. A room is different — a room with one
 * member is a conversation pretending to be something else.
 */
function projectProblem(draft, knownAgentIds, existingSlugs) {
    if (!draft.name.trim())
        return exports.ProjectError.NoName;
    const slug = slugify(draft.name);
    // A name made only of punctuation or of characters that do not survive
    // slugification. Better to say so than to create `project:` with an
    // empty directory name.
    if (!slug)
        return exports.ProjectError.NoSlug;
    if (existingSlugs.includes(slug))
        return exports.ProjectError.Duplicate;
    if (new Set(draft.memberIds).size !== draft.memberIds.length) {
        return exports.ProjectError.DuplicateMember;
    }
    if (draft.memberIds.some(id => !knownAgentIds.includes(id)))
        return exports.ProjectError.Unknown;
    return undefined;
}
function projectProblemText(problem) {
    switch (problem) {
        case exports.ProjectError.NoName:
            return 'Give it a name.';
        case exports.ProjectError.NoSlug:
            return 'That name has nothing in it a folder can be called. Try adding a word.';
        case exports.ProjectError.Duplicate:
            return 'There is already a project with that name.';
        case exports.ProjectError.DuplicateMember:
            return 'One of those agents is in twice.';
        case exports.ProjectError.Unknown:
        default:
            return 'One of those agents is no longer here.';
    }
}
//# sourceMappingURL=constants.js.map